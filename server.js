const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let memoryDB = {}; // { pin: { username, avatar, score } }
let rooms = {};    // { rid: { hostId, players: [] } }

io.on('connection', (socket) => {
    // 檢查 PIN 碼
    socket.on('check_pin', (pin) => {
        const user = memoryDB[pin];
        socket.emit('pin_result', { exists: !!user, user: user });
    });

    // 儲存/註冊個人檔案
    socket.on('save_profile', (data) => {
        memoryDB[data.pin] = { 
            ...data, 
            score: memoryDB[data.pin]?.score || 0 
        };
        socket.emit('auth_success', memoryDB[data.pin]);
        io.emit('rank_update', Object.values(memoryDB).sort((a,b)=>b.score-a.score).slice(0,5));
    });

    // 建立房間 (發起者成為 Admin)
    socket.on('create_room', () => {
        const rid = Math.floor(1000 + Math.random() * 9000).toString();
        rooms[rid] = { id: rid, hostId: socket.id, players: [] };
        socket.emit('room_created', rid);
    });

    // 加入房間與同步
    socket.on('join_room', (data) => {
        const rid = data.roomId;
        if (rooms[rid]) {
            socket.join(rid);
            socket.roomId = rid;
            if (!rooms[rid].players.find(p => p.pin === data.user.pin)) {
                rooms[rid].players.push(data.user);
            }
            // 告知前端誰是 Admin
            io.to(rid).emit('room_update', {
                room: rooms[rid],
                isAdmin: rooms[rid].hostId === socket.id
            });
        }
    });

    // 遊戲啟動 (僅 Admin 可觸發)
    socket.on('start_game', (type) => {
        if (rooms[socket.roomId]?.hostId === socket.id) {
            io.to(socket.roomId).emit('goto_game', type);
        }
    });
});

server.listen(process.env.PORT || 3000);
// 在伺服器端增加管理員 API
io.on('connection', (socket) => {
    // ... 原有的遊戲邏輯 ...

    // 管理員登入
    socket.on('admin_login', (adminPin) => {
        if (adminPin === "9999") { // 假設管理員密碼是 9999
            socket.emit('admin_auth_success', {
                users: Object.values(memoryDB),
                rooms: Object.values(rooms)
            });
        }
    });

    // 強制重置某玩家積分
    socket.on('admin_update_score', ({ pin, newScore }) => {
        if (memoryDB[pin]) {
            memoryDB[pin].score = parseInt(newScore);
            io.emit('rank_update', Object.values(memoryDB).sort((a,b)=>b.score-a.score).slice(0,5));
            socket.emit('admin_action_done', "積分已更新");
        }
    });
});
