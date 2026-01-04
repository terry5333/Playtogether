const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};
// 臥底詞庫
const spyWords = [
  { normal: "珍珠奶茶", spy: "絲襪奶茶" },
  { normal: "炸雞", spy: "烤雞" },
  { normal: "筆記型電腦", spy: "平板電腦" },
  { normal: "游泳", spy: "潛水" },
  { normal: "公車", spy: "捷運" }
];

io.on('connection', (socket) => {
    socket.on('join_room', (data) => {
        const { roomId, username, gameType } = data;
        socket.join(roomId);
        socket.username = username;
        socket.currentRoom = roomId;

        if (!rooms[roomId]) {
            rooms[roomId] = { gameType, host: socket.id, players: [], gameStarted: false };
        }
        rooms[roomId].players.push({ id: socket.id, name: username });
        io.to(roomId).emit('room_update', rooms[roomId]);
    });

    socket.on('start_game', (data) => {
        const room = rooms[data.roomId];
        if (!room || room.host !== socket.id) return;
        room.gameStarted = true;

        if (room.gameType === 'bingo') {
            io.to(data.roomId).emit('game_begin', { winLines: data.winLines });
        } else if (room.gameType === 'spy') {
            const pair = spyWords[Math.floor(Math.random() * spyWords.length)];
            const spyIdx = Math.floor(Math.random() * room.players.length);
            room.players.forEach((p, idx) => {
                const word = (idx === spyIdx) ? pair.spy : pair.normal;
                io.to(p.id).emit('receive_spy_word', { word, role: (idx === spyIdx ? '臥底' : '平民') });
            });
            io.to(data.roomId).emit('game_begin', {});
        } else {
            io.to(data.roomId).emit('game_begin', {});
        }
    });

    socket.on('bingo_click', (data) => io.to(data.roomId).emit('bingo_sync', data.num));
    socket.on('bingo_win', (data) => io.to(data.roomId).emit('round_over', { winner: data.name, msg: `達成 ${data.lines} 條線連線！` }));
    socket.on('drawing', (data) => socket.to(data.roomId).emit('render_drawing', data));
    socket.on('send_chat', (data) => io.to(data.roomId).emit('chat_msg', { name: socket.username, msg: data.msg }));

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
