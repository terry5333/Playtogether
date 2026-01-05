const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

let rooms = {};

io.on('connection', (socket) => {
    socket.on('join_room', (data) => {
        const { roomId, username } = data;
        socket.join(roomId);
        if (!rooms[roomId]) {
            rooms[roomId] = { host: socket.id, players: [], gameStarted: false, settings: {} };
        }
        rooms[roomId].players.push({ id: socket.id, name: username });
        io.to(roomId).emit('room_update', rooms[roomId]);
    });

    // 痛點 3 & 4：房長按下開始時，帶入連線數或回合數
    socket.on('start_game', (data) => {
        const room = rooms[data.roomId];
        if (!room || room.host !== socket.id) return;
        
        room.gameStarted = true;
        room.settings = data.settings; // 儲存房長的設定
        
        // 如果是誰是臥底，啟動倒數
        if (data.gameType === 'spy') {
            let timeLeft = parseInt(data.settings.spyTime || 60);
            const timer = setInterval(() => {
                timeLeft--;
                io.to(data.roomId).emit('timer_sync', timeLeft);
                if (timeLeft <= 0) {
                    clearInterval(timer);
                    io.to(data.roomId).emit('spy_force_vote'); // 時間到強制投票
                }
            }, 1000);
        }
        
        io.to(data.roomId).emit('game_begin', { 
            gameType: data.gameType, 
            settings: data.settings,
            turnId: room.players[0].id 
        });
    });

    socket.on('bingo_click', (data) => {
        io.to(data.roomId).emit('bingo_sync', data.num);
    });

    socket.on('disconnect', () => {
        // ... 斷線邏輯 ...
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
