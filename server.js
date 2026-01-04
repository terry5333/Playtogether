const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 解決 404：指定靜態檔案資料夾為 public
app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};

io.on('connection', (socket) => {
    socket.on('join_room', (data) => {
        const { roomId, username } = data;
        socket.join(roomId);
        socket.roomId = roomId;
        if (!rooms[roomId]) {
            rooms[roomId] = { host: socket.id, players: [], gameStarted: false, winLines: 3 };
        }
        rooms[roomId].players.push({ id: socket.id, name: username });
        io.to(roomId).emit('room_update', rooms[roomId]);
    });

    socket.on('start_game', (data) => {
        const room = rooms[data.roomId];
        if (room && room.host === socket.id) {
            room.gameStarted = true;
            room.winLines = parseInt(data.winLines) || 3;
            io.to(data.roomId).emit('game_begin', { 
                turnId: room.players[0].id, 
                turnName: room.players[0].name,
                winLines: room.winLines 
            });
        }
    });

    socket.on('bingo_click', (data) => {
        io.to(data.roomId).emit('bingo_sync', data.num);
        const room = rooms[data.roomId];
        if (room) {
            const currentIdx = room.players.findIndex(p => p.id === socket.id);
            const nextIdx = (currentIdx + 1) % room.players.length;
            io.to(data.roomId).emit('next_turn', { 
                turnId: room.players[nextIdx].id, 
                turnName: room.players[nextIdx].name 
            });
        }
    });

    // 核心修正：避免無限迴圈導致 502
    socket.on('drawing', (data) => {
        if (data.roomId) {
            socket.to(data.roomId).emit('render_drawing', data);
        }
    });

    socket.on('disconnect', () => {
        if (socket.roomId && rooms[socket.roomId]) {
            rooms[socket.roomId].players = rooms[socket.roomId].players.filter(p => p.id !== socket.id);
            if (rooms[socket.roomId].players.length === 0) delete rooms[socket.roomId];
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`Server running on ${PORT}`));
