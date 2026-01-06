const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let memoryDB = {}; // { pin: { username, avatar, score } }
let rooms = {};    // { rid: { id, hostPin, players: [] } }

// 遊戲資料庫範例
const gameData = {
    spy: [['蘋果', '梨子'], ['醫生', '護士'], ['火鍋', '燒烤']],
    memory: ['🐶', '🐱', '🦊', '🐷', '🐵', '🐨', '🐸', '🦁']
};

io.on('connection', (socket) => {
    // PIN 登入與重連檢查
    socket.on('check_pin', (pin) => {
        const user = memoryDB[pin];
        if (user) {
            socket.userPin = pin;
            socket.emit('pin_result', { exists: true, user: user });
        } else {
            socket.emit('pin_result', { exists: false });
        }
    });

    // 儲存設定檔
    socket.on('save_profile', (data) => {
        memoryDB[data.pin] = { ...data, score: memoryDB[data.pin]?.score || 0 };
        socket.userPin = data.pin;
        socket.emit('auth_success', memoryDB[data.pin]);
        io.emit('rank_update', Object.values(memoryDB).sort((a,b)=>b.score-a.score).slice(0,5));
    });

    // 建立房間 (以 PIN 鎖定房主)
    socket.on('create_room', (user) => {
        const rid = Math.floor(1000 + Math.random() * 9000).toString();
        rooms[rid] = { id: rid, hostPin: user.pin, players: [], status: 'LOBBY' };
        socket.emit('room_created', rid);
    });

    // 加入房間
    socket.on('join_room', (data) => {
        const rid = data.roomId;
        const user = data.user;
        if (rooms[rid]) {
            socket.join(rid);
            socket.roomId = rid;
            socket.userPin = user.pin;
            if (!rooms[rid].players.find(p => p.pin === user.pin)) {
                rooms[rid].players.push(user);
            }
            io.to(rid).emit('room_sync', { room: rooms[rid], hostPin: rooms[rid].hostPin });
        }
    });

    // 遊戲啟動 (僅限 Host PIN)
    socket.on('start_game', (type) => {
        const r = rooms[socket.roomId];
        if (r && r.hostPin === socket.userPin) {
            let extra = {};
            if(type === 'MEMORY') extra.cards = [...gameData.memory, ...gameData.memory].sort(()=>Math.random()-0.5);
            io.to(socket.roomId).emit('goto_game', { type, ...extra });
        }
    });

    socket.on('flip_card', (idx) => io.to(socket.roomId).emit('on_flip', idx));
});

server.listen(process.env.PORT || 3000, () => console.log('PartyBox Server Ready'));
// 擴展詞庫
const spyLibrary = [
    ['蘋果', '梨子'], ['醫生', '護士'], ['火鍋', '燒烤'], ['咖啡', '奶茶'],
    ['相機', '手機'], ['操場', '公園'], ['自行車', '摩托車'], ['鋼琴', '小提琴']
];

io.on('connection', (socket) => {
    // 房主發送設定參數 (秒數、回合、連線數)
    socket.on('set_game_config', (config) => {
        const r = rooms[socket.roomId];
        if (r && r.hostPin === socket.userPin) {
            r.config = config; // 儲存設定
            io.to(socket.roomId).emit('game_ready_to_start', config);
        }
    });

    // --- 誰是臥底邏輯 ---
    socket.on('start_spy_game', () => {
        const r = rooms[socket.roomId];
        const pair = spyLibrary[Math.floor(Math.random() * spyLibrary.length)];
        const spyIdx = Math.floor(Math.random() * r.players.length);
        
        r.players.forEach((p, i) => {
            const role = (i === spyIdx) ? '臥底' : '平民';
            const word = (i === spyIdx) ? pair[1] : pair[0];
            io.to(p.socketId).emit('game_init', { type: 'SPY', word, role, timer: r.config.timer });
        });
    });

    // --- Bingo 邏輯 ---
    socket.on('bingo_call', (num) => {
        io.to(socket.roomId).emit('bingo_sync_num', num);
    });

    // --- 積分結算 ---
    socket.on('claim_win', (points) => {
        if (memoryDB[socket.userPin]) {
            memoryDB[socket.userPin].score += points;
            io.emit('rank_update', Object.values(memoryDB).sort((a,b)=>b.score-a.score).slice(0,5));
            io.to(socket.roomId).emit('announcement', `${memoryDB[socket.userPin].username} 獲得了勝利！`);
        }
    });
});
