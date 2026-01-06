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
    // 檢查 PIN
    socket.on('check_pin', (pin) => {
        db.findOne({ pin: pin }, (err, user) => {
            socket.emit('pin_result', { exists: !!user, user: user });
        });
    });

    // 儲存資料
    socket.on('save_profile', (data) => {
        if (!data || !data.pin) return;
        db.update({ pin: data.pin }, { $set: data }, { upsert: true }, (err) => {
            db.findOne({ pin: data.pin }, (err, user) => {
                socket.emit('auth_success', user);
            });
        });
    });

    // 房間與遊戲邏輯 (略，與前版一致)
    socket.on('create_room', () => {
        const rid = Math.floor(1000 + Math.random() * 9000).toString();
        socket.emit('room_created', rid);
    });
});

server.listen(process.env.PORT || 3000);
