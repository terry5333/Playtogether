const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 這行很重要：它告訴伺服器去「public」資料夾找 HTML 檔案
app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};
const spyWordBank = [{ n: "西瓜", s: "木瓜" }, { n: "泡麵", s: "快煮麵" }, { n: "手機", s: "平板" }];

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
        room.turnIdx = 0;

        if (room.gameType === 'spy') {
            const pair = spyWordBank[Math.floor(Math.random() * spyWordBank.length)];
            const spyIdx = Math.floor(Math.random() * room.players.length);
            room.players.forEach((p, i) => {
                io.to(p.id).emit('spy_setup', { word: (i === spyIdx ? pair.s : pair.n), role: (i === spyIdx ? "臥底" : "平民") });
            });
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
        io.to(data.roomId).emit('game_begin', { turnId: room.players[0].id, turnName: room.players[0].name, gameType: room.gameType });
    });

    socket.on('set_word', (data) => { if (rooms[data.roomId]) { rooms[data.roomId].currentAnswer = data.word.trim(); io.to(data.roomId).emit('topic_locked'); } });
    socket.on('bingo_click', (data) => {
        const room = rooms[data.roomId];
        if (room) {
            io.to(data.roomId).emit('bingo_sync', data.num);
            room.turnIdx = (room.turnIdx + 1) % room.players.length;
            io.to(data.roomId).emit('next_turn', { turnId: room.players[room.turnIdx].id, turnName: room.players[room.turnIdx].name });
        }
    });
    socket.on('cast_vote', (data) => {
        const room = rooms[data.roomId];
        if (room) { room.votes[data.targetId] = (room.votes[data.targetId] || 0) + 1; io.to(data.roomId).emit('vote_update', room.votes); }
    });
    socket.on('drawing', (d) => socket.to(d.roomId).emit('render_drawing', d));
    socket.on('disconnect', () => {
        if (socket.roomId && rooms[socket.roomId]) {
            rooms[socket.roomId].players = rooms[socket.roomId].players.filter(p => p.id !== socket.id);
            if (rooms[socket.roomId].players.length === 0) delete rooms[socket.roomId];
            else io.to(socket.roomId).emit('room_update', rooms[socket.roomId]);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`伺服器運行在 http://localhost:${PORT}`));
