const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};

io.on('connection', (socket) => {
    socket.on('join_room', (data) => {
        const { roomId, username, gameType } = data;
        const rId = roomId.trim();
        socket.join(rId);
        socket.username = username;
        socket.currentRoom = rId;

        if (!rooms[rId]) {
            rooms[rId] = {
                gameType, host: socket.id, players: [],
                gameStarted: false, winLines: 3
            };
        }
        rooms[rId].players.push({ id: socket.id, name: username });
        io.to(rId).emit('room_update', rooms[rId]);
    });

    socket.on('start_game', (data) => {
        const room = rooms[data.roomId];
        if (room && room.host === socket.id) {
            room.gameStarted = true;
            room.winLines = data.winLines || 3;
            io.to(data.roomId).emit('game_begin', { winLines: room.winLines });
        }
    });

    // BINGO 數字廣播
    socket.on('bingo_click', (data) => {
        io.to(data.roomId).emit('bingo_sync', data.num);
    });

    // BINGO 勝負判定
    socket.on('bingo_win', (data) => {
        io.to(data.roomId).emit('round_over', { winner: data.name, msg: `連線已達 ${data.lines} 條！` });
    });

    // 你畫我猜繪圖廣播
    socket.on('drawing', (data) => socket.to(data.roomId).emit('render_drawing', data));

    socket.on('send_chat', (data) => {
        io.to(data.roomId).emit('chat_msg', { name: socket.username, msg: data.msg });
    });

    socket.on('disconnect', () => {
        const rId = socket.currentRoom;
        if (rooms[rId]) {
            rooms[rId].players = rooms[rId].players.filter(p => p.id !== socket.id);
            if (rooms[rId].players.length === 0) delete rooms[rId];
            else io.to(rId).emit('room_update', rooms[rId]);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
