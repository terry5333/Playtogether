const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));

let rooms = {};

// 統一 Admin 廣播
function broadcastAdminData() {
    const data = Object.keys(rooms).map(rid => ({
        id: rid,
        game: rooms[rid].gameType || 'Lobby',
        players: rooms[rid].players.map(p => ({ id: p.id, name: p.name })),
        host: rooms[rid].players.find(p => p.id === rooms[rid].host)?.name || '未知'
    }));
    io.emit('admin_data_update', data);
}

io.on('connection', (socket) => {
    socket.on('admin_init', () => broadcastAdminData());

    socket.on('create_room', () => {
        const rid = Math.floor(1000 + Math.random() * 9000).toString();
        rooms[rid] = { host: socket.id, players: [], gameType: 'Lobby', turnIdx: 0, scores: {}, bingoReadyCount: 0 };
        socket.emit('room_created', { roomId: rid });
        broadcastAdminData();
    });

    socket.on('join_room', (d) => {
        const r = rooms[d.roomId];
        if (!r) return socket.emit('toast', '❌ 房間不存在');
        socket.join(d.roomId);
        socket.roomId = d.roomId;
        r.players.push({ id: socket.id, name: d.username });
        r.scores[socket.id] = 0;
        io.to(d.roomId).emit('room_update', { roomId: d.roomId, players: r.players, hostId: r.host });
        broadcastAdminData();
    });

    // --- 重點：修復遊戲啟動邏輯 ---
    socket.on('host_setup_game', (d) => {
        const r = rooms[socket.roomId];
        if (!r || socket.id !== r.host) return;

        if (d.type === 'draw') {
            r.gameType = 'Drawing';
            r.turnIdx = 0;
            const drawer = r.players[r.turnIdx];
            io.to(drawer.id).emit('draw_set_word_request');
            io.to(socket.roomId).emit('toast', `🎨 等待 ${drawer.name} 出題...`);
        } else if (d.type === 'spy') {
            r.gameType = 'Spy Game';
            io.to(r.host).emit('spy_ask_config');
        } else if (d.type === 'bingo') {
            r.gameType = 'Bingo';
            io.to(r.host).emit('bingo_ask_config');
        }
        broadcastAdminData();
    });

    // --- 你話我猜：出題與同步 ---
    socket.on('draw_submit_word', (d) => {
        const r = rooms[socket.roomId];
        r.currentWord = d.word;
        io.to(socket.roomId).emit('game_begin', { 
            type: 'draw', drawerId: socket.id, drawerName: d.name, turn: r.turnIdx + 1, total: r.players.length, word: d.word 
        });
    });

    // --- 誰是臥底：計時啟動 ---
    socket.on('spy_start_with_config', (d) => {
        const r = rooms[socket.roomId];
        const SPY_PAIRS = [["蘋果", "水梨"], ["洗髮精", "沐浴乳"], ["西瓜", "香瓜"]];
        const pair = SPY_PAIRS[Math.floor(Math.random() * SPY_PAIRS.length)];
        const spyIdx = Math.floor(Math.random() * r.players.length);
        r.players.forEach((p, i) => {
            io.to(p.id).emit('game_begin', { type: 'spy', word: (i === spyIdx) ? pair[1] : pair[0] });
        });
        let sec = parseInt(d.seconds);
        if(r.timer) clearInterval(r.timer);
        r.timer = setInterval(() => {
            sec--;
            io.to(socket.roomId).emit('timer_update', sec);
            if (sec <= 0) { clearInterval(r.timer); io.to(socket.roomId).emit('start_voting', { players: r.players }); }
        }, 1000);
    });

    // --- Bingo：輪流邏輯 ---
    socket.on('bingo_start_with_config', (d) => {
        const r = rooms[socket.roomId];
        r.bingoReadyCount = 0;
        r.bingoMarked = [];
        r.turnIdx = 0;
        io.to(socket.roomId).emit('game_begin', { type: 'bingo', goal: d.goal });
    });

    socket.on('bingo_ready', () => {
        const r = rooms[socket.roomId];
        r.bingoReadyCount++;
        if (r.bingoReadyCount === r.players.length) {
            const player = r.players[r.turnIdx];
            io.to(socket.roomId).emit('bingo_your_turn', { id: player.id, name: player.name });
        }
    });

    socket.on('bingo_pick', (d) => {
        const r = rooms[socket.roomId];
        r.bingoMarked.push(d.num);
        io.to(socket.roomId).emit('bingo_sync', { marked: r.bingoMarked });
        r.turnIdx = (r.turnIdx + 1) % r.players.length;
        const player = r.players[r.turnIdx];
        io.to(socket.roomId).emit('bingo_your_turn', { id: player.id, name: player.name });
    });

    socket.on('draw_stroke', (d) => socket.to(socket.roomId).emit('receive_stroke', d));
    
    socket.on('disconnect', () => {
        if (socket.roomId && rooms[socket.roomId]) {
            rooms[socket.roomId].players = rooms[socket.roomId].players.filter(p => p.id !== socket.id);
            if (rooms[socket.roomId].players.length === 0) delete rooms[socket.roomId];
            broadcastAdminData();
        }
    });
});

server.listen(process.env.PORT || 3000, '0.0.0.0');
