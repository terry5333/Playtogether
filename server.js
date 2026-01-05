const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" }, transports: ['websocket'] });

app.use(express.static(path.join(__dirname, 'public')));

let rooms = {};
const WORDS = ["珍奶", "臭豆腐", "長頸鹿", "蜘蛛人", "皮卡丘", "口罩", "漢堡", "鋼琴", "仙人掌", "捷運", "珍珠", "咖啡"];

io.on('connection', (socket) => {
    socket.on('create_room', () => {
        const roomId = Math.floor(1000 + Math.random() * 9000).toString();
        rooms[roomId] = { host: socket.id, players: [], turnIdx: 0, currentRound: 1, totalRounds: 1, currentWord: "" };
        socket.emit('room_created', { roomId });
    });

    socket.on('join_room', (data) => {
        const { roomId, username } = data;
        if (!rooms[roomId]) return socket.emit('toast', '房間不存在');
        socket.join(roomId);
        socket.roomId = roomId;
        socket.username = username;
        rooms[roomId].players.push({ id: socket.id, name: username, score: 0, isOut: false });
        io.to(roomId).emit('room_update', { roomId, players: rooms[roomId].players, hostId: rooms[roomId].host });
    });

    socket.on('start_game', (data) => {
        const room = rooms[data.roomId];
        if (!room) return;
        room.gameType = data.gameType;
        room.totalRounds = parseInt(data.rounds) || 1;
        room.currentRound = 1;
        room.turnIdx = 0;
        
        if (data.gameType === 'draw') sendDrawTurn(data.roomId);
        else if (data.gameType === 'bingo') {
            room.bingoGoal = data.goal;
            io.to(data.roomId).emit('game_begin', { gameType: 'bingo_prepare', goal: room.bingoGoal });
        } else if (data.gameType === 'spy') {
            const pairs = [["蘋果", "水梨"], ["洗髮精", "沐浴乳"], ["周杰倫", "陳奕迅"]];
            const pair = pairs[Math.floor(Math.random()*pairs.length)];
            const spyIdx = Math.floor(Math.random() * room.players.length);
            room.players.forEach((p, idx) => {
                io.to(p.id).emit('game_begin', { gameType: 'spy', word: idx === spyIdx ? pair[1] : pair[0], isSpy: idx === spyIdx });
            });
        }
    });

    function sendDrawTurn(roomId) {
        const room = rooms[roomId];
        if (room.currentRound > room.totalRounds) return io.to(roomId).emit('game_over', { winner: "遊戲結束", scores: room.players });
        const drawer = room.players[room.turnIdx];
        room.currentWord = "";
        io.to(roomId).emit('game_begin', { 
            gameType: 'draw', drawerId: drawer.id, drawerName: drawer.name,
            roundInfo: `第 ${room.currentRound}/${room.totalRounds} 輪`,
            suggested: WORDS[Math.floor(Math.random() * WORDS.length)]
        });
    }

    socket.on('draw_submit_word', (d) => { if(rooms[d.roomId]) rooms[d.roomId].currentWord = d.word; });
    
    socket.on('draw_guess', (d) => {
        const room = rooms[d.roomId];
        if (room && room.currentWord && d.guess.trim() === room.currentWord.trim()) {
            const p = room.players.find(pl => pl.id === socket.id);
            p.score += 2;
            io.to(d.roomId).emit('toast', `${p.name} 答對了！答案是 [${room.currentWord}]`);
            room.turnIdx++;
            if (room.turnIdx >= room.players.length) { room.turnIdx = 0; room.currentRound++; }
            setTimeout(() => sendDrawTurn(d.roomId), 2000);
        }
    });

    socket.on('draw_stroke', (d) => socket.to(d.roomId).emit('receive_stroke', d));
    socket.on('clear_canvas', (rid) => io.to(rid).emit('canvas_clear_signal'));
    socket.on('bingo_pick', (d) => {
        const room = rooms[d.roomId];
        room.bingoMarked = room.bingoMarked || [];
        room.bingoMarked.push(parseInt(d.num));
        room.turnIdx = (room.turnIdx + 1) % room.players.length;
        io.to(d.roomId).emit('bingo_start', { turnId: room.players[room.turnIdx].id, marked: room.bingoMarked });
    });
    socket.on('bingo_win', (d) => io.to(d.roomId).emit('game_over', { winner: socket.username }));
});

server.listen(process.env.PORT || 3000, '0.0.0.0');
