const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

let rooms = {};
const ADMIN_KEY = "admin888"; // 後台密鑰

io.on('connection', (socket) => {
    // 創建房間
    socket.on('create_room', () => {
        const roomId = Math.floor(1000 + Math.random() * 9000).toString();
        rooms[roomId] = { host: socket.id, players: [], gameStarted: false, scores: {}, currentTurnIdx: 0 };
        socket.emit('room_created', { roomId });
    });

    // 加入房間
    socket.on('join_room', (data) => {
        const { roomId, username } = data;
        if (!rooms[roomId]) return socket.emit('error_msg', '房間不存在');
        socket.join(roomId);
        socket.roomId = roomId;
        socket.username = username;
        rooms[roomId].players.push({ id: socket.id, name: username });
        rooms[roomId].scores[username] = 0;
        io.to(roomId).emit('room_update', rooms[roomId]);
    });

    // 管理員數據接口
    app.get('/admin/data', (req, res) => {
        if (req.query.key !== ADMIN_KEY) return res.status(403).send("Forbidden");
        res.json(rooms);
    });

    // 聊天與猜題邏輯
    socket.on('send_chat', (data) => {
        const room = rooms[data.roomId];
        // 你畫我猜判斷
        if (room && room.gameStarted && room.gameType === 'draw' && data.text === room.currentWord) {
            const elapsed = (Date.now() - room.startTime) / 1000;
            let pts = 1;
            if (elapsed <= 60) pts = 3;
            else if (elapsed <= 120) pts = 2;
            room.scores[data.user] += pts;
            io.to(data.roomId).emit('guess_correct', { winner: data.user, pts, word: room.currentWord, scores: room.scores });
            return;
        }
        io.to(data.roomId).emit('receive_chat', { user: data.user, text: data.text });
    });

    // 開始遊戲與參數設定
    socket.on('start_game_with_config', (data) => {
        const room = rooms[data.roomId];
        if (!room || room.host !== socket.id) return;
        room.gameStarted = true;
        room.gameType = data.gameType;
        room.config = data.config;

        if (data.gameType === 'draw') {
            nextDrawTurn(data.roomId);
        } else {
            io.to(data.roomId).emit('game_begin', data);
        }
    });

    function nextDrawTurn(roomId) {
        const room = rooms[roomId];
        const drawer = room.players[room.currentTurnIdx];
        room.startTime = Date.now();
        io.to(roomId).emit('draw_turn_start', { drawerId: drawer.id, drawerName: drawer.name });
    }

    socket.on('set_draw_word', (data) => {
        rooms[data.roomId].currentWord = data.word;
        io.to(data.roomId).emit('draw_ready');
    });

    socket.on('drawing', (data) => socket.to(data.roomId).emit('drawing', data));

    socket.on('disconnect', () => {
        if (socket.roomId && rooms[socket.roomId]) {
            rooms[socket.roomId].players = rooms[socket.roomId].players.filter(p => p.id !== socket.id);
            if (rooms[socket.roomId].players.length === 0) delete rooms[socket.roomId];
            else io.to(socket.roomId).emit('room_update', rooms[socket.roomId]);
        }
    });
});

server.listen(process.env.PORT || 3000);
