const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};
const spyWords = [{n:"泡麵", s:"快煮麵"}, {n:"珍奶", s:"奶茶"}, {n:"西瓜", s:"木瓜"}];

io.on('connection', (socket) => {
    socket.on('join_room', (data) => {
        const { roomId, username, gameType } = data;
        socket.join(roomId);
        socket.username = username;
        socket.currentRoom = roomId;
        if (!rooms[roomId]) {
            rooms[roomId] = { gameType, host: socket.id, players: [], gameStarted: false, turnIdx: 0, currentAnswer: "" };
        }
        rooms[roomId].players.push({ id: socket.id, name: username });
        io.to(roomId).emit('room_update', rooms[roomId]);
    });

    socket.on('start_game', (data) => {
        const room = rooms[data.roomId];
        if (!room || room.host !== socket.id) return;
        room.gameStarted = true;
        room.turnIdx = 0;

        if (room.gameType === 'bingo') {
            io.to(data.roomId).emit('game_begin', { 
                gameType: 'bingo', 
                winLines: data.winLines,
                turnId: room.players[0].id, 
                turnName: room.players[0].name 
            });
        } else if (room.gameType === 'draw') {
            sendNewDrawRound(data.roomId);
        } else if (room.gameType === 'spy') {
            const pair = spyWords[Math.floor(Math.random() * spyWords.length)];
            const spyIdx = Math.floor(Math.random() * room.players.length);
            room.players.forEach((p, i) => {
                io.to(p.id).emit('receive_spy_word', { word: (i === spyIdx ? pair.s : pair.n), role: (i === spyIdx ? '臥底' : '平民') });
            });
            io.to(data.roomId).emit('game_begin', { gameType: 'spy' });
        }
    });

    function sendNewDrawRound(roomId) {
        const room = rooms[roomId];
        const painter = room.players[room.turnIdx];
        io.to(roomId).emit('new_draw_round', { painterId: painter.id, painterName: painter.name });
    }

    socket.on('bingo_click', (data) => {
        const room = rooms[data.roomId];
        if (room && room.players[room.turnIdx].id === socket.id) {
            io.to(data.roomId).emit('bingo_sync', data.num);
            room.turnIdx = (room.turnIdx + 1) % room.players.length;
            io.to(data.roomId).emit('next_turn', { turnId: room.players[room.turnIdx].id, turnName: room.players[room.turnIdx].name });
        }
    });

    socket.on('drawing', (data) => socket.to(data.roomId).emit('render_drawing', data));
    socket.on('set_word', (data) => { if(rooms[data.roomId]) rooms[data.roomId].currentAnswer = data.word; });
    socket.on('bingo_win', (data) => io.to(data.roomId).emit('round_over', { winner: data.name }));
    socket.on('send_chat', (data) => io.to(data.roomId).emit('chat_msg', { name: socket.username, msg: data.msg }));
});

server.listen(3000, '0.0.0.0');
