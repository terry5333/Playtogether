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
const ADMIN_KEY = "1010215";

io.on('connection', (socket) => {
    // 房間基礎邏輯
    socket.on('create_room', () => {
        const roomId = Math.floor(1000 + Math.random() * 9000).toString();
        rooms[roomId] = {
            host: socket.id, players: [], gameStarted: false, gameType: null,
            config: {}, scores: {}, currentTurnIdx: 0, currentWord: "", 
            turnStartTime: null, playerBoards: {}
        };
        socket.emit('room_created', { roomId });
    });

    socket.on('join_room', (data) => {
        const { roomId, username } = data;
        if (!rooms[roomId]) return socket.emit('error_msg', '房間不存在');
        socket.join(roomId);
        socket.roomId = roomId;
        socket.username = username;
        if (!rooms[roomId].players.find(p => p.id === socket.id)) {
            rooms[roomId].players.push({ id: socket.id, name: username });
            rooms[roomId].scores[socket.id] = 0;
        }
        io.to(roomId).emit('room_update', { roomId, players: rooms[roomId].players, hostId: rooms[roomId].host });
    });

    // 房主設定與啟動
    socket.on('start_game_with_config', (data) => {
        const room = rooms[data.roomId];
        if (room && room.host === socket.id) {
            room.config = data.config;
            room.gameType = data.gameType;
            if (data.gameType === 'draw') {
                room.currentTurnIdx = 0;
                sendDrawTurn(data.roomId);
            } else {
                io.to(data.roomId).emit('game_begin', { gameType: data.gameType, config: data.config });
            }
        }
    });

    // 你話我猜：出題與計分
    socket.on('draw_submit_word', (data) => {
        const room = rooms[data.roomId];
        if (room) {
            room.currentWord = data.word;
            room.turnStartTime = Date.now();
            io.to(data.roomId).emit('draw_guessing_stage', { drawerName: socket.username });
        }
    });

    socket.on('draw_guess', (data) => {
        const room = rooms[data.roomId];
        if (room && data.guess === room.currentWord) {
            const elapsed = (Date.now() - room.turnStartTime) / 1000;
            let points = 1;
            if (elapsed <= 60) points = 3;
            else if (elapsed <= 120) points = 2;
            
            room.scores[socket.id] += points;
            io.to(data.roomId).emit('draw_correct', { winner: socket.username, word: room.currentWord, points });
            
            // 下一位輪替
            room.currentTurnIdx++;
            if (room.currentTurnIdx < room.players.length) sendDrawTurn(data.roomId);
            else io.to(data.roomId).emit('game_over', { scores: room.scores });
        }
    });

    function sendDrawTurn(roomId) {
        const room = rooms[roomId];
        const drawer = room.players[room.currentTurnIdx];
        io.to(roomId).emit('draw_new_turn', { drawerId: drawer.id, drawerName: drawer.name });
    }

    // 賓果同步
    socket.on('bingo_init_done', (data) => {
        if(rooms[data.roomId]) rooms[data.roomId].playerBoards[socket.id] = data.board;
    });

    // 管理員 API
    socket.on('admin_kick', (data) => {
        if (data.key === ADMIN_KEY && rooms[data.roomId]) {
            io.to(data.targetId).emit('admin_msg', '你已被踢出');
            io.sockets.sockets.get(data.targetId)?.leave(data.roomId);
        }
    });
});

app.get('/admin/full_data', (req, res) => {
    if (req.query.key !== ADMIN_KEY) return res.status(403).send("No");
    res.json(rooms);
});

server.listen(3000);
