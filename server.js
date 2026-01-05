const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

let rooms = {};
const ADMIN_KEY = "bitch12345"; // 管理員後台密鑰

io.on('connection', (socket) => {
    // --- 房務邏輯 ---
    socket.on('create_room', () => {
        const roomId = Math.floor(1000 + Math.random() * 9000).toString();
        rooms[roomId] = { 
            host: socket.id, players: [], gameStarted: false, 
            scores: {}, currentTurnIdx: 0, startTime: null, currentWord: "" 
        };
        socket.emit('room_created', { roomId });
    });

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

    // --- 管理員 API ---
    app.get('/admin/data', (req, res) => {
        if (req.query.key !== ADMIN_KEY) return res.status(403).send("Key Error");
        res.json(rooms);
    });

    // --- 遊戲開始與參數設定 ---
    socket.on('start_game_with_config', (data) => {
        const room = rooms[data.roomId];
        if (!room || room.host !== socket.id) return;
        room.gameStarted = true;
        room.config = data.config; // 儲存幾條線、秒數、回合等
        
        if (data.gameType === 'draw') {
            startDrawTurn(data.roomId);
        } else {
            io.to(data.roomId).emit('game_begin', { gameType: data.gameType, config: data.config });
        }
    });

    // --- 你畫我猜進階計分邏輯 ---
    function startDrawTurn(roomId) {
        const room = rooms[roomId];
        const drawer = room.players[room.currentTurnIdx];
        room.startTime = Date.now();
        io.to(roomId).emit('draw_turn_start', { drawerName: drawer.name, drawerId: drawer.id });
    }

    socket.on('set_draw_word', (data) => {
        const room = rooms[data.roomId];
        room.currentWord = data.word; // 玩家自訂詞語
        socket.to(data.roomId).emit('draw_ready'); 
    });

    socket.on('submit_guess', (data) => {
        const room = rooms[data.roomId];
        if (data.guess === room.currentWord) {
            const elapsed = (Date.now() - room.startTime) / 1000;
            let points = 1;
            if (elapsed <= 60) points = 3;
            else if (elapsed <= 120) points = 2;
            
            room.scores[data.username] += points;
            io.to(data.roomId).emit('guess_correct', { 
                winner: data.username, points, scores: room.scores, word: room.currentWord 
            });
            
            // 換下一位玩家
            room.currentTurnIdx = (room.currentTurnIdx + 1) % room.players.length;
            setTimeout(() => startDrawTurn(data.roomId), 3000);
        } else {
            io.to(data.roomId).emit('receive_chat', { user: data.username, text: data.guess });
        }
    });

    // 畫布同步
    socket.on('drawing', (data) => socket.to(data.roomId).emit('drawing', data));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server started on ${PORT}`));
