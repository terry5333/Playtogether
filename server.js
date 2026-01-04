const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};
const spyWords = [{n:"泡麵", s:"快煮麵"}, {n:"西瓜", s:"木瓜"}, {n:"炸雞", s:"烤雞"}];

io.on('connection', (socket) => {
    socket.on('join_room', (data) => {
        const { roomId, username, gameType } = data;
        socket.join(roomId);
        socket.username = username;
        socket.currentRoom = roomId;
        if (!rooms[roomId]) {
            rooms[roomId] = { gameType, host: socket.id, players: [], gameStarted: false, turnIdx: 0, votes: {}, roles: {}, currentAnswer: "" };
        }
        rooms[roomId].players.push({ id: socket.id, name: username });
        io.to(roomId).emit('room_update', rooms[roomId]);
    });

    socket.on('start_game', (data) => {
        const room = rooms[data.roomId];
        if (!room || room.host !== socket.id) return;
        room.gameStarted = true;
        
        if (room.gameType === 'draw') {
            const painter = room.players[0];
            io.to(data.roomId).emit('new_draw_round', { painterId: painter.id, painterName: painter.name });
        } else if (room.gameType === 'spy') {
            const pair = spyWords[Math.floor(Math.random() * spyWords.length)];
            const spyIdx = Math.floor(Math.random() * room.players.length);
            room.players.forEach((p, i) => {
                const role = (i === spyIdx ? '臥底' : '平民');
                io.to(p.id).emit('receive_spy_word', { word: (i === spyIdx ? pair.s : pair.n), role });
            });
        }
        io.to(data.roomId).emit('game_begin', { gameType: room.gameType, turnId: room.players[0].id, turnName: room.players[0].name });
    });

    // 你畫我猜專屬：畫線與出題
    socket.on('drawing', (data) => socket.to(data.roomId).emit('render_drawing', data));
    socket.on('set_word', (data) => { if(rooms[data.roomId]) rooms[data.roomId].currentAnswer = data.word; });
    
    // BINGO 專屬
    socket.on('bingo_click', (data) => {
        const room = rooms[data.roomId];
        if (room && room.players[room.turnIdx].id === socket.id) {
            io.to(data.roomId).emit('bingo_sync', data.num);
            room.turnIdx = (room.turnIdx + 1) % room.players.length;
            io.to(data.roomId).emit('next_turn', { turnId: room.players[room.turnIdx].id, turnName: room.players[room.turnIdx].name });
        }
    });

    socket.on('send_chat', (data) => {
        const room = rooms[data.roomId];
        if(room && room.gameType === 'draw' && data.msg === room.currentAnswer) {
            io.to(data.roomId).emit('game_over', { msg: `恭喜 ${socket.username} 猜對了！`, subMsg: `答案就是：${room.currentAnswer}` });
        } else {
            io.to(data.roomId).emit('chat_msg', { name: socket.username, msg: data.msg });
        }
    });

    socket.on('bingo_win', (data) => io.to(data.roomId).emit('game_over', { msg: `獲勝者：${data.name}`, subMsg: "BINGO!" }));
});

server.listen(3000, '0.0.0.0');
