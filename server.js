const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// 1. 修復 Admin 進入點：輸入 /admin 即可訪問
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

let memoryDB = {}; 
let rooms = {};
const spyWords = [['蘋果', '梨子'], ['醫生', '護士'], ['火鍋', '燒烤'], ['珍珠奶茶', '絲襪奶茶']];

io.on('connection', (socket) => {
    // 基礎登入邏輯
    socket.on('check_pin', (pin) => {
        const u = memoryDB[pin];
        socket.emit('pin_result', { exists: !!u, user: u });
    });

    socket.on('save_profile', (data) => {
        memoryDB[data.pin] = { ...data, score: memoryDB[data.pin]?.score || 0 };
        socket.emit('auth_success', memoryDB[data.pin]);
    });

    // 建立/加入房間 (使用 PIN 鎖定 Host)
    socket.on('create_room', (user) => {
        const rid = Math.floor(1000 + Math.random() * 9000).toString();
        rooms[rid] = { id: rid, hostPin: user.pin, players: [], status: 'LOBBY' };
        socket.emit('room_created', rid);
    });

    socket.on('join_room', (data) => {
        const r = rooms[data.roomId];
        if (r) {
            socket.join(data.roomId);
            socket.roomId = data.roomId;
            socket.userPin = data.user.pin;
            if (!r.players.find(p => p.pin === data.user.pin)) r.players.push({...data.user, socketId: socket.id});
            io.to(data.roomId).emit('room_sync', { room: r, hostPin: r.hostPin });
        }
    });

    // --- 遊戲啟動流程 (設定頁跳轉) ---
    socket.on('confirm_start', (data) => {
        const r = rooms[socket.roomId];
        if (!r || r.hostPin !== socket.userPin) return;

        if (data.mode === 'SPY') {
            const pair = spyWords[Math.floor(Math.random() * spyWords.length)];
            const spyIdx = Math.floor(Math.random() * r.players.length);
            r.players.forEach((p, i) => {
                io.to(p.socketId).emit('game_init', { 
                    type: 'SPY', timer: data.val, role: (i===spyIdx?'臥底':'平民'), word: (i===spyIdx?pair[1]:pair[0]) 
                });
            });
        } 
        else if (data.mode === 'BINGO') {
            io.to(socket.roomId).emit('game_init', { type: 'BINGO', targetLines: data.val });
        }
        else if (data.mode === 'GUESS') {
            io.to(socket.roomId).emit('game_init', { type: 'GUESS', totalRounds: data.val, currentRound: 1 });
        }
    });

    // 遊戲中即時同步 (畫布、投票、喊號)
    socket.on('draw_data', (pos) => socket.to(socket.roomId).emit('on_draw', pos));
    socket.on('bingo_call', (num) => io.to(socket.roomId).emit('on_bingo_call', num));
    
    // 結算與加分
    socket.on('game_win', (points) => {
        if (memoryDB[socket.userPin]) {
            memoryDB[socket.userPin].score += points;
            io.emit('rank_update', Object.values(memoryDB).sort((a,b)=>b.score-a.score).slice(0,5));
        }
    });
});

server.listen(3000);
