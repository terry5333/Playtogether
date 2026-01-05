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
        rooms[roomId] = { host: socket.id, players: [], gameType: "大廳", turnIdx: 0, currentRound: 1, totalRounds: 1, bingoMarked: [] };
        socket.emit('room_created', { roomId });
    });

    socket.on('join_room', (data) => {
        const { roomId, username } = data;
        if (!rooms[roomId]) return socket.emit('toast', '房間不存在');
        socket.join(roomId);
        socket.roomId = roomId;
        socket.username = username;
        rooms[roomId].players.push({ id: socket.id, name: username, score: 0, ready: false, bingoBoard: [] });
        syncData(roomId);
    });

    socket.on('start_game_with_settings', (data) => {
        const room = rooms[data.roomId];
        if (!room) return;
        room.gameType = data.gameType;
        room.totalRounds = parseInt(data.settings.rounds) || 1;
        room.turnIdx = 0; room.currentRound = 1;
        room.players.forEach(p => { p.score = 0; p.ready = false; });

        if (data.gameType === 'draw') sendDrawTurn(data.roomId);
        else if (data.gameType === 'spy') {
            const pair = [["原子筆", "鉛筆"], ["西瓜", "香瓜"], ["火鍋", "烤肉"]][Math.floor(Math.random()*3)];
            const spyIdx = Math.floor(Math.random() * room.players.length);
            room.players.forEach((p, idx) => {
                io.to(p.id).emit('game_begin', { gameType: 'spy', word: idx === spyIdx ? pair[1] : pair[0] });
            });
        }
        else if (data.gameType === 'bingo') io.to(data.roomId).emit('game_begin', { gameType: 'bingo_prepare' });
    });

    function sendDrawTurn(roomId) {
        const room = rooms[roomId];
        if (room.currentRound > room.totalRounds) return io.to(roomId).emit('game_over', { scores: room.players.sort((a,b)=>b.score-a.score) });
        const drawer = room.players[room.turnIdx];
        io.to(roomId).emit('game_begin', { gameType: 'draw', drawerId: drawer.id, drawerName: drawer.name, roundInfo: `第 ${room.currentRound} / ${room.totalRounds} 輪` });
    }

    socket.on('draw_submit_word', (d) => { rooms[d.roomId].currentWord = d.word; rooms[d.roomId].drawStartTime = Date.now(); });
    socket.on('draw_guess', (d) => {
        const room = rooms[d.roomId];
        if (room && d.guess.trim() === room.currentWord.trim()) {
            room.players.find(p => p.id === socket.id).score += 2;
            room.turnIdx++;
            if (room.turnIdx >= room.players.length) { room.turnIdx = 0; room.currentRound++; }
            io.to(d.roomId).emit('toast', `${socket.username} 答對了！`, '#16a34a');
            setTimeout(() => sendDrawTurn(d.roomId), 2000);
        }
    });

    socket.on('bingo_ready', (d) => {
        const room = rooms[d.roomId];
        room.players.find(p => p.id === socket.id).ready = true;
        if (room.players.every(pl => pl.ready)) { room.turnIdx = 0; room.bingoMarked = []; sendBingoTurn(d.roomId); }
    });

    function sendBingoTurn(roomId) {
        const room = rooms[roomId];
        io.to(roomId).emit('bingo_start', { turnName: room.players[room.turnIdx].name, turnId: room.players[room.turnIdx].id, marked: room.bingoMarked });
    }

    socket.on('bingo_pick', (d) => {
        rooms[d.roomId].bingoMarked.push(parseInt(d.num));
        rooms[d.roomId].turnIdx = (rooms[d.roomId].turnIdx + 1) % rooms[d.roomId].players.length;
        sendBingoTurn(d.roomId);
    });

    socket.on('admin_kick', (d) => { io.to(d.playerId).emit('toast', '你被管理員請離房間'); syncData(d.roomId); });
    socket.on('admin_close_room', (rid) => { io.to(rid).emit('toast', '房間已被關閉'); delete rooms[rid]; });
    socket.on('admin_login', (k) => { if(k===ADMIN_KEY) { socket.join('admin_group'); socket.emit('admin_auth_success'); } });
    socket.on('draw_stroke', (d) => socket.to(d.roomId).emit('receive_stroke', d));
    function syncData(rid) { if(rooms[rid]) io.to(rid).emit('room_update', { roomId: rid, players: rooms[rid].players, hostId: rooms[rid].host }); }
});
server.listen(3000);
