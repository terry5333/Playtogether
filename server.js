const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};

// 7. 管理員後台 API (密鑰: admin123)
app.get('/admin-data', (req, res) => {
    if (req.query.key === "terry0215") res.json(rooms);
    else res.status(403).send("拒絕訪問");
});

io.on('connection', (socket) => {
    // 6. 房間人數系統
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

        if (rooms[roomId].players.length >= rooms[roomId].maxPlayers) {
            return socket.emit('error_msg', '房間已滿');
        }

        rooms[roomId].players.push({ id: socket.id, name: username, isOut: false });
        io.to(roomId).emit('room_update', rooms[roomId]);
    });

    // 2 & 3. 房主設定與開始遊戲
    socket.on('start_game', (data) => {
        const room = rooms[data.roomId];
        if (!room || room.host !== socket.id) return;
        room.gameStarted = true;
        room.winLines = parseInt(data.winLines) || 3;
        room.currentTurnIdx = 0;
        io.to(data.roomId).emit('game_begin', { 
            turnId: room.players[0].id, 
            winLines: room.winLines,
            gameType: room.gameType
        });
    });

    // 5. Bingo 輪流與同步
    socket.on('bingo_click', (data) => {
        const room = rooms[data.roomId];
        if (!room || room.players[room.currentTurnIdx].id !== socket.id) return;
        io.to(data.roomId).emit('bingo_sync', data.num);
        room.currentTurnIdx = (room.currentTurnIdx + 1) % room.players.length;
        io.to(data.roomId).emit('next_turn', { turnId: room.players[room.currentTurnIdx].id });
    });

    // 4. 臥底投票
    socket.on('cast_vote', (data) => {
        const room = rooms[data.roomId];
        if (!room) return;
        room.votes[data.targetId] = (room.votes[data.targetId] || 0) + 1;
        const totalVotes = Object.values(room.votes).reduce((a, b) => a + b, 0);
        if (totalVotes >= room.players.filter(p => !p.isOut).length) {
            const outId = Object.keys(room.votes).reduce((a, b) => room.votes[a] > room.votes[b] ? a : b);
            const player = room.players.find(p => p.id === outId);
            if (player) player.isOut = true;
            io.to(data.roomId).emit('vote_result', { outPlayer: player ? player.name : "無人" });
            room.votes = {};
        }
    });

    socket.on('disconnect', () => {
        if (socket.roomId && rooms[socket.roomId]) {
            rooms[socket.roomId].players = rooms[socket.roomId].players.filter(p => p.id !== socket.id);
            if (rooms[socket.roomId].players.length === 0) delete rooms[socket.roomId];
        }
    });
});

server.listen(process.env.PORT || 3000, () => console.log("Ready"));
