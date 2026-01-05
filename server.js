const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" }, transports: ['websocket'] });

app.use(express.static(path.join(__dirname, 'public')));

let rooms = {};
const SPY_PAIRS = [["蘋果", "水梨"], ["洗髮精", "沐浴乳"], ["珍奶", "綠茶"], ["原子筆", "鉛筆"], ["西瓜", "香瓜"]];

io.on('connection', (socket) => {
    socket.on('create_room', () => {
        const roomId = Math.floor(1000 + Math.random() * 9000).toString();
        rooms[roomId] = { host: socket.id, players: [], votes: {} };
        socket.emit('room_created', { roomId });
    });

    socket.on('join_room', (d) => {
        if (!rooms[d.roomId]) return socket.emit('toast', '房間不存在');
        socket.join(d.roomId);
        socket.roomId = d.roomId;
        socket.username = d.username;
        rooms[d.roomId].players.push({ id: socket.id, name: d.username, score: 0, isOut: false, isSpy: false });
        io.to(d.roomId).emit('room_update', { roomId: d.roomId, players: rooms[d.roomId].players, hostId: rooms[d.roomId].host });
    });

    socket.on('start_game', (d) => {
        const room = rooms[d.roomId];
        if (!room) return;
        room.votes = {};
        room.players.forEach(p => p.isOut = false);

        if (d.gameType === 'spy') {
            const pair = SPY_PAIRS[Math.floor(Math.random() * SPY_PAIRS.length)];
            const spyIdx = Math.floor(Math.random() * room.players.length);
            room.players.forEach((p, idx) => {
                p.isSpy = (idx === spyIdx);
                io.to(p.id).emit('game_begin', { gameType: 'spy', word: p.isSpy ? pair[1] : pair[0] });
            });
        }
    });

    socket.on('spy_vote', (d) => {
        const room = rooms[d.roomId];
        room.votes[socket.id] = d.targetId;
        const activeCount = room.players.filter(p => !p.isOut).length;
        if (Object.keys(room.votes).length >= activeCount) {
            const counts = {};
            Object.values(room.votes).forEach(id => counts[id] = (counts[id] || 0) + 1);
            const kickedId = Object.entries(counts).sort((a,b) => b[1] - a[1])[0][0];
            const kickedP = room.players.find(p => p.id === kickedId);
            kickedP.isOut = true;
            io.to(d.roomId).emit('spy_vote_result', { name: kickedP.name, isSpy: kickedP.isSpy });
            room.votes = {};
        }
    });
});
server.listen(process.env.PORT || 3000, '0.0.0.0');
