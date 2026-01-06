const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const Datastore = require('nedb');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// 初始化資料庫 (存儲帳號與分數)
const db = new Datastore({ filename: 'users.db', autoload: true });
app.use(express.static(path.join(__dirname, 'public')));

let rooms = {};
let gameHistory = [];

// 廣播排行與 Admin 數據
const broadcastLeaderboard = () => {
    db.find({}).sort({ score: -1 }).limit(10).exec((err, docs) => io.emit('leaderboard_update', docs));
};

const broadcastAdminData = () => {
    io.emit('admin_data_update', {
        rooms: Object.keys(rooms).map(rid => ({
            id: rid, game: rooms[rid].gameType, players: rooms[rid].players, host: rooms[rid].host
        })),
        history: gameHistory
    });
};

const endGame = (rid, gName, winner) => {
    if (!rooms[rid]) return;
    gameHistory.unshift({ time: new Date().toLocaleTimeString(), game: gName, winner, roomId: rid });
    if (gameHistory.length > 50) gameHistory.pop();
    io.to(rid).emit('game_over', { winner });
    rooms[rid].gameType = 'Lobby';
    rooms[rid].state = {};
    broadcastAdminData();
};

io.on('connection', (socket) => {
    socket.on('admin_init', () => broadcastAdminData());

    // --- 帳號邏輯 ---
    socket.on('auth_action', (d) => {
        if (d.type === 'register') {
            db.findOne({ username: d.username }, (err, user) => {
                if (user) return socket.emit('toast', '❌ 帳號已存在');
                db.insert({ username: d.username, password: d.password, avatar: d.avatar, score: 0 }, (err, doc) => {
                    socket.emit('auth_success', doc);
                    broadcastLeaderboard();
                });
            });
        } else {
            db.findOne({ username: d.username, password: d.password }, (err, user) => {
                if (!user || user.password !== d.password) return socket.emit('toast', '❌ 帳密錯誤');
                socket.emit('auth_success', user);
                broadcastLeaderboard();
            });
        }
    });

    // --- 房間邏輯 ---
    socket.on('create_room', () => {
        const rid = Math.floor(1000 + Math.random() * 9000).toString();
        rooms[rid] = { host: socket.id, players: [], gameType: 'Lobby', state: {} };
        socket.emit('room_created', { roomId: rid });
    });

    socket.on('join_room', (d) => {
        if (!rooms[d.roomId]) return socket.emit('toast', '❌ 房間不存在');
        socket.join(d.roomId);
        socket.roomId = d.roomId;
        socket.userData = d.user;
        rooms[d.roomId].players.push({ id: socket.id, ...d.user });
        io.to(d.roomId).emit('room_update', { roomId: d.roomId, players: rooms[d.roomId].players, hostId: rooms[d.roomId].host });
        broadcastAdminData();
    });

    // --- 遊戲邏輯 ---
    socket.on('host_setup_game', (d) => {
        const r = rooms[socket.roomId];
        if (!r || socket.id !== r.host) return;
        r.gameType = d.type;
        if (d.type === 'memory') {
            let cards = ['🍎','🍎','🍌','🍌','🍇','🍇','🍒','🍒','🍍','🍍','🥝','🥝','🍋','🍋','🍑','🍑'].sort(() => Math.random() - 0.5);
            r.state = { cards, flipped: [], matched: [] };
            io.to(socket.roomId).emit('game_begin', { type: 'memory', cardCount: 16 });
        } else if (d.type === 'draw') {
            io.to(r.players[0].id).emit('draw_set_word_request');
        } else if (d.type === 'bingo') {
            io.to(r.host).emit('bingo_ask_config');
        }
        broadcastAdminData();
    });

    socket.on('memory_flip', (idx) => {
        const r = rooms[socket.roomId];
        if (!r || r.state.flipped.length >= 2 || r.state.matched.includes(idx)) return;
        r.state.flipped.push({ idx, val: r.state.cards[idx] });
        io.to(socket.roomId).emit('memory_sync_flip', r.state.flipped);
        if (r.state.flipped.length === 2) {
            const [a, b] = r.state.flipped;
            if (a.val === b.val) {
                r.state.matched.push(a.idx, b.idx);
                db.update({ username: socket.userData.username }, { $inc: { score: 20 } }, {}, () => broadcastLeaderboard());
                setTimeout(() => {
                    io.to(socket.roomId).emit('memory_match_success', r.state.matched);
                    r.state.flipped = [];
                    if (r.state.matched.length === 16) endGame(socket.roomId, "記憶卡牌", socket.userData.username);
                }, 500);
            } else {
                setTimeout(() => { io.to(socket.roomId).emit('memory_flip_back'); r.state.flipped = []; }, 1000);
            }
        }
    });

    // --- 管理員特權 ---
    socket.on('admin_close_room', (rid) => {
        if (rooms[rid]) { io.to(rid).emit('force_leave'); delete rooms[rid]; broadcastAdminData(); }
    });
    socket.on('admin_kick_player', (d) => {
        io.to(d.playerId).emit('force_leave');
        broadcastAdminData();
    });
    socket.on('admin_get_user_profile', (name) => {
        db.findOne({ username: name }, (err, user) => socket.emit('admin_receive_profile', user));
    });

    socket.on('disconnect', () => {
        if (socket.roomId && rooms[socket.roomId]) {
            rooms[socket.roomId].players = rooms[socket.roomId].players.filter(p => p.id !== socket.id);
            if (rooms[socket.roomId].players.length === 0) delete rooms[socket.roomId];
            broadcastAdminData();
        }
    });
});

server.listen(3000, () => console.log('Server started on port 3000'));
