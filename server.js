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

// 管理員數據接口
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
                currentTurnIdx: 0, votes: {}
            };
        }

        if (rooms[roomId].players.length < rooms[roomId].maxPlayers) {
            rooms[roomId].players.push({ id: socket.id, name: username, isOut: false });
            io.to(roomId).emit('room_update', rooms[roomId]);
        } else {
            socket.emit('error_msg', '房間已滿');
        }
    });

    socket.on('start_game', (data) => {
        const room = rooms[data.roomId];
        if (!room || room.host !== socket.id) return;
        room.gameStarted = true;
        room.winLines = parseInt(data.winLines) || 3;
        io.to(data.roomId).emit('game_begin', { turnId: room.players[0].id, winLines: room.winLines, gameType: room.gameType });
        
        if (room.gameType === 'spy') {
            const wordPairs = [["香蕉", "芭樂"], ["電腦", "手機"]];
            const pair = wordPairs[Math.floor(Math.random() * wordPairs.length)];
            const spyIdx = Math.floor(Math.random() * room.players.length);
            room.players.forEach((p, i) => {
                io.to(p.id).emit('spy_setup', { role: (i === spyIdx) ? "臥底" : "平民", word: (i === spyIdx) ? pair[1] : pair[0] });
            });
        }
    });

    socket.on('bingo_click', (data) => {
        const room = rooms[data.roomId];
        if (!room || room.players[room.currentTurnIdx].id !== socket.id) return;
        io.to(data.roomId).emit('bingo_sync', data.num);
        room.currentTurnIdx = (room.currentTurnIdx + 1) % room.players.length;
        io.to(data.roomId).emit('next_turn', { turnId: room.players[room.currentTurnIdx].id });
    });

    socket.on('cast_vote', (data) => {
        const room = rooms[data.roomId];
        if (!room) return;
        room.votes[data.targetId] = (room.votes[data.targetId] || 0) + 1;
        const aliveCount = room.players.filter(p => !p.isOut).length;
        if (Object.values(room.votes).reduce((a, b) => a + b, 0) >= aliveCount) {
            const outId = Object.keys(room.votes).reduce((a, b) => room.votes[a] > room.votes[b] ? a : b);
            const player = room.players.find(p => p.id === outId);
            if (player) player.isOut = true;
            io.to(data.roomId).emit('vote_result', { outPlayer: player.name });
            room.votes = {};
        }
    });

    // 管理員關閉房間邏輯
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

server.listen(process.env.PORT || 3000, () => console.log("Server Live"));
