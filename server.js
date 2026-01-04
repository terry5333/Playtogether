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
            rooms[roomId] = { 
                gameType, host: socket.id, players: [], 
                gameStarted: false, turnIdx: 0, votes: {}, roles: {} 
            };
        }
        rooms[roomId].players.push({ id: socket.id, name: username });
        io.to(roomId).emit('room_update', {
            players: rooms[roomId].players,
            host: rooms[roomId].host,
            gameStarted: rooms[roomId].gameStarted,
            gameType: rooms[roomId].gameType
        });
    });

    socket.on('start_game', (data) => {
        const room = rooms[data.roomId];
        if (!room || room.host !== socket.id) return;
        room.gameStarted = true;
        room.turnIdx = 0;

        if (room.gameType === 'bingo') {
            io.to(data.roomId).emit('game_begin', { 
                gameType: 'bingo', 
                winLines: data.winLines || 3,
                turnId: room.players[0].id, 
                turnName: room.players[0].name 
            });
        } else if (room.gameType === 'spy') {
            const pair = spyWords[Math.floor(Math.random() * spyWords.length)];
            const spyIdx = Math.floor(Math.random() * room.players.length);
            room.players.forEach((p, i) => {
                const role = (i === spyIdx ? '臥底' : '平民');
                room.roles[p.id] = { role, name: p.name };
                io.to(p.id).emit('receive_spy_word', { word: (i === spyIdx ? pair.s : pair.n), role });
            });
            io.to(data.roomId).emit('game_begin', { gameType: 'spy' });
        }
    });

    socket.on('bingo_click', (data) => {
        const room = rooms[data.roomId];
        if (room && room.players[room.turnIdx].id === socket.id) {
            io.to(data.roomId).emit('bingo_sync', data.num);
            room.turnIdx = (room.turnIdx + 1) % room.players.length;
            io.to(data.roomId).emit('next_turn', { 
                turnId: room.players[room.turnIdx].id, 
                turnName: room.players[room.turnIdx].name 
            });
        }
    });

    socket.on('send_chat', (data) => {
        io.to(data.roomId).emit('chat_msg', { name: socket.username, msg: data.msg });
    });

    socket.on('bingo_win', (data) => {
        io.to(data.roomId).emit('game_over', { msg: `獲勝者是 ${data.name}`, subMsg: "BINGO! 遊戲結束" });
    });
});

server.listen(3000, '0.0.0.0');
