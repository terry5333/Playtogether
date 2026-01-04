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
        if (!room || room.host !== socket.id) return;
        room.gameStarted = true;
        room.turnIdx = 0;
        io.to(data.roomId).emit('game_begin', { 
            gameType: room.gameType, 
            turnId: room.players[0].id, 
            turnName: room.players[0].name 
        });
    });

    socket.on('bingo_click', (data) => {
        const room = rooms[data.roomId];
        if (room && room.gameStarted && room.players[room.turnIdx].id === socket.id) {
            io.to(data.roomId).emit('bingo_sync', data.num);
            room.turnIdx = (room.turnIdx + 1) % room.players.length;
            io.to(data.roomId).emit('next_turn', { 
                turnId: room.players[room.turnIdx].id, 
                turnName: room.players[room.turnIdx].name 
            });
        }
    });

    socket.on('bingo_win', (data) => io.to(data.roomId).emit('game_over', { msg: `獲勝者：${data.name}`, subMsg: "BINGO!" }));
    socket.on('send_chat', (data) => io.to(data.roomId).emit('chat_msg', { name: socket.username, msg: data.msg }));
});

server.listen(3000, '0.0.0.0');
