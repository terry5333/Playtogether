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
let gameHistory = []; // 儲存歷史戰績

const broadcastAdminUpdate = () => {
    db.find({}).sort({ score: -1 }).exec((err, users) => {
        const roomData = Object.keys(rooms).map(rid => ({
            id: rid,
            players: rooms[rid].players,
            gameType: rooms[rid].gameType
        }));
        // 將每個玩家目前的所在房間標記出來
        const usersWithLocation = users.map(u => {
            const room = roomData.find(r => r.players.some(p => p.pin === u.pin));
            return { ...u, currentRoom: room ? room.id : '大廳' };
        });
        io.emit('admin_full_update', { users: usersWithLocation, rooms: roomData, history: gameHistory });
    });
};

io.on('connection', (socket) => {
    socket.on('check_pin', (pin) => {
        db.findOne({ pin: pin }, (err, user) => socket.emit('pin_result', { exists: !!user, user }));
    });

    // 修正：確保 update 完成後執行回調
    socket.on('save_profile', (data) => {
        db.update({ pin: data.pin }, { $set: { username: data.username, avatar: data.avatar }, $min: { score: 0 } }, { upsert: true }, (err) => {
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
        }
    });

    // 模擬遊戲結束紀錄 (未來你遊戲結束時調用此邏輯)
    socket.on('game_finish_record', (record) => {
        // record 格式: { game: '記憶卡牌', winner: '小明', players: ['小明', '小華'], time: '2023-10-27' }
        gameHistory.unshift(record); 
        if(gameHistory.length > 20) gameHistory.pop(); // 只留前20筆
        broadcastAdminUpdate();
    });

    socket.on('admin_init', () => broadcastAdminUpdate());

    socket.on('disconnect', () => {
        if (socket.roomId && rooms[socket.roomId]) {
            rooms[socket.roomId].players = rooms[socket.roomId].players.filter(p => p.socketId !== socket.id);
            if (rooms[socket.roomId].players.length === 0) delete rooms[socket.roomId];
            broadcastAdminUpdate();
        }
    });
});

server.listen(3000);
