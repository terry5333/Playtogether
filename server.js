const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" }, transports: ['websocket'] });

app.use(express.static(path.join(__dirname, 'public')));

let rooms = {};

io.on('connection', (socket) => {
    socket.on('create_room', () => {
        const rid = Math.floor(1000 + Math.random() * 9000).toString();
        rooms[rid] = { host: socket.id, players: [], bingoMarked: [], bingoGoal: 3, gameType: 'Lobby' };
        socket.emit('room_created', { roomId: rid });
    });

    socket.on('join_room', (d) => {
        if (!rooms[d.roomId]) return socket.emit('toast', '❌ 房間不存在');
        socket.join(d.roomId);
        socket.roomId = d.roomId;
        rooms[d.roomId].players.push({ id: socket.id, name: d.username });
        io.to(d.roomId).emit('room_update', { roomId: d.roomId, players: rooms[d.roomId].players, hostId: rooms[d.roomId].host });
    });

    socket.on('start_game', (d) => {
        const r = rooms[d.roomId];
        if (r) {
            r.gameType = d.gameType;
            r.bingoGoal = parseInt(d.goal) || 3;
            r.bingoMarked = [];
            io.to(d.roomId).emit('game_begin', { type: d.gameType, goal: r.bingoGoal });
        }
    });

    socket.on('bingo_pick', (d) => {
        const r = rooms[d.roomId];
        if (r && !r.bingoMarked.includes(parseInt(d.num))) {
            r.bingoMarked.push(parseInt(d.num));
            io.to(d.roomId).emit('bingo_sync', { marked: r.bingoMarked });
        }
    });

    socket.on('disconnect', () => {
        if (socket.roomId && rooms[socket.roomId]) {
            rooms[socket.roomId].players = rooms[socket.roomId].players.filter(p => p.id !== socket.id);
            if (rooms[socket.roomId].players.length === 0) delete rooms[socket.roomId];
            else io.to(socket.roomId).emit('room_update', { roomId: socket.roomId, players: rooms[socket.roomId].players, hostId: rooms[socket.roomId].host });
        }
    });
});

server.listen(process.env.PORT || 3000, '0.0.0.0');
