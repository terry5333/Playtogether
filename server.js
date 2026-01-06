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

// 廣播最新數據給 Admin
const broadcastAdminUpdate = () => {
    db.find({}).sort({ score: -1 }).exec((err, users) => {
        const roomData = Object.keys(rooms).map(rid => ({
            id: rid,
            players: rooms[rid].players,
            gameType: rooms[rid].gameType
        }));
        io.emit('admin_full_update', { users, rooms: roomData });
    });
};

io.on('connection', (socket) => {
    // --- 玩家登入與資料設定 ---
    socket.on('check_pin', (pin) => {
        db.findOne({ pin: pin }, (err, user) => {
            socket.emit('pin_result', { exists: !!user, user });
        });
    });

    socket.on('save_profile', (data) => {
        db.update({ pin: data.pin }, { ...data, score: data.score || 0 }, { upsert: true }, () => {
            db.findOne({ pin: data.pin }, (err, user) => {
                socket.emit('auth_success', user);
                broadcastAdminUpdate();
            });
        });
    });

    // --- 房間系統 ---
    socket.on('create_room', () => {
        const rid = Math.floor(1000 + Math.random() * 9000).toString();
        rooms[rid] = { id: rid, players: [], gameType: '遊戲大廳' };
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
            socket.emit('toast', '❌ 房間不存在');
        }
    });

    // --- Admin 管理功能 ---
    socket.on('admin_init', () => broadcastAdminUpdate());

    socket.on('admin_close_room', (rid) => {
        if (rooms[rid]) {
            io.to(rid).emit('force_leave', '🔴 房間已被管理員關閉');
            delete rooms[rid];
            broadcastAdminUpdate();
        }
    });

    socket.on('admin_kick_player', (data) => {
        if (rooms[data.roomId]) {
            rooms[data.roomId].players = rooms[data.roomId].players.filter(p => p.socketId !== data.socketId);
            io.to(data.socketId).emit('force_leave', '🚫 你已被管理員踢出房間');
            io.to(data.roomId).emit('room_update', rooms[data.roomId]);
            broadcastAdminUpdate();
        }
    });

    socket.on('admin_delete_user', (id) => {
        db.remove({ _id: id }, {}, () => broadcastAdminUpdate());
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
