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
    // 創建房間
    socket.on('create_room', (data) => {
        const roomId = Math.floor(1000 + Math.random() * 9000).toString(); // 生成 4 位數房號
        rooms[roomId] = { host: socket.id, players: [], gameStarted: false, settings: {} };
        socket.emit('room_created', { roomId });
    });

    // 加入房間
    socket.on('join_room', (data) => {
        const { roomId, username } = data;
        if (!rooms[roomId]) return socket.emit('error_msg', '房間不存在');
        
        socket.join(roomId);
        socket.roomId = roomId;
        socket.username = username;
        
        rooms[roomId].players.push({ id: socket.id, name: username });
        io.to(roomId).emit('room_update', rooms[roomId]);
    });

    // 開始遊戲
    socket.on('start_game', (data) => {
        const room = rooms[data.roomId];
        if (!room || room.host !== socket.id) return;
        
        room.gameStarted = true;
        room.settings = data.settings;

        if (data.gameType === 'spy') {
            const time = parseInt(data.settings.spyTime) || 60;
            let timeLeft = time;
            const timer = setInterval(() => {
                timeLeft--;
                io.to(data.roomId).emit('timer_sync', timeLeft);
                if (timeLeft <= 0) {
                    clearInterval(timer);
                    io.to(data.roomId).emit('spy_force_vote');
                }
            }, 1000);
            room.timer = timer;
        }

        io.to(data.roomId).emit('game_begin', { 
            gameType: data.gameType, 
            settings: data.settings,
            players: room.players 
        });
    });

    socket.on('bingo_click', (data) => io.to(data.roomId).emit('bingo_sync', data.num));
    socket.on('drawing', (data) => socket.to(data.roomId).emit('drawing', data));

    socket.on('disconnect', () => {
        if (socket.roomId && rooms[socket.roomId]) {
            rooms[socket.roomId].players = rooms[socket.roomId].players.filter(p => p.id !== socket.id);
            if (rooms[socket.roomId].players.length === 0) {
                if(rooms[socket.roomId].timer) clearInterval(rooms[socket.roomId].timer);
                delete rooms[socket.roomId];
            } else {
                io.to(socket.roomId).emit('room_update', rooms[socket.roomId]);
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
