const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let memoryDB = {}; // { pin: { username, avatar, score } }
let rooms = {};

// 遊戲資料
const spyWords = [['蘋果', '梨子'], ['醫生', '護士'], ['火鍋', '燒烤']];
const cardIcons = ['🐶', '🐱', '🦊', '🐷', '🐵', '🐨', '🐸', '🦁'];

// 獲取排行榜
function getLeaderboard() {
    return Object.values(memoryDB)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5); // 取前五名
}

io.on('connection', (socket) => {
    // 登入
    socket.on('check_pin', (pin) => {
        const user = memoryDB[pin];
        socket.emit('pin_result', { exists: !!user, user: user });
    });

    socket.on('save_profile', (data) => {
        if (!memoryDB[data.pin]) {
            memoryDB[data.pin] = { ...data, score: 0 };
        }
        socket.emit('auth_success', memoryDB[data.pin]);
        io.emit('update_leaderboard', getLeaderboard());
    });

    // 建立房間
    socket.on('create_room', () => {
        const rid = Math.floor(1000 + Math.random() * 9000).toString();
        rooms[rid] = { id: rid, players: [], status: 'LOBBY' };
        socket.emit('room_created', rid);
    });

    // 加入房間
    socket.on('join_room', (data) => {
        const rid = data.roomId;
        if (rooms[rid]) {
            socket.join(rid);
            socket.roomId = rid;
            socket.pin = data.user.pin;
            if (!rooms[rid].players.find(p => p.pin === data.user.pin)) {
                rooms[rid].players.push({ ...data.user, socketId: socket.id });
            }
            io.to(rid).emit('room_update', rooms[rid]);
        }
    });

    // 遊戲勝出加分
    socket.on('game_win', (data) => {
        const user = memoryDB[socket.pin];
        if (user) {
            user.score += (data.points || 10);
            socket.emit('auth_success', user); // 更新個人客戶端積分
            io.emit('update_leaderboard', getLeaderboard()); // 更新全域排行
            io.to(socket.roomId).emit('game_over', { winner: user.username });
        }
    });

    // 遊戲啟動與同步邏輯...
    socket.on('start_game', (config) => {
        const r = rooms[socket.roomId];
        if (!r) return;
        if (config.type === 'MEMORY') {
            let cards = [...cardIcons, ...cardIcons].sort(() => Math.random() - 0.5);
            io.to(socket.roomId).emit('game_init', { type: 'MEMORY', cards });
        }
        // 其他遊戲邏輯比照辦理
    });

    socket.on('flip_card', (idx) => io.to(socket.roomId).emit('on_flip', idx));
});

server.listen(process.env.PORT || 3000);
