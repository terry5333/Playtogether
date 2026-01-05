const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// 設定靜態檔案目錄
app.use(express.static(path.join(__dirname, 'public')));

let rooms = {};
const ADMIN_KEY = "1010215";

io.on('connection', (socket) => {
    // 創建房間
    socket.on('create_room', () => {
        const roomId = Math.floor(1000 + Math.random() * 9000).toString();
        rooms[roomId] = { host: socket.id, players: [], gameType: "大廳", turnIdx: 0, currentRound: 1, totalRounds: 1, bingoMarked: [] };
        socket.emit('room_created', { roomId });
    });

    // 加入房間
    socket.on('join_room', (data) => {
        const { roomId, username } = data;
        if (!rooms[roomId]) return socket.emit('toast', '房間不存在');
        socket.join(roomId);
        socket.roomId = roomId;
        socket.username = username;
        rooms[roomId].players.push({ id: socket.id, name: username, score: 0, ready: false });
        syncData(roomId);
    });

    // 開始遊戲設定
    socket.on('start_game_with_settings', (data) => {
        const room = rooms[data.roomId];
        if (!room) return;
        room.gameType = data.gameType;
        room.totalRounds = parseInt(data.settings.rounds) || 1;
        room.turnIdx = 0; room.currentRound = 1;
        room.players.forEach(p => { p.score = 0; p.ready = false; });

        if (data.gameType === 'draw') sendDrawTurn(data.roomId);
        else if (data.gameType === 'spy') {
            const pairs = [["西瓜", "香瓜"], ["原子筆", "鉛筆"], ["火鍋", "烤肉"]];
            const pair = pairs[Math.floor(Math.random()*pairs.length)];
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
        io.to(roomId).emit('game_begin', { gameType: 'draw', drawerId: drawer.id, drawerName: drawer.name, roundInfo: `第 ${room.currentRound}/${room.totalRounds} 輪` });
    }

    socket.on('draw_submit_word', (d) => { if(rooms[d.roomId]) rooms[d.roomId].currentWord = d.word; });
    
    socket.on('draw_guess', (d) => {
        const room = rooms[d.roomId];
        if (room && d.guess.trim() === room.currentWord?.trim()) {
            room.players.find(p => p.id === socket.id).score += 2;
            room.turnIdx++;
            if (room.turnIdx >= room.players.length) { room.turnIdx = 0; room.currentRound++; }
            io.to(d.roomId).emit('toast', `${socket.username} 答對了！`, '#16a34a');
            setTimeout(() => sendDrawTurn(d.roomId), 1500);
        }
    });

    socket.on('bingo_ready', (d) => {
        const room = rooms[d.roomId];
        const p = room.players.find(p => p.id === socket.id);
        if(p) { p.ready = true; p.bingoBoard = d.board; }
        if (room.players.every(pl => pl.ready)) { room.turnIdx = 0; room.bingoMarked = []; sendBingoTurn(d.roomId); }
    });

    function sendBingoTurn(roomId) {
        const room = rooms[roomId];
        io.to(roomId).emit('bingo_start', { turnName: room.players[room.turnIdx].name, turnId: room.players[room.turnIdx].id, marked: room.bingoMarked });
    }

    socket.on('bingo_pick', (d) => {
        const room = rooms[d.roomId];
        room.bingoMarked.push(parseInt(d.num));
        room.turnIdx = (room.turnIdx + 1) % room.players.length;
        sendBingoTurn(d.roomId);
    });

    socket.on('draw_stroke', (d) => socket.to(d.roomId).emit('receive_stroke', d));
    
    socket.on('admin_login', (k) => { 
        if(k === ADMIN_KEY) { 
            socket.join('admin_group'); 
            socket.emit('admin_auth_success'); 
        } 
    });

    function syncData(rid) { 
        if(rooms[rid]) io.to(rid).emit('room_update', { roomId: rid, players: rooms[rid].players, hostId: rooms[rid].host }); 
    }

    socket.on('disconnect', () => { /* 處理斷線邏輯 */ });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
