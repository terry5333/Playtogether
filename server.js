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
            rooms[roomId] = { host: socket.id, players: [], gameStarted: false, currentWord: "" };
        }
        rooms[roomId].players.push({ id: socket.id, name: username });
        io.to(roomId).emit('room_update', rooms[roomId]);
    });

    socket.on('start_game', (data) => {
        const room = rooms[data.roomId];
        if (!room || room.host !== socket.id) return;
        
        room.gameStarted = true;
        if (data.gameType === 'draw') {
            const words = ["蘋果", "珍珠奶茶", "派大星", "蜘蛛人", "馬里奧"];
            room.currentWord = words[Math.floor(Math.random() * words.length)];
            // 隨機選一個畫家
            const drawer = room.players[Math.floor(Math.random() * room.players.length)];
            io.to(data.roomId).emit('game_begin', { gameType: 'draw', turnId: drawer.id });
            io.to(drawer.id).emit('your_word', { word: room.currentWord });
        } else {
            io.to(data.roomId).emit('game_begin', { gameType: data.gameType, settings: data.settings });
        }
    });

    // 你畫我猜：猜題邏輯
    socket.on('submit_guess', (data) => {
        const room = rooms[data.roomId];
        if (!room || data.guess !== room.currentWord) {
            io.to(data.roomId).emit('chat_msg', { user: data.username, text: data.guess });
        } else {
            io.to(data.roomId).emit('draw_success', { winner: data.username, word: room.currentWord });
        }
    });

    socket.on('drawing', (data) => socket.to(data.roomId).emit('drawing', data));

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
