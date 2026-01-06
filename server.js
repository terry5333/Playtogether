const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// 路由：進入 Admin 管理後台
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

let memoryDB = {}; 
let rooms = {};
const spyWords = [['蘋果', '梨子'], ['醫生', '護士'], ['火鍋', '燒烤'], ['咖啡', '奶茶']];

io.on('connection', (socket) => {
    // 基礎 PIN 登入
    socket.on('check_pin', (pin) => {
        socket.emit('pin_result', { exists: !!memoryDB[pin], user: memoryDB[pin] });
    });

    socket.on('save_profile', (data) => {
        memoryDB[data.pin] = { ...data, score: memoryDB[data.pin]?.score || 0 };
        socket.userPin = data.pin;
        socket.emit('auth_success', memoryDB[data.pin]);
    });

    // 房間邏輯
    socket.on('create_room', (user) => {
        const rid = Math.floor(1000 + Math.random() * 9000).toString();
        rooms[rid] = { id: rid, hostPin: user.pin, players: [] };
        socket.emit('room_created', rid);
    });

    socket.on('join_room', (data) => {
        const r = rooms[data.roomId];
        if (r) {
            socket.join(data.roomId);
            socket.roomId = data.roomId;
            if (!r.players.find(p => p.pin === data.user.pin)) {
                r.players.push({ ...data.user, socketId: socket.id });
            }
            io.to(data.roomId).emit('room_sync', { room: r, hostPin: r.hostPin });
        }
    });

    // 啟動遊戲設定
    socket.on('confirm_start', (data) => {
        const r = rooms[socket.roomId];
        if (!r) return;

        if (data.mode === 'SPY') {
            const pair = spyWords[Math.floor(Math.random() * spyWords.length)];
            const spyIdx = Math.floor(Math.random() * r.players.length);
            r.players.forEach((p, i) => {
                io.to(p.socketId).emit('game_init', { 
                    type: 'SPY', word: (i === spyIdx ? pair[1] : pair[0]), role: (i === spyIdx ? '臥底' : '平民'), timer: data.val 
                });
            });
        } else if (data.mode === 'BINGO') {
            io.to(socket.roomId).emit('game_init', { type: 'BINGO', targetLines: data.val });
        } else if (data.mode === 'GUESS') {
            io.to(socket.roomId).emit('game_init', { type: 'GUESS', rounds: data.val });
        }
    });
});

server.listen(process.env.PORT || 3000);
