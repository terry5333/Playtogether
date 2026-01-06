const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const Datastore = require('nedb');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const db = new Datastore({ filename: 'users.db', autoload: true });
app.use(express.static(path.join(__dirname, 'public')));

let rooms = {};
let gameHistory = [];

// 廣播排行
function broadcastLeaderboard() {
    db.find({}).sort({ score: -1 }).limit(10).exec((err, docs) => io.emit('leaderboard_update', docs));
}

// 修正：廣播 Admin 數據 (確保包含所有欄位)
function broadcastAdminData() {
    const roomInfo = Object.keys(rooms).map(rid => ({
        id: rid, 
        game: rooms[rid].gameType, 
        players: rooms[rid].players
    }));
    io.emit('admin_data_update', { rooms: roomInfo, history: gameHistory });
}

io.on('connection', (socket) => {
    socket.on('admin_init', () => broadcastAdminData());

    // --- 修正後的帳號系統 (自動切換註冊/登入) ---
    socket.on('auth_action', (d) => {
        db.findOne({ username: d.username }, (err, user) => {
            if (user) {
                // 如果帳號存在，檢查密碼 (登入)
                if (user.password === d.password) {
                    socket.emit('auth_success', user);
                    broadcastLeaderboard();
                } else {
                    socket.emit('toast', '❌ 密碼錯誤');
                }
            } else {
                // 如果帳號不存在 (註冊)
                const newUser = { username: d.username, password: d.password, avatar: d.avatar, score: 0 };
                db.insert(newUser, (err, doc) => {
                    socket.emit('auth_success', doc);
                    broadcastLeaderboard();
                });
            }
        });
    });

    // --- 房間與管理員邏輯 ---
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

    socket.on('admin_get_user_profile', (name) => {
        db.findOne({ username: name }, (err, user) => {
            if (user) socket.emit('admin_receive_profile', user);
        });
    });

    socket.on('admin_close_room', (rid) => {
        if (rooms[rid]) { io.to(rid).emit('force_leave'); delete rooms[rid]; broadcastAdminData(); }
    });

    socket.on('disconnect', () => {
        if (socket.roomId && rooms[socket.roomId]) {
            rooms[socket.roomId].players = rooms[socket.roomId].players.filter(p => p.id !== socket.id);
            if (rooms[socket.roomId].players.length === 0) delete rooms[socket.roomId];
            broadcastAdminData();
        }
    });
});

server.listen(3000);
