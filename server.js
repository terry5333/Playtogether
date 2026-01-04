const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const rooms = {};
const spyWords = [{ n: "西瓜", s: "木瓜" }, { n: "咖啡", s: "奶茶" }, { n: "手機", s: "平板" }];

io.on('connection', (socket) => {
    socket.on('join_room', (data) => {
        const { roomId, username, gameType } = data;
        socket.join(roomId);
        socket.username = username;
        socket.roomId = roomId;
        if (!rooms[roomId]) {
            rooms[roomId] = { gameType, host: socket.id, players: [], gameStarted: false, turnIdx: 0, currentAnswer: "", timer: null, votes: {} };
        }
        rooms[roomId].players.push({ id: socket.id, name: username });
        io.to(roomId).emit('room_update', rooms[roomId]);
    });

    socket.on('start_game', (data) => {
        const room = rooms[data.roomId];
        if (!room || room.host !== socket.id) return;
        room.gameStarted = true;
        room.votes = {}; 

        if (room.gameType === 'spy') {
            const pair = spyWords[Math.floor(Math.random() * spyWords.length)];
            const spyIdx = Math.floor(Math.random() * room.players.length);
            room.players.forEach((p, i) => {
                io.to(p.id).emit('spy_setup', { word: (i === spyIdx ? pair.s : pair.n), role: (i === spyIdx ? "臥底" : "平民") });
            });

            // 啟動 60 秒自動倒數
            let timeLeft = 60;
            if (room.timer) clearInterval(room.timer);
            room.timer = setInterval(() => {
                timeLeft--;
                io.to(data.roomId).emit('timer_tick', timeLeft);
                if (timeLeft <= 0) {
                    clearInterval(room.timer);
                    io.to(data.roomId).emit('start_voting');
                }
            }, 1000);
        }
        
        const p = room.players[room.turnIdx];
        io.to(data.roomId).emit('game_begin', { turnId: p.id, turnName: p.name, gameType: room.gameType });
    });

    // 處理出題
    socket.on('set_word', (data) => {
        const room = rooms[data.roomId];
        if (room) {
            room.currentAnswer = data.word.trim();
            io.to(data.roomId).emit('topic_locked');
        }
    });

    // 處理投票
    socket.on('cast_vote', (data) => {
        const room = rooms[data.roomId];
        if (room) {
            room.votes[data.targetId] = (room.votes[data.targetId] || 0) + 1;
            io.to(data.roomId).emit('vote_update', room.votes);
        }
    });
});
server.listen(3000, '0.0.0.0');
