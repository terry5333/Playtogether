const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));

let rooms = {};
const ADMIN_KEY = "1010215"; // 已更新密鑰

io.on('connection', (socket) => {
    socket.on('create_room', () => {
        const roomId = Math.floor(1000 + Math.random() * 9000).toString();
        rooms[roomId] = { 
            host: socket.id, players: [], gameStarted: false, 
            pickedNumbers: [], currentTurnIdx: 0, scores: {} 
        };
        socket.emit('room_created', { roomId });
    });

    socket.on('join_room', (data) => {
        const { roomId, username } = data;
        if (!rooms[roomId]) return socket.emit('error_msg', '房間不存在');
        socket.join(roomId);
        socket.roomId = roomId; socket.username = username;
        if (!rooms[roomId].players.find(p => p.id === socket.id)) {
            rooms[roomId].players.push({ id: socket.id, name: username, alive: true });
            rooms[roomId].scores[username] = 0;
        }
        io.to(roomId).emit('room_update', { roomId, players: rooms[roomId].players, hostId: rooms[roomId].host });
    });

    // 遊戲啟動分配
    socket.on('start_game_with_config', (data) => {
        const room = rooms[data.roomId];
        if (!room || room.host !== socket.id) return;
        room.config = data.config;
        room.gameType = data.gameType;

        if (data.gameType === 'spy') {
            const pair = [["蘋果", "水梨"], ["鋼琴", "風琴"]][Math.floor(Math.random()*2)];
            const spyIdx = Math.floor(Math.random() * room.players.length);
            room.players.forEach((p, idx) => {
                io.to(p.id).emit('game_begin', { gameType: 'spy', word: (idx === spyIdx ? pair[1] : pair[0]), isSpy: (idx === spyIdx), config: data.config });
            });
        } else {
            io.to(data.roomId).emit('game_begin', { gameType: data.gameType, config: data.config });
        }
    });

    // 賓果輪流選號
    socket.on('bingo_start_picking', (data) => {
        const room = rooms[data.roomId];
        room.currentTurnIdx = 0;
        room.pickedNumbers = [];
        sendBingoTurn(data.roomId);
    });

    socket.on('bingo_pick_number', (data) => {
        const room = rooms[data.roomId];
        const num = parseInt(data.number);
        if (!room.pickedNumbers.includes(num)) {
            room.pickedNumbers.push(num);
            io.to(data.roomId).emit('bingo_number_announced', { number: num, pickerName: socket.username });
            room.currentTurnIdx = (room.currentTurnIdx + 1) % room.players.length;
            sendBingoTurn(data.roomId);
        }
    });

    function sendBingoTurn(roomId) {
        const room = rooms[roomId];
        const p = room.players[room.currentTurnIdx];
        io.to(roomId).emit('bingo_next_turn', { activePlayerId: p.id, activePlayerName: p.name });
    }

    // 管理員 API
    socket.on('admin_close_room', d => { if(d.key === ADMIN_KEY) io.to(d.roomId).emit('admin_msg', '房解散'); });
});

server.listen(3000);
