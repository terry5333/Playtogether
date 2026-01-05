const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json()); // 支援管理員 POST 請求

let rooms = {};
const ADMIN_KEY = "admin888"; // 管理員密鑰

io.on('connection', (socket) => {
    // 創建房間
    socket.on('create_room', () => {
        const roomId = Math.floor(1000 + Math.random() * 9000).toString();
        rooms[roomId] = {
            host: socket.id,
            players: [],
            gameStarted: false,
            scores: {},
            playerBoards: {} // 儲存玩家賓果卡牌供管理員查看
        };
        socket.emit('room_created', { roomId });
    });

    // 加入房間
    socket.on('join_room', (data) => {
        const { roomId, username } = data;
        if (!rooms[roomId]) return socket.emit('error_msg', '房間不存在');

        socket.join(roomId);
        socket.roomId = roomId;
        socket.username = username;

        if (!rooms[roomId].host) rooms[roomId].host = socket.id;
        if (!rooms[roomId].players.find(p => p.id === socket.id)) {
            rooms[roomId].players.push({ id: socket.id, name: username });
            rooms[roomId].scores[username] = 0;
        }

        io.to(roomId).emit('room_update', {
            roomId: roomId,
            players: rooms[roomId].players,
            hostId: rooms[roomId].host
        });
    });

    // 紀錄玩家卡牌 (管理員查牌用)
    socket.on('bingo_init_done', (data) => {
        if(rooms[data.roomId]) {
            rooms[data.roomId].playerBoards[socket.id] = data.board;
        }
    });

    // 管理員踢人邏輯
    socket.on('admin_kick_player', (data) => {
        if (data.key !== ADMIN_KEY) return;
        const room = rooms[data.roomId];
        if (room) {
            io.to(data.targetId).emit('admin_msg', '你已被管理員踢出房間');
            const targetSocket = io.sockets.sockets.get(data.targetId);
            if (targetSocket) targetSocket.leave(data.roomId);
            room.players = room.players.filter(p => p.id !== data.targetId);
            io.to(data.roomId).emit('room_update', { roomId: data.roomId, players: room.players, hostId: room.host });
        }
    });

    // 斷線處理
    socket.on('disconnect', () => {
        if (socket.roomId && rooms[socket.roomId]) {
            const room = rooms[socket.roomId];
            room.players = room.players.filter(p => p.id !== socket.id);
            if (room.players.length === 0) delete rooms[socket.roomId];
            else {
                if (room.host === socket.id) room.host = room.players[0].id;
                io.to(socket.roomId).emit('room_update', { roomId: socket.roomId, players: room.players, hostId: room.host });
            }
        }
    });
});

// 管理員 API: 查看所有狀態
app.get('/admin/full_data', (req, res) => {
    if (req.query.key !== ADMIN_KEY) return res.status(403).send("Forbidden");
    res.json(rooms);
});

// 管理員 API: 關閉房間
app.post('/admin/close_room', (req, res) => {
    const { key, roomId } = req.body;
    if (key !== ADMIN_KEY) return res.status(403).send("Forbidden");
    if (rooms[roomId]) {
        io.to(roomId).emit('admin_msg', '房間已被管理員強制關閉');
        delete rooms[roomId];
        res.json({ success: true });
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server on ${PORT}`));
