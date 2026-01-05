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
    // --- Admin 管理功能 ---
    socket.on('admin_get_all_rooms', () => {
        const roomData = Object.keys(rooms).map(rid => ({
            id: rid,
            gameType: rooms[rid].gameType || 'Lobby',
            hostName: rooms[rid].players.find(p => p.id === rooms[rid].host)?.name || '未知',
            playerCount: rooms[rid].players.length,
            players: rooms[rid].players.map(p => ({ id: p.id, name: p.name }))
        }));
        socket.emit('admin_room_list', roomData);
    });

    socket.on('admin_kick_player', (data) => {
        const room = rooms[data.roomId];
        if (room) {
            io.to(data.playerId).emit('kicked');
            room.players = room.players.filter(p => p.id !== data.playerId);
            io.to(data.roomId).emit('room_update', { roomId: data.roomId, players: room.players, hostId: room.host });
        }
    });

    socket.on('admin_dissolve_room', (rid) => {
        io.to(rid).emit('room_dissolved');
        delete rooms[rid];
    });

    // --- 基礎房間功能 ---
    socket.on('create_room', () => {
        const roomId = Math.floor(1000 + Math.random() * 9000).toString();
        rooms[roomId] = { host: socket.id, players: [], bingoMarked: [], bingoGoal: 3, gameType: 'Lobby' };
        socket.emit('room_created', { roomId });
    });

    socket.on('join_room', (d) => {
        if (!rooms[d.roomId]) return socket.emit('toast', '房間不存在');
        socket.join(d.roomId);
        socket.roomId = d.roomId;
        rooms[d.roomId].players.push({ id: socket.id, name: d.username, score: 0 });
        io.to(d.roomId).emit('room_update', { roomId: d.roomId, players: rooms[d.roomId].players, hostId: rooms[d.roomId].host });
    });

    socket.on('start_game', (d) => {
        const room = rooms[d.roomId];
        if (!room) return;
        room.gameType = d.gameType;
        room.bingoGoal = parseInt(d.goal) || 3;
        room.bingoMarked = [];
        io.to(d.roomId).emit('game_begin', { gameType: d.gameType, goal: room.bingoGoal });
    });

    // Bingo 同步與判定修復
    socket.on('bingo_pick', (d) => {
        const r = rooms[d.roomId];
        if (!r.bingoMarked.includes(parseInt(d.num))) {
            r.bingoMarked.push(parseInt(d.num));
            io.to(d.roomId).emit('bingo_sync', { marked: r.bingoMarked });
        }
    });
});

server.listen(process.env.PORT || 3000);
