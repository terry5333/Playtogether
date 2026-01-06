const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// 使用內存對象代替資料庫，排除寫入權限導致的卡頓
let memoryDB = {}; 
let rooms = {};

app.use(express.static('public'));

io.on('connection', (socket) => {
    console.log('連線成功:', socket.id);

    // 1. PIN 檢查
    socket.on('check_pin', (pin) => {
        console.log('檢查 PIN:', pin);
        const user = memoryDB[pin];
        socket.emit('pin_result', { exists: !!user, user: user });
    });

    // 2. 儲存資料 (增加超時保護)
    socket.on('save_profile', (data) => {
        console.log('接收儲存請求:', data);
        if (!data.pin) return;

        // 存入內存
        memoryDB[data.pin] = {
            pin: data.pin,
            username: data.username,
            avatar: data.avatar || "🐶",
            score: data.score || 0
        };

        // 立即回傳，不等待任何非同步操作
        socket.emit('auth_success', memoryDB[data.pin]);
        console.log('已發送 auth_success');
    });

    // 3. 房主邏輯
    socket.on('create_room', () => {
        const rid = Math.floor(1000 + Math.random() * 9000).toString();
        rooms[rid] = { id: rid, players: [] };
        socket.emit('room_created', rid);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`系統運行在 ${PORT}`));
