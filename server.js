const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" },
    transports: ['websocket', 'polling']
});

app.use(express.static(path.join(__dirname, 'public')));

let rooms = {};

io.on('connection', (socket) => {
    // 創建房間
    socket.on('create_room', () => {
        const roomId = Math.floor(1000 + Math.random() * 9000).toString();
        rooms[roomId] = { host: socket.id, players: [], gameType: "大廳", turnIdx: 0, bingoGoal: 3, votes: {} };
        socket.emit('room_created', { roomId });
    });

    // 加入房間
    socket.on('join_room', (data) => {
        const { roomId, username } = data;
        if (!rooms[roomId]) return socket.emit('toast', '房間不存在');
        socket.join(roomId);
        socket.roomId = roomId;
        socket.username = username;
        rooms[roomId].players.push({ id: socket.id, name: username, score: 0, ready: false, isOut: false });
        io.to(roomId).emit('room_update', { roomId, players: rooms[roomId].players, hostId: rooms[roomId].host });
    });

    // 開始遊戲設定
    socket.on('start_game_with_settings', (data) => {
        const room = rooms[data.roomId];
        if (!room) return;
        room.gameType = data.gameType;
        room.players.forEach(p => { p.isOut = false; });

        if (data.gameType === 'spy') {
            const pairs = [["蘋果", "水梨"], ["洗髮精", "沐浴乳"], ["珍奶", "綠茶"]];
            const pair = pairs[Math.floor(Math.random()*pairs.length)];
            const spyIdx = Math.floor(Math.random() * room.players.length);
            room.votes = {};
            room.players.forEach((p, idx) => {
                io.to(p.id).emit('game_begin', { 
                    gameType: 'spy', 
                    word: idx === spyIdx ? pair[1] : pair[0],
                    isSpy: idx === spyIdx 
                });
            });
        } else if (data.gameType === 'bingo') {
            room.bingoGoal = parseInt(data.settings.goal) || 3;
            io.to(data.roomId).emit('game_begin', { gameType: 'bingo_prepare', goal: room.bingoGoal });
        }
    });

    // 誰是臥底：投票
    socket.on('spy_vote', (d) => {
        const room = rooms[d.roomId];
        if (!room) return;
        room.votes[socket.id] = d.targetId;
        const activePlayers = room.players.filter(p => !p.isOut);
        if (Object.keys(room.votes).length >= activePlayers.length) {
            const counts = {};
            Object.values(room.votes).forEach(id => counts[id] = (counts[id] || 0) + 1);
            const kickedId = Object.entries(counts).sort((a,b) => b[1] - a[1])[0][0];
            const kickedPlayer = room.players.find(p => p.id === kickedId);
            kickedPlayer.isOut = true;
            io.to(d.roomId).emit('spy_vote_result', { kickedName: kickedPlayer.name, isSpy: kickedPlayer.isSpy });
            room.votes = {};
        }
    });

    // 賓果：叫號
    socket.on('bingo_ready', (d) => {
        const room = rooms[d.roomId];
        const p = room.players.find(pl => pl.id === socket.id);
        if(p) p.ready = true;
        if(room.players.every(pl => pl.ready)) {
            room.turnIdx = 0; room.bingoMarked = [];
            io.to(d.roomId).emit('bingo_start', { turnId: room.players[0].id, marked: [] });
        }
    });

    socket.on('bingo_pick', (d) => {
        const room = rooms[d.roomId];
        room.bingoMarked = room.bingoMarked || [];
        room.bingoMarked.push(parseInt(d.num));
        room.turnIdx = (room.turnIdx + 1) % room.players.length;
        io.to(d.roomId).emit('bingo_start', { turnId: room.players[room.turnIdx].id, marked: room.bingoMarked });
    });

    socket.on('bingo_win', (d) => {
        io.to(d.roomId).emit('game_over', { winner: socket.username });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
