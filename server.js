const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 指定靜態檔案路徑，解決 404 問題
app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};

io.on('connection', (socket) => {
    socket.on('join_room', (data) => {
        const { roomId, username, gameType } = data;
        socket.join(roomId);
        socket.roomId = roomId;
        if (!rooms[roomId]) {
            rooms[roomId] = { gameType, host: socket.id, players: [], gameStarted: false, winLines: 3 };
        }
        rooms[roomId].players.push({ id: socket.id, name: username });
        io.to(roomId).emit('room_update', rooms[roomId]);
    });

    socket.on('start_game', (data) => {
        const room = rooms[data.roomId];
        if (!room || room.host !== socket.id) return;
        room.gameStarted = true;
        
        // 分配誰是臥底身分
        if (room.gameType === 'spy') {
            const wordPairs = [["香蕉", "芭樂"], ["電腦", "手機"]];
            const pair = wordPairs[Math.floor(Math.random() * wordPairs.length)];
            const spyIdx = Math.floor(Math.random() * room.players.length);
            room.players.forEach((p, idx) => {
                io.to(p.id).emit('spy_setup', {
                    role: (idx === spyIdx) ? "臥底" : "平民",
                    word: (idx === spyIdx) ? pair[1] : pair[0]
                });
            });
        }
        io.to(data.roomId).emit('game_begin', { 
            turnId: room.players[0].id, 
            winLines: data.winLines 
        });
    });

    // 🏆 關鍵修正：解決 502 當機問題
    socket.on('drawing', (data) => {
        if (data.roomId) {
            socket.to(data.roomId).emit('render_drawing', data);
        }
    });

    socket.on('bingo_click', (data) => {
        io.to(data.roomId).emit('bingo_sync', data.num);
        const room = rooms[data.roomId];
        if (room) {
            const idx = room.players.findIndex(p => p.id === socket.id);
            const nextIdx = (idx + 1) % room.players.length;
            io.to(data.roomId).emit('next_turn', { turnId: room.players[nextIdx].id });
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
server.listen(PORT, '0.0.0.0', () => console.log(`Server live on ${PORT}`));
