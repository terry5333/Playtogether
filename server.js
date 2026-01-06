const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// 確保 /admin 路由能正確開啟 admin.html
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

let memoryDB = {}; // 存儲玩家資料 { pin: { username, avatar, score } }
let rooms = {};    // 存儲房間資料 { rid: { id, hostPin, players: [] } }

const spyLibrary = [['西瓜', '哈密瓜'], ['牙醫', '護士'], ['火鍋', '燒烤'], ['珍珠奶茶', '絲襪奶茶']];

io.on('connection', (socket) => {
    // --- 基礎登入與房間邏輯 ---
    socket.on('save_profile', (data) => {
        memoryDB[data.pin] = { ...data, score: memoryDB[data.pin]?.score || 0 };
        socket.userPin = data.pin;
        socket.emit('auth_success', memoryDB[data.pin]);
    });

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

    // --- 上帝視角 Admin 管理功能 ---
    socket.on('admin_login', (pass) => {
        if (pass === "9999") { // 預設密碼
            socket.emit('admin_data', { rooms: Object.values(rooms), users: Object.values(memoryDB) });
        }
    });

    socket.on('admin_kick_room', (rid) => {
        io.to(rid).emit('error_msg', '管理員已解散此房間');
        delete rooms[rid];
    });

    socket.on('admin_update_user', (data) => {
        if (memoryDB[data.pin]) {
            memoryDB[data.pin].score = parseInt(data.score);
            io.emit('rank_update', Object.values(memoryDB).sort((a,b) => b.score - a.score));
        }
    });

    // --- 房主設定與遊戲啟動 ---
    socket.on('host_setup_trigger', (mode) => {
        const r = rooms[socket.roomId];
        if (r && r.hostPin === socket.userPin) {
            io.to(socket.roomId).emit('open_config_ui', mode);
        }
    });

    socket.on('start_game_final', (data) => {
        const r = rooms[socket.roomId];
        if (data.mode === 'SPY') {
            const pair = spyLibrary[Math.floor(Math.random() * spyLibrary.length)];
            const spyIdx = Math.floor(Math.random() * r.players.length);
            r.players.forEach((p, i) => {
                io.to(p.socketId).emit('game_init', { 
                    type: 'SPY', word: (i===spyIdx ? pair[1] : pair[0]), role: (i===spyIdx ? '臥底' : '平民'), timer: data.val 
                });
            });
        } else if (data.mode === 'BINGO') {
            io.to(socket.roomId).emit('game_init', { type: 'BINGO', targetLines: data.val });
        }
    });
});

server.listen(process.env.PORT || 3000);
