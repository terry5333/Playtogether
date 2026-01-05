const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));

let rooms = {};
const DRAW_WORDS = ["珍珠奶茶", "長頸鹿", "台北101", "漢堡", "鋼琴", "恐龍", "臭豆腐", "雲霄飛車"];
const SPY_PAIRS = [["蘋果", "水梨"], ["洗髮精", "沐浴乳"], ["原子筆", "鉛筆"], ["足球", "籃球"]];

io.on('connection', (socket) => {
    // --- 房間基礎 ---
    socket.on('create_room', () => {
        const rid = Math.floor(1000 + Math.random() * 9000).toString();
        rooms[rid] = { 
            host: socket.id, players: [], gameType: 'Lobby', 
            turnIdx: 0, scores: {}, bingoMarked: [], timer: null 
        };
        socket.emit('room_created', { roomId: rid });
    });

    socket.on('join_room', (d) => {
        const r = rooms[d.roomId];
        if (!r) return socket.emit('toast', '❌ 房間不存在');
        socket.join(d.roomId);
        socket.roomId = d.roomId;
        r.players.push({ id: socket.id, name: d.username });
        r.scores[socket.id] = 0; // 初始化分數
        io.to(d.roomId).emit('room_update', { roomId: d.roomId, players: r.players, hostId: r.host });
    });

    // --- 遊戲切換控制 ---
    socket.on('start_game', (d) => {
        const r = rooms[d.roomId]; if (!r) return;
        r.gameType = d.gameType;
        r.turnIdx = 0;

        if (d.gameType === 'draw') {
            startDrawTurn(d.roomId);
        } else if (d.gameType === 'spy') {
            startSpyGame(d.roomId);
        } else if (d.gameType === 'bingo') {
            r.bingoMarked = [];
            io.to(d.roomId).emit('game_begin', { type: 'bingo' });
        }
    });

    // --- 1. 你話我猜：輪流與計分 ---
    function startDrawTurn(rid) {
        const r = rooms[rid];
        if (r.turnIdx >= r.players.length) {
            return io.to(rid).emit('game_over', { scores: r.scores, players: r.players });
        }
        const drawer = r.players[r.turnIdx];
        r.currentWord = DRAW_WORDS[Math.floor(Math.random() * DRAW_WORDS.length)];
        io.to(rid).emit('game_begin', { 
            type: 'draw', drawerId: drawer.id, drawerName: drawer.name, 
            word: r.currentWord, turn: r.turnIdx + 1, total: r.players.length 
        });
    }

    socket.on('draw_guess', (d) => {
        const r = rooms[socket.roomId];
        if (r && d.guess === r.currentWord) {
            r.scores[socket.id] += 10; // 猜對者加分
            r.scores[r.players[r.turnIdx].id] += 5; // 畫家也有辛苦分
            io.to(socket.roomId).emit('toast', `🎉 ${d.username} 答對了！答案是 [${r.currentWord}]`);
            r.turnIdx++;
            setTimeout(() => startDrawTurn(socket.roomId), 2000);
        }
    });

    // --- 2. 誰是臥底：計時投票 ---
    function startSpyGame(rid) {
        const r = rooms[rid];
        const pair = SPY_PAIRS[Math.floor(Math.random() * SPY_PAIRS.length)];
        const spyIdx = Math.floor(Math.random() * r.players.length);
        r.players.forEach((p, i) => {
            io.to(p.id).emit('game_begin', { type: 'spy', word: (i === spyIdx) ? pair[1] : pair[0] });
        });
        
        // 60秒後自動開啟投票介面
        let timeLeft = 60;
        r.timer = setInterval(() => {
            timeLeft--;
            io.to(rid).emit('timer_update', timeLeft);
            if (timeLeft <= 0) {
                clearInterval(r.timer);
                io.to(rid).emit('start_voting', { players: r.players });
            }
        }, 1000);
    }

    // --- 3. Bingo 邏輯 ---
    socket.on('bingo_pick', (d) => {
        const r = rooms[socket.roomId];
        if (r && !r.bingoMarked.includes(d.num)) {
            r.bingoMarked.push(d.num);
            io.to(socket.roomId).emit('bingo_sync', { marked: r.bingoMarked });
        }
    });

    socket.on('draw_stroke', (d) => socket.to(socket.roomId).emit('receive_stroke', d));
});

server.listen(process.env.PORT || 3000, '0.0.0.0');
