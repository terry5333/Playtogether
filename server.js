const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};
const ADMIN_KEY = "admin123"; // 管理員進入密鑰

// 管理員 API 接口
app.get('/admin-data', (req, res) => {
    if (req.query.key === ADMIN_KEY) {
        const stats = Object.entries(rooms).map(([id, data]) => ({
            id,
            gameType: data.gameType === 'bingo' ? '賓果' : data.gameType === 'draw' ? '你畫我猜' : '誰是臥底',
            hostName: data.players.find(p => p.id === data.host)?.name || "未知",
            players: data.players.map(p => p.name).join(', '),
            started: data.gameStarted ? "遊戲中" : "等待中"
        }));
        res.json({ rooms: stats });
    } else {
        res.status(403).send("密鑰錯誤");
    }
});

io.on('connection', (socket) => {
    socket.on('join_room', (data) => {
        const { roomId, username, gameType } = data;
        socket.join(roomId);
        socket.roomId = roomId;

        if (!rooms[roomId]) {
            rooms[roomId] = { 
                gameType, host: socket.id, players: [], 
                gameStarted: false, winLines: 3, currentTurnIdx: 0, currentWord: "" 
            };
        }
        rooms[roomId].players.push({ id: socket.id, name: username });
        io.to(roomId).emit('room_update', rooms[roomId]);
    });

    socket.on('start_game', (data) => {
        const room = rooms[data.roomId];
        if (!room || room.host !== socket.id) return;
        room.gameStarted = true;
        room.winLines = parseInt(data.winLines) || 3;

        if (room.gameType === 'draw') {
            sendDrawRound(data.roomId);
        } else if (room.gameType === 'spy') {
            const pairs = [["香蕉", "芭樂"], ["鋼琴", "小提琴"], ["珍珠奶茶", "絲襪奶茶"]];
            const pair = pairs[Math.floor(Math.random() * pairs.length)];
            const spyIdx = Math.floor(Math.random() * room.players.length);
            room.players.forEach((p, i) => {
                io.to(p.id).emit('spy_setup', { 
                    word: i === spyIdx ? pair[1] : pair[0] 
                });
            });
            io.to(data.roomId).emit('game_begin', { gameType: 'spy' });
        } else {
            io.to(data.roomId).emit('game_begin', { 
                turnId: room.players[0].id, 
                winLines: room.winLines, 
                gameType: 'bingo' 
            });
        }
    });

    socket.on('bingo_click', (data) => {
        const room = rooms[data.roomId];
        if (!room) return;
        io.to(data.roomId).emit('bingo_sync', data.num);
        room.currentTurnIdx = (room.currentTurnIdx + 1) % room.players.length;
        io.to(data.roomId).emit('next_turn', { turnId: room.players[room.currentTurnIdx].id });
    });

    socket.on('drawing', (data) => socket.to(data.roomId).emit('drawing', data));

    socket.on('admin_close_room', (data) => {
        if (data.key === ADMIN_KEY) {
            io.to(data.targetRoomId).emit('force_disconnect', '管理員已解散房間');
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
    const words = ["蘋果", "珍珠奶茶", "漢堡", "蜘蛛人"];
    room.currentWord = words[Math.floor(Math.random() * words.length)];
    const drawerId = room.players[room.currentTurnIdx].id;
    io.to(roomId).emit('game_begin', { turnId: drawerId, gameType: 'draw' });
    io.to(drawerId).emit('your_word', { word: room.currentWord });
}

server.listen(process.env.PORT || 3000, () => console.log("Server Live"));
