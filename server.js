const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};
const ADMIN_KEY = "admin123"; // 管理員密鑰

// --- 管理員 API ---
app.get('/admin-data', (req, res) => {
    if (req.query.key === ADMIN_KEY) {
        const stats = Object.entries(rooms).map(([id, data]) => ({
            id,
            gameType: data.gameType,
            hostName: data.players.find(p => p.id === data.host)?.name || "未知",
            playerCount: data.players.length,
            players: data.players.map(p => p.name).join(', '),
            started: data.gameStarted ? "🎮 遊戲中" : "⌛ 等待中"
        }));
        res.json({ rooms: stats });
    } else {
        res.status(403).send("密鑰錯誤");
    }
});

io.on('connection', (socket) => {
    // 進入房間
    socket.on('join_room', (data) => {
        const { roomId, username, gameType } = data;
        socket.join(roomId);
        socket.roomId = roomId;

        if (!rooms[roomId]) {
            rooms[roomId] = { 
                gameType, host: socket.id, players: [], 
                gameStarted: false, currentTurnIdx: 0, 
                currentWord: "", votes: {}
            };
        }
        rooms[roomId].players.push({ id: socket.id, name: username });
        io.to(roomId).emit('room_update', rooms[roomId]);
    });

    // 開始遊戲
    socket.on('start_game', (data) => {
        const room = rooms[data.roomId];
        if (!room || room.host !== socket.id) return;
        room.gameStarted = true;

        if (room.gameType === 'draw') {
            sendDrawRound(data.roomId);
        } else if (room.gameType === 'spy') {
            const pairs = [["香蕉", "芭樂"], ["鋼琴", "小提琴"], ["電腦", "平板"]];
            const pair = pairs[Math.floor(Math.random() * pairs.length)];
            const spyIdx = Math.floor(Math.random() * room.players.length);
            room.players.forEach((p, i) => {
                io.to(p.id).emit('spy_setup', { 
                    word: i === spyIdx ? pair[1] : pair[0],
                    role: i === spyIdx ? "臥底" : "平民"
                });
            });
            io.to(data.roomId).emit('game_begin', { gameType: 'spy' });
        } else {
            // 賓果
            io.to(data.roomId).emit('game_begin', { 
                turnId: room.players[0].id, gameType: 'bingo' 
            });
        }
    });

    // 遊戲互動邏輯
    socket.on('bingo_click', (data) => {
        const room = rooms[data.roomId];
        io.to(data.roomId).emit('bingo_sync', data.num);
        room.currentTurnIdx = (room.currentTurnIdx + 1) % room.players.length;
        io.to(data.roomId).emit('next_turn', { turnId: room.players[room.currentTurnIdx].id });
    });

    socket.on('drawing', (data) => socket.to(data.roomId).emit('drawing', data));

    socket.on('cast_vote', (data) => {
        const room = rooms[data.roomId];
        room.votes[socket.id] = data.targetId;
        if (Object.keys(room.votes).length === room.players.length) {
            io.to(data.roomId).emit('vote_result', { votes: room.votes });
            room.votes = {};
        }
    });

    // 管理員強制關房
    socket.on('admin_close_room', (data) => {
        if (data.key === ADMIN_KEY && rooms[data.targetRoomId]) {
            io.to(data.targetRoomId).emit('force_disconnect', '🚨 該房間已被管理員解散。');
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
    const words = ["蘋果", "珍珠奶茶", "派大星", "蜘蛛人"];
    room.currentWord = words[Math.floor(Math.random() * words.length)];
    const drawer = room.players[room.currentTurnIdx];
    io.to(roomId).emit('game_begin', { turnId: drawer.id, gameType: 'draw' });
    io.to(drawer.id).emit('your_word', { word: room.currentWord });
}

server.listen(3000, () => console.log("Server Live on Port 3000"));
