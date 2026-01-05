const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" }, transports: ['websocket', 'polling'] });

app.use(express.static(path.join(__dirname, 'public')));

let rooms = {};
const DRAW_WORDS = ["珍珠奶茶", "長頸鹿", "台北101", "漢堡", "鋼琴", "恐龍", "臭豆腐"];
const SPY_PAIRS = [["蘋果", "水梨"], ["洗髮精", "沐浴乳"], ["原子筆", "鉛筆"], ["足球", "籃球"]];

io.on('connection', (socket) => {
    // Admin 數據推送
    socket.on('admin_init', () => {
        const sendUpdate = () => {
            const data = Object.keys(rooms).map(rid => ({
                id: rid, game: rooms[rid].gameType || 'Lobby',
                players: rooms[rid].players.map(p => p.name)
            }));
            socket.emit('admin_data_update', data);
        };
        const timer = setInterval(sendUpdate, 2000);
        socket.on('disconnect', () => clearInterval(timer));
    });

    socket.on('create_room', () => {
        const rid = Math.floor(1000 + Math.random() * 9000).toString();
        rooms[rid] = { host: socket.id, players: [], gameType: 'Lobby' };
        socket.emit('room_created', { roomId: rid });
    });

    socket.on('join_room', (d) => {
        const r = rooms[d.roomId];
        if (!r) return socket.emit('toast', '❌ 房間不存在');
        socket.join(d.roomId);
        socket.roomId = d.roomId;
        r.players.push({ id: socket.id, name: d.username });
        io.to(d.roomId).emit('room_update', { roomId: d.roomId, players: r.players, hostId: r.host });
    });

    socket.on('start_game', (d) => {
        const r = rooms[d.roomId]; if (!r) return;
        r.gameType = d.gameType;

        if (d.gameType === 'draw') {
            const drawer = r.players[Math.floor(Math.random() * r.players.length)];
            const word = DRAW_WORDS[Math.floor(Math.random() * DRAW_WORDS.length)];
            io.to(d.roomId).emit('game_begin', { type: 'draw', drawerId: drawer.id, drawerName: drawer.name, word: word });
        } else if (d.gameType === 'spy') {
            const pair = SPY_PAIRS[Math.floor(Math.random() * SPY_PAIRS.length)];
            const spyIdx = Math.floor(Math.random() * r.players.length);
            r.players.forEach((p, i) => {
                io.to(p.id).emit('game_begin', { type: 'spy', word: (i === spyIdx) ? pair[1] : pair[0] });
            });
        } else {
            io.to(d.roomId).emit('game_begin', { type: 'bingo' });
        }
    });

    socket.on('draw_stroke', (d) => socket.to(socket.roomId).emit('receive_stroke', d));
});

server.listen(process.env.PORT || 3000, '0.0.0.0');
