const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};
const spyWords = [{n:"泡麵", s:"快煮麵"}, {n:"珍奶", s:"奶茶"}, {n:"西瓜", s:"木瓜"}, {n:"炸雞", s:"烤雞"}];

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

        if (room.gameType === 'spy') {
            const pair = spyWords[Math.floor(Math.random() * spyWords.length)];
            const spyIdx = Math.floor(Math.random() * room.players.length);
            room.players.forEach((p, i) => {
                io.to(p.id).emit('receive_spy_word', { word: (i === spyIdx ? pair.s : pair.n), role: (i === spyIdx ? '臥底' : '平民') });
            });
            // 60秒倒數
            let count = 60;
            const timer = setInterval(() => {
                count--;
                io.to(data.roomId).emit('timer_update', count);
                if (count <= 0) { clearInterval(timer); io.to(data.roomId).emit('start_voting'); }
            }, 1000);
        } else if (room.gameType === 'draw') {
            const painter = room.players[0];
            io.to(data.roomId).emit('new_draw_round', { painterId: painter.id, painterName: painter.name });
        }
        io.to(data.roomId).emit('game_begin', { gameType: room.gameType });
    });

    socket.on('cast_vote', (data) => {
        io.to(data.roomId).emit('chat_msg', { name: "系統", msg: `📢 ${socket.username} 投給了 ${data.targetName}` });
    });

    socket.on('drawing', (data) => socket.to(data.roomId).emit('render_drawing', data));
    socket.on('set_word', (data) => { if(rooms[data.roomId]) rooms[data.roomId].currentAnswer = data.word; });
    socket.on('send_chat', (data) => {
        const room = rooms[data.roomId];
        if (room && room.gameType === 'draw' && data.msg === room.currentAnswer) {
            io.to(data.roomId).emit('round_over', { winner: socket.username });
        } else {
            io.to(data.roomId).emit('chat_msg', { name: socket.username, msg: data.msg });
        }
    });
});

server.listen(3000, '0.0.0.0');
