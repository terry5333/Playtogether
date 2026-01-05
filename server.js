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
        rooms[roomId] = { host: socket.id, players: [], gameStarted: false, scores: {}, currentWord: "", turnStartTime: 0 };
        socket.emit('room_created', { roomId });
    });

    socket.on('join_room', (data) => {
        const { roomId, username } = data;
        if (!rooms[roomId]) return socket.emit('error_msg', '房間不存在');
        socket.join(roomId);
        socket.roomId = roomId; socket.username = username;
        if (!rooms[roomId].players.find(p => p.id === socket.id)) {
            rooms[roomId].players.push({ id: socket.id, name: username });
            rooms[roomId].scores[username] = 0;
        }
        io.to(roomId).emit('room_update', { roomId, players: rooms[roomId].players, hostId: rooms[roomId].host });
    });

    // 啟動遊戲與分配邏輯
    socket.on('start_game_with_config', (data) => {
        const room = rooms[data.roomId];
        if (!room || room.host !== socket.id) return;
        room.gameType = data.gameType;
        room.config = data.config;

        if (data.gameType === 'spy') {
            const pair = [["蘋果", "水梨"], ["鋼琴", "風琴"]][Math.floor(Math.random()*2)];
            const spyIdx = Math.floor(Math.random() * room.players.length);
            room.players.forEach((p, idx) => {
                io.to(p.id).emit('game_begin', { gameType: 'spy', word: (idx === spyIdx ? pair[1] : pair[0]), isSpy: (idx === spyIdx), config: data.config });
            });
        } else if (data.gameType === 'draw') {
            room.currentTurnIdx = 0;
            sendDrawTurn(data.roomId);
        } else {
            io.to(data.roomId).emit('game_begin', { gameType: data.gameType, config: data.config });
        }
    });

    function sendDrawTurn(roomId) {
        const room = rooms[roomId];
        const drawer = room.players[room.currentTurnIdx];
        io.to(roomId).emit('draw_new_turn', { drawerId: drawer.id, drawerName: drawer.name, config: room.config });
    }

    // 你話我猜：出題與猜題
    socket.on('draw_submit_word', (data) => {
        const room = rooms[data.roomId];
        room.currentWord = data.word;
        room.turnStartTime = Date.now();
        io.to(data.roomId).emit('draw_guessing_stage', { drawerName: socket.username });
    });

    socket.on('draw_guess', (data) => {
        const room = rooms[data.roomId];
        if (data.guess === room.currentWord) {
            const elapsed = (Date.now() - room.turnStartTime) / 1000;
            let pts = (elapsed <= 60) ? 3 : (elapsed <= 120 ? 2 : 1);
            room.scores[socket.username] += pts;
            io.to(data.roomId).emit('draw_correct', { winner: socket.username, word: room.currentWord, pts, scores: room.scores });
            
            room.currentTurnIdx++;
            if (room.currentTurnIdx < room.players.length) sendDrawTurn(data.roomId);
            else io.to(data.roomId).emit('game_over', { scores: room.scores });
        }
    });

    // 管理員功能
    socket.on('admin_close_room', d => { if(d.key === ADMIN_KEY) { io.to(d.roomId).emit('admin_msg', '房已解散'); delete rooms[d.roomId]; }});
    socket.on('admin_kick', d => { if(d.key === ADMIN_KEY) { io.to(d.targetId).emit('admin_msg', '你被踢了'); }});
});
server.listen(3000);
