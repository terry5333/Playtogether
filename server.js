const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

let rooms = {};
const ADMIN_KEY = "admin888";

io.on('connection', (socket) => {
    socket.on('create_room', () => {
        const roomId = Math.floor(1000 + Math.random() * 9000).toString();
        rooms[roomId] = {
            host: socket.id, players: [], gameStarted: false, gameType: null,
            config: {}, scores: {}, playerBoards: {}
        };
        socket.emit('room_created', { roomId });
    });

    socket.on('join_room', (data) => {
        const { roomId, username } = data;
        if (!rooms[roomId]) return socket.emit('error_msg', '房間不存在');
        socket.join(roomId);
        socket.roomId = roomId;
        socket.username = username;
        if (!rooms[roomId].players.find(p => p.id === socket.id)) {
            rooms[roomId].players.push({ id: socket.id, name: username });
        }
        io.to(roomId).emit('room_update', { roomId, players: rooms[roomId].players, hostId: rooms[roomId].host });
    });

    // 啟動與分配誰是臥底詞彙
    socket.on('start_game_with_config', (data) => {
        const room = rooms[data.roomId];
        if (!room || room.host !== socket.id) return;
        room.gameType = data.gameType;
        room.config = data.config;

        if (data.gameType === 'spy') {
            const wordPairs = [["蘋果", "水梨"], ["鋼琴", "風琴"], ["漢堡", "三明治"]];
            const pair = wordPairs[Math.floor(Math.random() * wordPairs.length)];
            const spyIdx = Math.floor(Math.random() * room.players.length);
            room.players.forEach((p, idx) => {
                io.to(p.id).emit('game_begin', {
                    gameType: 'spy',
                    word: (idx === spyIdx) ? pair[1] : pair[0],
                    isSpy: (idx === spyIdx),
                    config: data.config
                });
            });
        } else {
            io.to(data.roomId).emit('game_begin', { gameType: data.gameType, config: data.config });
        }
    });

    // 管理員專屬：踢人與解散
    socket.on('admin_kick', (data) => {
        if (data.key !== ADMIN_KEY) return;
        const room = rooms[data.roomId];
        if (room) {
            io.to(data.targetId).emit('admin_msg', '你已被管理員踢出');
            io.sockets.sockets.get(data.targetId)?.leave(data.roomId);
            room.players = room.players.filter(p => p.id !== data.targetId);
            io.to(data.roomId).emit('room_update', { roomId: data.roomId, players: room.players, hostId: room.host });
        }
    });

    socket.on('admin_close_room', (data) => {
        if (data.key !== ADMIN_KEY) return;
        if (rooms[data.roomId]) {
            io.to(data.roomId).emit('admin_msg', '管理員已解散此房間');
            delete rooms[data.roomId];
        }
    });
});

app.get('/admin/full_data', (req, res) => {
    if (req.query.key !== ADMIN_KEY) return res.status(403).send("No");
    res.json(rooms);
});

server.listen(3000);
