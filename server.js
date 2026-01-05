const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};
const ADMIN_KEY = "bitch12345";

// 管理員數據 API
app.get('/admin-data', (req, res) => {
    if (req.query.key === ADMIN_KEY) {
        const stats = Object.entries(rooms).map(([id, data]) => ({
            id,
            gameType: data.gameType,
            hostName: data.players.find(p => p.id === data.host)?.name || "未知",
            playerCount: data.players.length,
            players: data.players.map(p => p.name),
            started: data.gameStarted
        }));
        res.json({ totalRooms: stats.length, rooms: stats });
    } else {
        res.status(403).send("拒絕訪問");
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
                maxPlayers: parseInt(maxPlayers) || 10,
                currentTurnIdx: 0, votes: {}, scores: {}, currentWord: ""
            };
        }
        rooms[roomId].players.push({ id: socket.id, name: username, isOut: false });
        rooms[roomId].scores[socket.id] = 0;
        io.to(roomId).emit('room_update', rooms[roomId]);
    });

    socket.on('start_game', (data) => {
        const room = rooms[data.roomId];
        if (!room || room.host !== socket.id) return;
        room.gameStarted = true;
        room.winLines = parseInt(data.winLines) || 3;
        room.currentTurnIdx = 0;
        
        if (room.gameType === 'draw') {
            nextDrawRound(data.roomId);
        } else {
            io.to(data.roomId).emit('game_begin', { turnId: room.players[0].id, winLines: room.winLines, gameType: room.gameType });
        }
    });

    // 你畫我猜：提交答案邏輯
    socket.on('submit_guess', (data) => {
        const room = rooms[data.roomId];
        if (!room || room.gameType !== 'draw' || !room.currentWord) return;
        const drawer = room.players[room.currentTurnIdx];
        
        if (data.guess === room.currentWord && socket.id !== drawer.id) {
            room.scores[socket.id] += 10; // 猜對者
            room.scores[drawer.id] += 5;   // 畫圖者
            io.to(data.roomId).emit('correct_answer', { winner: data.username, word: room.currentWord, scores: room.scores });
            
            room.currentTurnIdx = (room.currentTurnIdx + 1) % room.players.length;
            setTimeout(() => nextDrawRound(data.roomId), 3000);
        }
    });

    socket.on('drawing', (data) => {
        socket.to(data.roomId).emit('drawing', data);
    });

    socket.on('bingo_click', (data) => {
        const room = rooms[data.roomId];
        if (!room || room.players[room.currentTurnIdx].id !== socket.id) return;
        io.to(data.roomId).emit('bingo_sync', data.num);
        room.currentTurnIdx = (room.currentTurnIdx + 1) % room.players.length;
        io.to(data.roomId).emit('next_turn', { turnId: room.players[room.currentTurnIdx].id });
    });

    socket.on('admin_close_room', (data) => {
        if (data.key === ADMIN_KEY && rooms[data.targetRoomId]) {
            io.to(data.targetRoomId).emit('force_disconnect', '房間已被管理員關閉');
            delete rooms[data.targetRoomId];
        }
    });

    socket.on('disconnect', () => {
        if (socket.roomId && rooms[socket.roomId]) {
            rooms[socket.roomId].players = rooms[socket.roomId].players.filter(p => p.id !== socket.id);
            if (rooms[socket.roomId].players.length === 0) delete rooms[socket.roomId];
        }
    });
});

function nextDrawRound(roomId) {
    const room = rooms[roomId];
    if (!room) return;
    const words = ["蘋果", "鋼琴", "蜘蛛人", "珍珠奶茶", "漢堡"];
    room.currentWord = words[Math.floor(Math.random() * words.length)];
    const drawer = room.players[room.currentTurnIdx];
    
    io.to(roomId).emit('game_begin', { turnId: drawer.id, gameType: 'draw' });
    io.to(drawer.id).emit('your_word', { word: room.currentWord });
}

server.listen(process.env.PORT || 3000, () => console.log("Server Live"));
