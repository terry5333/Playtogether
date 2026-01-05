const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));

let rooms = {};
let gameHistory = []; // 存放歷史戰績

// 廣播給 Admin 的統一函數
function broadcastAdminData() {
    const data = {
        rooms: Object.keys(rooms).map(rid => ({
            id: rid,
            game: rooms[rid].gameType || 'Lobby',
            players: rooms[rid].players.map(p => ({ id: p.id, name: p.name })),
            host: rooms[rid].players.find(p => p.id === rooms[rid].host)?.name || '未知'
        })),
        history: gameHistory
    };
    io.emit('admin_data_update', data);
}

// 記錄戰績
function recordResult(roomId, gameType, winner, detail) {
    gameHistory.unshift({
        time: new Date().toLocaleTimeString(),
        roomId: roomId,
        gameType: gameType,
        winner: winner,
        detail: detail
    });
    if(gameHistory.length > 50) gameHistory.pop(); 
    broadcastAdminData();
}

io.on('connection', (socket) => {
    socket.on('admin_init', () => broadcastAdminData());

    socket.on('create_room', () => {
        const rid = Math.floor(1000 + Math.random() * 9000).toString();
        rooms[rid] = { host: socket.id, players: [], gameType: 'Lobby', turnIdx: 0, bingoReadyCount: 0 };
        socket.emit('room_created', { roomId: rid });
        broadcastAdminData();
    });

    socket.on('join_room', (d) => {
        const r = rooms[d.roomId];
        if (!r) return socket.emit('toast', '❌ 房間不存在');
        socket.join(d.roomId);
        socket.roomId = d.roomId;
        socket.userName = d.username;
        r.players.push({ id: socket.id, name: d.username });
        io.to(d.roomId).emit('room_update', { roomId: d.roomId, players: r.players, hostId: r.host });
        broadcastAdminData();
    });

    socket.on('host_setup_game', (d) => {
        const r = rooms[socket.roomId];
        if (!r || socket.id !== r.host) return;
        r.gameType = d.type === 'draw' ? 'Drawing' : (d.type === 'spy' ? 'Spy Game' : 'Bingo');
        if (d.type === 'draw') {
            r.turnIdx = 0;
            io.to(r.players[0].id).emit('draw_set_word_request');
        } else {
            io.to(r.host).emit(`${d.type}_ask_config`);
        }
        broadcastAdminData();
    });

    // --- 你話我猜 ---
    socket.on('draw_submit_word', (d) => {
        const r = rooms[socket.roomId];
        r.currentWord = d.word;
        io.to(socket.roomId).emit('game_begin', { type: 'draw', drawerId: socket.id, drawerName: d.name, word: d.word });
    });

    socket.on('draw_guess', (d) => {
        const r = rooms[socket.roomId];
        if(r && d.guess === r.currentWord) {
            recordResult(socket.roomId, "你話我猜", d.username, `題目: ${r.currentWord}`);
            io.to(socket.roomId).emit('toast', `🎉 ${d.username} 答對了！`);
            r.gameType = 'Lobby'; 
        }
    });

    // --- 誰是臥底 ---
    socket.on('spy_start_with_config', (d) => {
        const r = rooms[socket.roomId];
        const spyIdx = Math.floor(Math.random() * r.players.length);
        r.players.forEach((p, i) => io.to(p.id).emit('game_begin', { type: 'spy', word: (i===spyIdx)?'水梨':'蘋果' }));
        let sec = parseInt(d.seconds);
        r.timer = setInterval(() => {
            sec--; io.to(socket.roomId).emit('timer_update', sec);
            if(sec<=0){ clearInterval(r.timer); io.to(socket.roomId).emit('start_voting'); }
        }, 1000);
    });

    // --- Bingo ---
    socket.on('bingo_start_with_config', (d) => {
        const r = rooms[socket.roomId];
        r.bingoReadyCount = 0; r.bingoMarked = []; r.turnIdx = 0;
        io.to(socket.roomId).emit('game_begin', { type: 'bingo', goal: d.goal });
    });

    socket.on('bingo_ready', () => {
        const r = rooms[socket.roomId];
        r.bingoReadyCount++;
        if (r.bingoReadyCount === r.players.length) {
            io.to(socket.roomId).emit('bingo_your_turn', { id: r.players[0].id, name: r.players[0].name });
        }
    });

    socket.on('bingo_pick', (d) => {
        const r = rooms[socket.roomId];
        r.bingoMarked.push(d.num);
        io.to(socket.roomId).emit('bingo_sync', { marked: r.bingoMarked });
        r.turnIdx = (r.turnIdx + 1) % r.players.length;
        io.to(socket.roomId).emit('bingo_your_turn', { id: r.players[r.turnIdx].id, name: r.players[r.turnIdx].name });
    });

    socket.on('bingo_win', (d) => {
        const r = rooms[socket.roomId];
        if(r && r.gameType === 'Bingo') {
            recordResult(socket.roomId, "數字賓果", d.name, "達成連線目標");
            io.to(socket.roomId).emit('bingo_game_over', { winner: d.name });
            r.gameType = 'Lobby';
        }
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

server.listen(process.env.PORT || 3000);
