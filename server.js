const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const Datastore = require('nedb');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const db = new Datastore({ filename: 'users.db', autoload: true });
app.use(express.static(path.join(__dirname, 'public')));

let rooms = {};
let gameHistory = []; // 儲存最近 20 場遊戲紀錄

const broadcastAdminUpdate = () => {
    db.find({}).sort({ score: -1 }).exec((err, users) => {
        const roomData = Object.keys(rooms).map(rid => ({
            id: rid,
            players: rooms[rid].players,
            gameType: rooms[rid].gameType || '大廳'
        }));
        
        // 標記玩家位置
        const usersWithStatus = users.map(u => {
            const r = roomData.find(room => room.players.some(p => p.pin === u.pin));
            return { ...u, currentRoom: r ? r.id : '大廳' };
        });

        io.emit('admin_full_update', { 
            users: usersWithStatus, 
            rooms: roomData, 
            history: gameHistory 
        });
    });
};

io.on('connection', (socket) => {
    socket.on('check_pin', (pin) => {
        db.findOne({ pin: pin }, (err, user) => socket.emit('pin_result', { exists: !!user, user }));
    });

    socket.on('save_profile', (data) => {
        // 使用 $set 確保只更新特定欄位，並確保有回調
        db.update({ pin: data.pin }, { $set: { username: data.username, avatar: data.avatar, pin: data.pin }, $min: { score: 0 } }, { upsert: true }, (err) => {
            db.findOne({ pin: data.pin }, (err, user) => {
                socket.emit('auth_success', user);
                broadcastAdminUpdate();
            });
        });
    });

    socket.on('create_room', () => {
        const rid = Math.floor(1000 + Math.random() * 9000).toString();
        rooms[rid] = { id: rid, players: [], gameType: '準備中' };
        socket.emit('room_created', rid);
        broadcastAdminUpdate();
    });

    socket.on('join_room', (data) => {
        const rid = data.roomId;
        if (rooms[rid]) {
            socket.join(rid);
            socket.roomId = rid;
            if (!rooms[rid].players.find(p => p.pin === data.user.pin)) {
                rooms[rid].players.push({ socketId: socket.id, ...data.user });
            }
            io.to(rid).emit('room_update', rooms[rid]);
            broadcastAdminUpdate();
        } else {
            socket.emit('toast', '房間不存在');
        }
    });

    socket.on('admin_init', () => broadcastAdminUpdate());

    // 關閉房間
    socket.on('admin_close_room', (rid) => {
        if (rooms[rid]) {
            io.to(rid).emit('force_leave', '管理員關閉了房間');
            delete rooms[rid];
            broadcastAdminUpdate();
        }
    });

    // 歷史紀錄模擬 (當你之後加入遊戲勝負邏輯時，呼叫此處)
    socket.on('record_game_end', (record) => {
        gameHistory.unshift({ ...record, time: new Date().toLocaleTimeString() });
        if(gameHistory.length > 20) gameHistory.pop();
        broadcastAdminUpdate();
    });

    socket.on('disconnect', () => {
        if (socket.roomId && rooms[socket.roomId]) {
            rooms[socket.roomId].players = rooms[socket.roomId].players.filter(p => p.socketId !== socket.id);
            if (rooms[socket.roomId].players.length === 0) delete rooms[socket.roomId];
            broadcastAdminUpdate();
        }
    });
});

server.listen(3000);
