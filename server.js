const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const Datastore = require('nedb');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const db = new Datastore({ filename: 'users.db', autoload: true });

app.use(express.static('public'));

let rooms = {};

// 所有的事件都必須包在這個 io.on('connection') 裡面！
io.on('connection', (socket) => {
    console.log('玩家連線:', socket.id);

    // 1. PIN 檢查
    socket.on('check_pin', (pin) => {
        db.findOne({ pin }, (err, user) => {
            socket.emit('pin_result', { exists: !!user, user });
        });
    });

    // 2. 儲存設定 (就是這段之前放錯位置了)
    socket.on('save_profile', (data) => {
        db.update({ pin: data.pin }, { $set: data }, { upsert: true }, () => {
            db.findOne({ pin: data.pin }, (err, user) => {
                socket.emit('auth_success', user);
            });
        });
    });

    // 3. 創建房間
    socket.on('create_room', () => {
        const rid = Math.floor(1000 + Math.random() * 9000).toString();
        rooms[rid] = { id: rid, players: [], status: 'LOBBY', host: socket.id };
        socket.emit('room_created', rid);
    });

    // 4. 加入房間
    socket.on('join_room', (data) => {
        const rid = data.roomId;
        if (rooms[rid]) {
            socket.join(rid);
            socket.roomId = rid;
            if (!rooms[rid].players.find(p => p.pin === data.user.pin)) {
                rooms[rid].players.push({ ...data.user, socketId: socket.id });
            }
            io.to(rid).emit('room_update', rooms[rid]);
        }
    });

    // 5. 遊戲參數與啟動
    socket.on('start_game_config', (config) => {
        const r = rooms[socket.roomId];
        if (!r) return;
        r.config = config;
        r.status = 'PLAYING';
        io.to(socket.roomId).emit('init_game', config);
    });

    // 6. 斷線處理
    socket.on('disconnect', () => {
        if (socket.roomId && rooms[socket.roomId]) {
            rooms[socket.roomId].players = rooms[socket.roomId].players.filter(p => p.socketId !== socket.id);
            if (rooms[socket.roomId].players.length === 0) delete rooms[socket.roomId];
        }
    });
}); // 這裡才是 io.on 的結尾

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`伺服器運行在 port ${PORT}`);
});
