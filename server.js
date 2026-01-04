const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const rooms = {};

io.on('connection', (socket) => {
    socket.on('join_room', (data) => {
        const { roomId, username, gameType } = data;
        socket.join(roomId);
        socket.username = username;
        socket.roomId = roomId;
        if (!rooms[roomId]) {
            rooms[roomId] = { gameType, host: socket.id, players: [], gameStarted: false, turnIdx: 0, winLines: 3 };
        }
        rooms[roomId].players.push({ id: socket.id, name: username });
        io.to(roomId).emit('room_update', rooms[roomId]);
    });

    socket.on('start_game', (data) => {
        const room = rooms[data.roomId];
        if (!room || room.host !== socket.id) return;
        room.gameStarted = true;
        room.winLines = parseInt(data.winLines) || 3;
        
        // 通知所有人遊戲開始，並同步線數
        io.to(data.roomId).emit('game_begin', { 
            gameStarted: true, 
            turnId: room.players[0].id, 
            turnName: room.players[0].name,
            winLines: room.winLines
        });
    });

    socket.on('bingo_click', (data) => {
        const room = rooms[data.roomId];
        if (room && room.gameStarted) {
            io.to(data.roomId).emit('bingo_sync', data.num);
            room.turnIdx = (room.turnIdx + 1) % room.players.length;
            const nextP = room.players[room.turnIdx];
            io.to(data.roomId).emit('next_turn', { turnId: nextP.id, turnName: nextP.name });
        }
    });

    socket.on('bingo_win', (data) => {
        io.to(data.roomId).emit('game_over', { msg: `🏆 ${data.name} 獲勝！` });
    });
});
server.listen(3000, '0.0.0.0');
