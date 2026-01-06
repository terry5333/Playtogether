const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const Datastore = require('nedb');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// 初始化資料庫
const db = new Datastore({ filename: 'users.db', autoload: true });
app.use(express.static(path.join(__dirname, 'public')));

let rooms = {};
let gameHistory = [];

// 廣播排行與 Admin 數據
function broadcastLeaderboard() {
    db.find({}).sort({ score: -1 }).limit(10).exec((err, docs) => {
        io.emit('leaderboard_update', docs);
    });
}

function broadcastAdminData() {
    io.emit('admin_data_update', {
        rooms: Object.keys(rooms).map(rid => ({
            id: rid, game: rooms[rid].gameType, players: rooms[rid].players
        })),
        history: gameHistory
    });
}

io.on('connection', (socket) => {
    // --- 帳號系統 ---
    socket.on('auth_action', (d) => {
        if (d.type === 'register') {
            db.findOne({ username: d.username }, (err, user) => {
                if (user) return socket.emit('toast', '❌ 帳號已存在');
                const newUser = { username: d.username, password: d.password, avatar: d.avatar, score: 0 };
                db.insert(newUser, (err, doc) => {
                    socket.emit('auth_success', doc);
                    broadcastLeaderboard();
                });
            });
        } else {
            db.findOne({ username: d.username, password: d.password }, (err, user) => {
                if (!user) return socket.emit('toast', '❌ 帳密錯誤');
                socket.emit('auth_success', user);
                broadcastLeaderboard();
            });
        }
    });

    // --- 房間管理 ---
    socket.on('create_room', () => {
        const rid = Math.floor(1000 + Math.random() * 9000).toString();
        rooms[rid] = { host: socket.id, players: [], gameType: 'Lobby', state: {} };
        socket.emit('room_created', { roomId: rid });
    });

    socket.on('join_room', (d) => {
        const r = rooms[d.roomId];
        if (!r) return socket.emit('toast', '❌ 房間不存在');
        socket.join(d.roomId);
        socket.roomId = d.roomId;
        socket.userData = d.user; 
        r.players.push({ id: socket.id, ...d.user });
        io.to(d.roomId).emit('room_update', { roomId: d.roomId, players: r.players, hostId: r.host });
        broadcastAdminData();
    });

    // --- 遊戲切換邏輯 ---
    socket.on('host_setup_game', (d) => {
        const r = rooms[socket.roomId];
        if (!r || socket.id !== r.host) return;
        r.gameType = d.type;

        if (d.type === 'memory') {
            let items = ['🍎','🍎','🍌','🍌','🍇','🍇','🍒','🍒','🍍','🍍','🥝','🥝','🍋','🍋','🍑','🍑'];
            r.state.cards = items.sort(() => Math.random() - 0.5);
            r.state.flipped = [];
            r.state.matched = [];
            io.to(socket.roomId).emit('game_begin', { type: 'memory', cardCount: r.state.cards.length });
        } else if (d.type === 'bingo') {
            io.to(r.host).emit('bingo_ask_config');
        } else if (d.type === 'draw') {
            io.to(r.players[0].id).emit('draw_set_word_request');
        }
        broadcastAdminData();
    });

    // --- 記憶卡牌邏輯 ---
    socket.on('memory_flip', (idx) => {
        const r = rooms[socket.roomId];
        if (!r || r.state.flipped.length >= 2 || r.state.matched.includes(idx)) return;
        
        r.state.flipped.push({ idx, val: r.state.cards[idx] });
        io.to(socket.roomId).emit('memory_sync_flip', r.state.flipped);

        if (r.state.flipped.length === 2) {
            const [a, b] = r.state.flipped;
            if (a.val === b.val) {
                r.state.matched.push(a.idx, b.idx);
                // 加分邏輯
                db.update({ username: socket.userData.username }, { $inc: { score: 20 } }, {}, () => broadcastLeaderboard());
                setTimeout(() => {
                    io.to(socket.roomId).emit('memory_match_success', r.state.matched);
                    r.state.flipped = [];
                    if (r.state.matched.length === r.state.cards.length) {
                        endGame(socket.roomId, "記憶卡牌", socket.userData.username);
                    }
                }, 500);
            } else {
                setTimeout(() => {
                    io.to(socket.roomId).emit('memory_flip_back');
                    r.state.flipped = [];
                }, 1000);
            }
        }
    });

    function endGame(rid, gName, winner) {
        const r = rooms[rid];
        if(!r) return;
        gameHistory.unshift({ time: new Date().toLocaleTimeString(), game: gName, winner });
        io.to(rid).emit('game_over', { winner });
        r.gameType = 'Lobby';
        r.state = {};
        broadcastAdminData();
    }

    // --- 其他遊戲邏輯 (賓果/畫畫) 的結束請呼叫 endGame ---
    // (限於篇幅，此處省略重複的基礎邏輯，建議參考前次對齊代碼)

    socket.on('disconnect', () => {
        if (socket.roomId && rooms[socket.roomId]) {
            rooms[socket.roomId].players = rooms[socket.roomId].players.filter(p => p.id !== socket.id);
            broadcastAdminData();
        }
    });
});

server.listen(3000, () => console.log('Server running on http://localhost:3000'));
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
