const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const Datastore = require('nedb');
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const db = new Datastore({ filename: 'users.db', autoload: true });

app.use(express.static('public'));

io.on('connection', (socket) => {
    // 1. PIN 檢查邏輯
    socket.on('check_pin', (pin) => {
        db.findOne({ pin: pin }, (err, user) => {
            socket.emit('pin_result', { exists: !!user, user: user });
        });
    });

    // 2. 儲存個人資料 (確保回調機制)
    socket.on('save_profile', (data) => {
        if (!data || !data.pin) return;
        db.update({ pin: data.pin }, { $set: data }, { upsert: true }, (err) => {
            db.findOne({ pin: data.pin }, (err, user) => {
                socket.emit('auth_success', user);
            });
        });
    });

    // 3. 創建與加入房間
    socket.on('create_room', () => {
        const rid = Math.floor(1000 + Math.random() * 9000).toString();
        socket.emit('room_created', rid);
    });

    socket.on('join_room', (data) => {
        socket.join(data.roomId);
        socket.emit('room_update', { id: data.roomId });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('伺服器啟動完成'));
