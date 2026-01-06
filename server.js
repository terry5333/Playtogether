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

io.on('connection', (socket) => {
    // --- 4位數密碼登入邏輯 ---
    socket.on('auth_action', (d) => {
        // 使用 4 位數密碼作為唯一識別碼
        db.findOne({ pin: d.pin }, (err, user) => {
            if (user) {
                // 已存在的用戶，直接登入
                socket.emit('auth_success', user);
            } else {
                // 新用戶，使用 pin 建立帳號，名稱預設為 "玩家"+pin
                const newUser = { 
                    pin: d.pin, 
                    username: `玩家${d.pin}`, 
                    avatar: d.avatar, 
                    score: 0 
                };
                db.insert(newUser, (err, doc) => {
                    socket.emit('auth_success', doc);
                });
            }
            db.find({}).sort({ score: -1 }).limit(10).exec((err, docs) => io.emit('leaderboard_update', docs));
        });
    });

    // 獲取個人檔案
    socket.on('admin_get_user_profile', (pin) => {
        db.findOne({ pin: pin }, (err, user) => {
            if (user) socket.emit('admin_receive_profile', user);
        });
    });

    // 房間邏輯 (同前)
    socket.on('create_room', () => {
        const rid = Math.floor(1000 + Math.random() * 9000).toString();
        rooms[rid] = { host: socket.id, players: [], gameType: 'Lobby' };
        socket.emit('room_created', { roomId: rid });
    });

    socket.on('join_room', (d) => {
        if (!rooms[d.roomId]) return socket.emit('toast', '❌ 房間不存在');
        socket.join(d.roomId);
        socket.roomId = d.roomId;
        rooms[d.roomId].players.push({ id: socket.id, ...d.user });
        io.to(d.roomId).emit('room_update', { roomId: d.roomId, players: rooms[d.roomId].players, hostId: rooms[d.roomId].host });
    });

    socket.on('disconnect', () => {
        if (socket.roomId && rooms[socket.roomId]) {
            rooms[socket.roomId].players = rooms[socket.roomId].players.filter(p => p.id !== socket.id);
            if (rooms[socket.roomId].players.length === 0) delete rooms[socket.roomId];
        }
    });
});

server.listen(3000);
