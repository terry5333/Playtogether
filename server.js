const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};
const ADMIN_KEY = "bitch12345"; // 管理員密鑰

// 管理員 API
app.get('/admin-data', (req, res) => {
    if (req.query.key === ADMIN_KEY) {
        const stats = Object.entries(rooms).map(([id, data]) => ({
            id,
            gameType: data.gameType === 'bingo' ? '賓果連連看' : data.gameType === 'draw' ? '你畫我猜' : '誰是臥底',
            hostName: data.players.find(p => p.id === data.host)?.name || "未知",
            playerCount: data.players.length,
            players: data.players.map(p => p.name),
            started: data.gameStarted ? "遊戲中" : "準備中"
        }));
        res.json({ totalRooms: stats.length, rooms: stats });
    } else {
        res.status(403).send("密鑰錯誤");
    }
});

io.on('connection', (socket) => {
    socket.on('join_room', (data) => {
        const { roomId, username, gameType, maxPlayers } = data;
        socket.join(roomId);
        socket.roomId = roomId;

        if (!rooms[roomId]) {
            rooms[roomId] = { 
                gameType, host: socket.id, players: [], 
                gameStarted: false, winLines: 3, 
                currentTurnIdx: 0, scores: {}, currentWord: ""
            };
        }
        rooms[roomId].players.push({ id: socket.id, name: username });
        rooms[roomId].scores[socket.id] = 0;
        io.to(roomId).emit('room_update', rooms[roomId]);
    });

    socket.on('start_game', (data) => {
        const room = rooms[data.roomId];
        if (!room || room.host !== socket.id) return;
        room.gameStarted = true;
        room.winLines = parseInt(data.winLines) || 3;
        
        if (room.gameType === 'draw') {
            sendDrawRound(data.roomId);
        } else {
            io.to(data.roomId).emit('game_begin', { turnId: room.players[0].id, winLines: room.winLines, gameType: room.gameType });
        }
    });

    socket.on('submit_guess', (data) => {
        const room = rooms[data.roomId];
        if (!room || room.gameType !== 'draw' || !room.currentWord) return;
        if (data.guess === room.currentWord && socket.id !== room.players[room.currentTurnIdx].id) {
            room.scores[socket.id] += 10;
            room.scores[room.players[room.currentTurnIdx].id] += 5;
            io.to(data.roomId).emit('correct_answer', { winner: data.username, word: room.currentWord, scores: room.scores });
            room.currentTurnIdx = (room.currentTurnIdx + 1) % room.players.length;
            setTimeout(() => sendDrawRound(data.roomId), 3000);
        }
    });

    socket.on('drawing', (data) => socket.to(data.roomId).emit('drawing', data));
    
    socket.on('bingo_click', (data) => {
        const room = rooms[data.roomId];
        if (!room || room.players[room.currentTurnIdx].id !== socket.id) return;
        io.to(data.roomId).emit('bingo_sync', data.num);
        room.currentTurnIdx = (room.currentTurnIdx + 1) % room.players.length;
        io.to(data.roomId).emit('next_turn', { turnId: room.players[room.currentTurnIdx].id });
    });

    socket.on('admin_close_room', (data) => {
        if (data.key === ADMIN_KEY && rooms[data.targetRoomId]) {
            io.to(data.targetRoomId).emit('force_disconnect', '房間已被管理員解散');
            delete rooms[data.targetRoomId];
        }
    });

    socket.on('disconnect', () => {
        if (socket.roomId && rooms[socket.roomId]) {
            rooms[socket.roomId].players = rooms[socket.roomId].players.filter(p => p.id !== socket.id);
            if (rooms[socket.roomId].players.length === 0) delete rooms[socket.roomId];
            else io.to(socket.roomId).emit('room_update', rooms[socket.roomId]);
        }
    });
});

function sendDrawRound(roomId) {
    const room = rooms[roomId];
    const words = ["蘋果", "香蕉", "珍珠奶茶", "電腦", "飛機"];
    room.currentWord = words[Math.floor(Math.random() * words.length)];
    io.to(roomId).emit('game_begin', { turnId: room.players[room.currentTurnIdx].id, gameType: 'draw' });
    io.to(room.players[room.currentTurnIdx].id).emit('your_word', { word: room.currentWord });
}

server.listen(process.env.PORT || 3000, () => console.log("Server running"));
