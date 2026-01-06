const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// 路由：修復 /admin 進不去的問題
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

let memoryDB = {}; // 玩家個資數據 { pin: { username, avatar, score } }
let rooms = {};    // 房間動態數據 { rid: { id, hostPin, players: [] } }

const spyLibrary = [['西瓜', '哈密瓜'], ['牙醫', '護士'], ['火鍋', '燒烤'], ['咖啡', '奶茶']];

io.on('connection', (socket) => {
    // --- 基礎認證 ---
    socket.on('check_pin', (pin) => {
        socket.emit('pin_result', { exists: !!memoryDB[pin], user: memoryDB[pin] });
    });

    socket.on('save_profile', (data) => {
        memoryDB[data.pin] = { ...data, score: memoryDB[data.pin]?.score || 0 };
        socket.userPin = data.pin;
        socket.emit('auth_success', memoryDB[data.pin]);
    });

    // --- 房間邏輯 ---
    socket.on('create_room', (user) => {
        const rid = Math.floor(1000 + Math.random() * 9000).toString();
        rooms[rid] = { id: rid, hostPin: user.pin, players: [] };
        socket.emit('room_created', rid);
    });

    socket.on('join_room', (data) => {
        if (rooms[data.roomId]) {
            socket.join(data.roomId);
            socket.roomId = data.roomId;
            if (!rooms[data.roomId].players.find(p => p.pin === data.user.pin)) {
                rooms[data.roomId].players.push({ ...data.user, socketId: socket.id });
            }
            io.to(data.roomId).emit('room_sync', { room: rooms[data.roomId], hostPin: rooms[data.roomId].hostPin });
        }
    });

    // --- 上帝視角管理員 API ---
    socket.on('admin_login', (pass) => {
        if (pass === "9999") { // 你的管理密碼
            socket.emit('admin_data', { rooms: Object.values(rooms), users: Object.values(memoryDB) });
        }
    });

    socket.on('admin_kick_room', (rid) => {
        io.to(rid).emit('error_msg', '管理員已強制解散此房間');
        delete rooms[rid];
    });

    socket.on('admin_update_user', (data) => {
        if (memoryDB[data.pin]) {
            memoryDB[data.pin].score = parseInt(data.score);
            memoryDB[data.pin].username = data.username;
            io.emit('rank_update', Object.values(memoryDB).sort((a,b)=>b.score-a.score));
        }
    });

    // --- 房主設定流 ---
    socket.on('host_setup_trigger', (mode) => {
        const r = rooms[socket.roomId];
        if (r && r.hostPin === socket.userPin) {
            io.to(socket.roomId).emit('open_config_ui', mode);
        }
    });

    socket.on('start_game_final', (data) => {
        const r = rooms[socket.roomId];
        if (data.mode === 'SPY') {
            const pair = spyLibrary[Math.floor(Math.random() * spyLibrary.library)];
            const spyIdx = Math.floor(Math.random() * r.players.length);
            r.players.forEach((p, i) => {
                io.to(p.socketId).emit('game_init', { 
                    type: 'SPY', word: (i===spyIdx?pair[1]:pair[0]), role: (i===spyIdx?'臥底':'平民'), timer: data.val 
                });
            });
        } else if (data.mode === 'BINGO') {
            io.to(socket.roomId).emit('game_init', { type: 'BINGO', targetLines: data.val });
        }
    });
});

server.listen(process.env.PORT || 3000);
