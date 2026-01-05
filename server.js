const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

let rooms = {};
const ADMIN_KEY = "admin123";

io.on('connection', (socket) => {
    socket.on('join_room', (data) => {
        const { roomId, username } = data;
        socket.join(roomId);
        socket.username = username;
        socket.roomId = roomId;

        if (!rooms[roomId]) {
            rooms[roomId] = { host: socket.id, players: [], gameStarted: false, gameType: "", settings: {} };
        }
        rooms[roomId].players.push({ id: socket.id, name: username });
        io.to(roomId).emit('room_update', rooms[roomId]);
    });

    socket.on('start_game', (data) => {
        const room = rooms[data.roomId];
        if (!room || room.host !== socket.id) return;
        room.gameStarted = true;
        room.gameType = data.gameType;
        room.settings = data.settings;

        if (data.gameType === 'spy') {
            // 臥底邏輯：分配詞彙
            const pairs = [["香蕉", "芭樂"], ["鋼琴", "小提琴"], ["電腦", "平板"]];
            const pair = pairs[Math.floor(Math.random() * pairs.length)];
            const spyIdx = Math.floor(Math.random() * room.players.length);
            room.players.forEach((p, i) => {
                io.to(p.id).emit('spy_setup', { word: i === spyIdx ? pair[1] : pair[0] });
            });
            // 啟動倒數
            let timeLeft = parseInt(data.settings.spyTime || 60);
            const timer = setInterval(() => {
                timeLeft--;
                io.to(data.roomId).emit('timer_sync', timeLeft);
                if (timeLeft <= 0) {
                    clearInterval(timer);
                    io.to(data.roomId).emit('spy_force_vote');
                }
            }, 1000);
        }
        io.to(data.roomId).emit('game_begin', { gameType: data.gameType, hostId: room.host });
    });

    socket.on('bingo_click', (data) => io.to(data.roomId).emit('bingo_sync', data.num));
    socket.on('drawing', (data) => socket.to(data.roomId).emit('drawing', data));
    socket.on('submit_guess', (data) => io.to(data.roomId).emit('chat_msg', data));
    
    socket.on('disconnect', () => {
        if (socket.roomId && rooms[socket.roomId]) {
            rooms[socket.roomId].players = rooms[socket.roomId].players.filter(p => p.id !== socket.id);
            if (rooms[socket.roomId].players.length === 0) delete rooms[socket.roomId];
            else io.to(socket.roomId).emit('room_update', rooms[socket.roomId]);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
