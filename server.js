const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));

let rooms = {};

io.on('connection', (socket) => {
    // --- 基礎房間與加入 ---
    socket.on('create_room', () => {
        const rid = Math.floor(1000 + Math.random() * 9000).toString();
        rooms[rid] = { host: socket.id, players: [], gameType: 'Lobby', turnIdx: 0, scores: {}, timer: null };
        socket.emit('room_created', { roomId: rid });
    });

    socket.on('join_room', (d) => {
        const r = rooms[d.roomId];
        if (!r) return socket.emit('toast', '❌ 房間不存在');
        socket.join(d.roomId);
        socket.roomId = d.roomId;
        r.players.push({ id: socket.id, name: d.username });
        r.scores[socket.id] = 0;
        io.to(d.roomId).emit('room_update', { roomId: d.roomId, players: r.players, hostId: r.host });
    });

    // --- 遊戲初始詢問 (由房主發起) ---
    socket.on('host_setup_game', (d) => {
        const r = rooms[d.roomId];
        if (d.type === 'draw') {
            // 房主選擇畫畫 -> 通知第一個畫家出題
            r.gameType = 'draw';
            r.turnIdx = 0;
            const drawer = r.players[r.turnIdx];
            io.to(drawer.id).emit('draw_set_word_request');
            io.to(d.roomId).emit('toast', `🎨 等待 ${drawer.name} 出題中...`);
        } else if (d.type === 'spy') {
            // 房主選擇臥底 -> 詢問房主秒數 (前端處理)
            r.gameType = 'spy';
            io.to(r.host).emit('spy_ask_config');
        } else if (d.type === 'bingo') {
            // 房主選擇 Bingo -> 詢問幾條線 (前端處理)
            r.gameType = 'bingo';
            io.to(r.host).emit('bingo_ask_config');
        }
    });

    // --- 1. 你話我猜：自行出題邏輯 ---
    socket.on('draw_submit_word', (d) => {
        const r = rooms[socket.roomId];
        r.currentWord = d.word;
        io.to(socket.roomId).emit('game_begin', { 
            type: 'draw', drawerId: socket.id, drawerName: d.name, turn: r.turnIdx + 1, total: r.players.length 
        });
    });

    // --- 2. 誰是臥底：計時邏輯 ---
    socket.on('spy_start_with_config', (d) => {
        const r = rooms[socket.roomId];
        const SPY_PAIRS = [["蘋果", "水梨"], ["洗髮精", "沐浴乳"]];
        const pair = SPY_PAIRS[Math.floor(Math.random() * SPY_PAIRS.length)];
        const spyIdx = Math.floor(Math.random() * r.players.length);
        r.players.forEach((p, i) => io.to(p.id).emit('game_begin', { type: 'spy', word: (i === spyIdx) ? pair[1] : pair[0] }));
        
        let sec = parseInt(d.seconds);
        r.timer = setInterval(() => {
            sec--;
            io.to(socket.roomId).emit('timer_update', sec);
            if (sec <= 0) { clearInterval(r.timer); io.to(socket.roomId).emit('start_voting', { players: r.players }); }
        }, 1000);
    });

    // --- 3. Bingo：輪流叫號邏輯 ---
    socket.on('bingo_start_with_config', (d) => {
        const r = rooms[socket.roomId];
        r.bingoGoal = d.goal;
        r.bingoMarked = [];
        r.turnIdx = 0;
        r.bingoReadyCount = 0;
        io.to(socket.roomId).emit('game_begin', { type: 'bingo', goal: d.goal });
    });

    socket.on('bingo_ready', () => {
        const r = rooms[socket.roomId];
        r.bingoReadyCount++;
        if (r.bingoReadyCount === r.players.length) {
            sendBingoTurn(socket.roomId);
        } else {
            io.to(socket.roomId).emit('toast', `等待其他玩家填寫... (${r.bingoReadyCount}/${r.players.length})`);
        }
    });

    function sendBingoTurn(rid) {
        const r = rooms[rid];
        const player = r.players[r.turnIdx];
        io.to(rid).emit('bingo_your_turn', { id: player.id, name: player.name });
    }

    socket.on('bingo_pick', (d) => {
        const r = rooms[socket.roomId];
        r.bingoMarked.push(d.num);
        io.to(socket.roomId).emit('bingo_sync', { marked: r.bingoMarked });
        r.turnIdx = (r.turnIdx + 1) % r.players.length;
        sendBingoTurn(socket.roomId);
    });

    socket.on('draw_stroke', (d) => socket.to(socket.roomId).emit('receive_stroke', d));
});

server.listen(process.env.PORT || 3000, '0.0.0.0');
