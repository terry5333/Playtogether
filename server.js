const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" }, transports: ['websocket', 'polling'] });

app.use(express.static(path.join(__dirname, 'public')));

let rooms = {};
const WORDS = ["珍珠奶茶", "長頸鹿", "漢堡", "鋼琴", "101大樓", "咖啡", "草莓", "恐龍"];
const SPY_PAIRS = [["蘋果", "水梨"], ["洗髮精", "沐浴乳"], ["西瓜", "香瓜"]];

io.on('connection', (socket) => {
    // --- Admin 專屬通訊 ---
    socket.on('admin_init', () => {
        const sendUpdate = () => {
            const data = Object.keys(rooms).map(rid => ({
                id: rid,
                game: rooms[rid].gameType || 'Lobby',
                host: rooms[rid].players.find(p => p.id === rooms[rid].host)?.name || '未知',
                players: rooms[rid].players.map(p => ({ id: p.id, name: p.name }))
            }));
            socket.emit('admin_data_update', data);
        };
        sendUpdate();
        const timer = setInterval(sendUpdate, 2000); // 每2秒自動推送最新數據
        socket.on('disconnect', () => clearInterval(timer));
    });

    socket.on('admin_action_kill', (rid) => {
        io.to(rid).emit('room_terminated');
        delete rooms[rid];
    });

    socket.on('admin_action_kick', (d) => {
        const r = rooms[d.rid];
        if(r) {
            io.to(d.pid).emit('room_terminated');
            r.players = r.players.filter(p => p.id !== d.pid);
            io.to(d.rid).emit('room_update', { roomId: d.rid, players: r.players, hostId: r.host });
        }
    });

    // --- 玩家房間邏輯 ---
    socket.on('create_room', () => {
        const rid = Math.floor(1000 + Math.random() * 9000).toString();
        rooms[rid] = { host: socket.id, players: [], bingoMarked: [], gameType: 'Lobby' };
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
        r.bingoMarked = [];
        if (d.gameType === 'draw') {
            const drawer = r.players[Math.floor(Math.random() * r.players.length)];
            r.currentWord = WORDS[Math.floor(Math.random() * WORDS.length)];
            io.to(d.roomId).emit('game_begin', { type: 'draw', drawerId: drawer.id, drawerName: drawer.name, word: r.currentWord });
        } else if (d.gameType === 'spy') {
            const pair = SPY_PAIRS[Math.floor(Math.random() * SPY_PAIRS.length)];
            const spyIdx = Math.floor(Math.random() * r.players.length);
            r.players.forEach((p, i) => io.to(p.id).emit('game_begin', { type: 'spy', word: i === spyIdx ? pair[1] : pair[0] }));
        } else {
            io.to(d.roomId).emit('game_begin', { type: 'bingo' });
        }
    });

    socket.on('draw_stroke', (d) => socket.to(socket.roomId).emit('receive_stroke', d));
    socket.on('bingo_pick', (d) => {
        const r = rooms[socket.roomId];
        if (r && !r.bingoMarked.includes(d.num)) {
            r.bingoMarked.push(d.num);
            io.to(socket.roomId).emit('bingo_sync', { marked: r.bingoMarked });
        }
    });
});

server.listen(process.env.PORT || 3000, '0.0.0.0');
