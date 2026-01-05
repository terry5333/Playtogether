const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

let rooms = {};
const ADMIN_KEY = "admin888";

io.on('connection', (socket) => {
    socket.on('create_room', () => {
        const roomId = Math.floor(1000 + Math.random() * 9000).toString();
        rooms[roomId] = {
            host: socket.id, players: [], gameStarted: false, gameType: null,
            config: {}, scores: {}, currentTurnIdx: 0, currentWord: "", turnStartTime: null,
            playerBoards: {}
        };
        socket.emit('room_created', { roomId });
    });

    socket.on('join_room', (data) => {
        const { roomId, username } = data;
        if (!rooms[roomId]) return socket.emit('error_msg', '房間不存在');
        socket.join(roomId);
        socket.roomId = roomId;
        socket.username = username;
        if (!rooms[roomId].host) rooms[roomId].host = socket.id;
        if (!rooms[roomId].players.find(p => p.id === socket.id)) {
            rooms[roomId].players.push({ id: socket.id, name: username });
            rooms[roomId].scores[socket.id] = 0;
        }
        io.to(roomId).emit('room_update', { roomId, players: rooms[roomId].players, hostId: rooms[roomId].host });
    });

    // 房主啟動設定並開始遊戲
    socket.on('start_game_with_config', (data) => {
        const room = rooms[data.roomId];
        if (!room || room.host !== socket.id) return;
        room.gameStarted = true;
        room.gameType = data.gameType;
        room.config = data.config;

        if (data.gameType === 'draw') {
            room.currentTurnIdx = 0;
            sendDrawTurn(data.roomId);
        } else {
            io.to(data.roomId).emit('game_begin', { gameType: data.gameType, config: data.config });
        }
    });

    // 你話我猜：出題
    socket.on('draw_submit_word', (data) => {
        const room = rooms[data.roomId];
        if (room) {
            room.currentWord = data.word;
            room.turnStartTime = Date.now();
            io.to(data.roomId).emit('draw_guessing_stage', { drawerName: socket.username });
        }
    });

    // 你話我猜：猜題判定
    socket.on('draw_guess', (data) => {
        const room = rooms[data.roomId];
        if (room && data.guess === room.currentWord) {
            const elapsed = (Date.now() - room.turnStartTime) / 1000;
            let p = 1;
            if (elapsed <= 60) p = 3; else if (elapsed <= 120) p = 2;
            room.scores[socket.id] += p;

            io.to(data.roomId).emit('draw_correct', { winner: socket.username, word: room.currentWord, points: p });
            
            // 下一位輪替
            room.currentTurnIdx++;
            if (room.currentTurnIdx < room.players.length) {
                sendDrawTurn(data.roomId);
            } else {
                io.to(data.roomId).emit('game_over', { scores: room.scores });
            }
        }
    });

    function sendDrawTurn(roomId) {
        const room = rooms[roomId];
        const drawer = room.players[room.currentTurnIdx];
        io.to(roomId).emit('draw_new_turn', { drawerId: drawer.id, drawerName: drawer.name });
    }

    socket.on('disconnect', () => { /* 斷線處理同前 */ });
});

server.listen(3000, () => console.log("Server Running"));
