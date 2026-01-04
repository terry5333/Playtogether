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
                gameType, 
                host: socket.id, 
                players: [], 
                gameStarted: false, 
                votes: {}, 
                roles: {} 
            };
        }
        rooms[roomId].players.push({ id: socket.id, name: username });
        // 每次有人加入，更新房主權限
        io.to(roomId).emit('room_update', {
            players: rooms[roomId].players,
            host: rooms[roomId].host,
            gameStarted: rooms[roomId].gameStarted
        });
    });

    socket.on('start_game', (data) => {
        const room = rooms[data.roomId];
        if (!room) return;
        // 只要是房主發出的請求才執行
        if (room.host !== socket.id) return;

        room.gameStarted = true;
        room.votes = {};

        if (room.gameType === 'spy') {
            const pair = spyWords[Math.floor(Math.random() * spyWords.length)];
            const spyIdx = Math.floor(Math.random() * room.players.length);
            room.players.forEach((p, i) => {
                const role = (i === spyIdx ? '臥底' : '平民');
                const word = (i === spyIdx ? pair.s : pair.n);
                room.roles[p.id] = { role, name: p.name };
                io.to(p.id).emit('receive_spy_word', { word, role });
            });
            
            // 60秒倒數計時
            let count = 60;
            const timer = setInterval(() => {
                count--;
                io.to(data.roomId).emit('timer_update', count);
                if (count <= 0) {
                    clearInterval(timer);
                    io.to(data.roomId).emit('start_voting');
                }
            }, 1000);
        }
        io.to(data.roomId).emit('game_begin', { gameType: room.gameType });
    });

    socket.on('cast_vote', (data) => {
        const room = rooms[data.roomId];
        if (room && !room.votes[socket.id]) {
            room.votes[socket.id] = data.targetId;
            io.to(data.roomId).emit('chat_msg', { name: "系統", msg: `${socket.username} 已投票` });
            
            if (Object.keys(room.votes).length === room.players.length) {
                // 計票邏輯...
                const counts = {};
                Object.values(room.votes).forEach(id => counts[id] = (counts[id] || 0) + 1);
                const maxId = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
                const target = room.roles[maxId];
                const winMsg = (target.role === '臥底') ? "🎉 平民勝利！" : "💀 臥底勝利！";
                io.to(data.roomId).emit('game_over', { msg: `最高票是 ${target.name} (${target.role})`, subMsg: winMsg });
            }
        }
    });

    socket.on('send_chat', (data) => {
        io.to(data.roomId).emit('chat_msg', { name: socket.username, msg: data.msg });
    });
});

server.listen(3000, '0.0.0.0');
