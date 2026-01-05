const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));

let rooms = {};
const ADMIN_KEY = "1010215";

io.on('connection', (socket) => {
    socket.on('create_room', () => {
        const roomId = Math.floor(1000 + Math.random() * 9000).toString();
        rooms[roomId] = { host: socket.id, players: [], currentTurnIdx: 0, currentWord: "" };
        socket.emit('room_created', { roomId });
    });

    socket.on('join_room', (data) => {
        const { roomId, username } = data;
        if (!rooms[roomId]) return socket.emit('error_msg', '房間不存在');
        socket.join(roomId);
        socket.roomId = roomId; socket.username = username;
        if (!rooms[roomId].players.find(p => p.id === socket.id)) {
            rooms[roomId].players.push({ id: socket.id, name: username, alive: true });
        }
        io.to(roomId).emit('room_update', { roomId, players: rooms[roomId].players, hostId: rooms[roomId].host });
    });

    socket.on('start_game_with_config', (data) => {
        const room = rooms[data.roomId];
        if (!room || room.host !== socket.id) return;
        room.gameType = data.gameType;

        if (data.gameType === 'draw') {
            room.currentTurnIdx = 0;
            sendDrawTurn(data.roomId);
        } else if (data.gameType === 'spy') {
            const pair = [["原子筆", "鋼筆"], ["烤肉", "火鍋"]][Math.floor(Math.random()*2)];
            const spyIdx = Math.floor(Math.random() * room.players.length);
            room.players.forEach((p, idx) => {
                io.to(p.id).emit('game_begin', { gameType: 'spy', word: (idx === spyIdx ? pair[1] : pair[0]), isSpy: (idx === spyIdx), config: data.config });
            });
        } else {
            io.to(data.roomId).emit('game_begin', { gameType: data.gameType, config: data.config });
        }
    });

    // 你話我猜專用
    function sendDrawTurn(roomId) {
        const room = rooms[roomId];
        const drawer = room.players[room.currentTurnIdx];
        io.to(roomId).emit('draw_new_turn', { drawerId: drawer.id, drawerName: drawer.name });
    }

    socket.on('draw_submit_word', (data) => {
        rooms[data.roomId].currentWord = data.word;
        io.to(data.roomId).emit('draw_guessing_stage', { drawerName: socket.username });
    });

    socket.on('draw_guess', (data) => {
        const room = rooms[data.roomId];
        if (data.guess === room.currentWord) {
            io.to(data.roomId).emit('draw_correct', { winner: socket.username, word: room.currentWord });
            room.currentTurnIdx = (room.currentTurnIdx + 1) % room.players.length;
            sendDrawTurn(data.roomId);
        }
    });

    // 賓果開號邏輯
    socket.on('bingo_start_picking', d => { rooms[d.roomId].currentTurnIdx = 0; sendBingoTurn(d.roomId); });
    socket.on('bingo_pick_number', d => {
        io.to(d.roomId).emit('bingo_number_announced', { number: d.number, pickerName: socket.username });
        rooms[d.roomId].currentTurnIdx = (rooms[d.roomId].currentTurnIdx + 1) % rooms[d.roomId].players.length;
        sendBingoTurn(d.roomId);
    });
    function sendBingoTurn(rid) { 
        const p = rooms[rid].players[rooms[rid].currentTurnIdx];
        io.to(rid).emit('bingo_next_turn', { activePlayerId: p.id, activePlayerName: p.name });
    }
});
server.listen(3000);
