const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};

io.on('connection', (socket) => {
    socket.on('join_room', (data) => {
        const { roomId, username, gameType } = data;
        socket.join(roomId);
        socket.username = username;
        socket.currentRoom = roomId;

        if (!rooms[roomId]) {
            rooms[roomId] = { gameType, host: socket.id, players: [], gameStarted: false, turnIdx: 0 };
        }
        rooms[roomId].players.push({ id: socket.id, name: username });
        io.to(roomId).emit('room_update', rooms[roomId]);
    });

    socket.on('start_game', (data) => {
        const room = rooms[data.roomId];
        if (room && room.host === socket.id) {
            room.gameStarted = true;
            room.turnIdx = 0; // 從第一個進房的人開始
            io.to(data.roomId).emit('game_begin', { 
                winLines: data.winLines,
                turnId: room.players[room.turnIdx].id,
                turnName: room.players[room.turnIdx].name
            });
        }
    });

    socket.on('bingo_click', (data) => {
        const room = rooms[data.roomId];
        if (!room) return;
        
        // 驗證是否為該玩家的回合
        if (room.players[room.turnIdx].id === socket.id) {
            io.to(data.roomId).emit('bingo_sync', data.num);
            
            // 切換下一位玩家
            room.turnIdx = (room.turnIdx + 1) % room.players.length;
            io.to(data.roomId).emit('next_turn', {
                turnId: room.players[room.turnIdx].id,
                turnName: room.players[room.turnIdx].name
            });
        }
    });

    socket.on('bingo_win', (data) => {
        io.to(data.roomId).emit('round_over', { winner: data.name });
    });

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

server.listen(3000, '0.0.0.0');
