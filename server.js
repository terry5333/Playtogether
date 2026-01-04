const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 讓 Express 讀取前端網頁檔案
app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
    console.log('玩家連線：', socket.id);

    // 加入房間
    socket.on('join_room', (roomId) => {
        socket.join(roomId);
        console.log(`玩家 ${socket.id} 加入房間: ${roomId}`);
    });

    // 傳遞遊戲動作
    socket.on('game_move', (data) => {
        // 將動作發送給同一個房間的其他玩家
        socket.to(data.roomId).emit('receive_move', data);
    });

    socket.on('disconnect', () => {
        console.log('玩家離線');
    });
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`伺服器已啟動：http://localhost:${PORT}`);
});
