const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" }, transports: ['websocket'] });

app.use(express.static(path.join(__dirname, 'public')));

let rooms = {};
const WORDS = ["珍奶", "長頸鹿", "蜘蛛人", "口罩", "漢堡", "鋼琴", "仙人掌", "捷運", "珍珠", "咖啡"];
const SPY_PAIRS = [["蘋果", "水梨"], ["洗髮精", "沐浴乳"], ["西瓜", "香瓜"], ["原子筆", "鉛筆"]];

io.on('connection', (socket) => {
    socket.on('create_room', () => {
        const roomId = Math.floor(1000 + Math.random() * 9000).toString();
        rooms[roomId] = { host: socket.id, players: [], turnIdx: 0, currentRound: 1, totalRounds: 1, currentWord: "", bingoMarked: [] };
        socket.emit('room_created', { roomId });
    });

    socket.on('join_room', (d) => {
        if (!rooms[d.roomId]) return socket.emit('toast', '房間不存在');
        socket.join(d.roomId);
        socket.roomId = d.roomId; socket.username = d.username;
        rooms[d.roomId].players.push({ id: socket.id, name: d.username, score: 0, isOut: false, isSpy: false, ready: false });
        syncRoom(d.roomId);
    });

    socket.on('start_game', (d) => {
        const room = rooms[d.roomId]; if (!room) return;
        room.gameType = d.gameType;
        room.totalRounds = parseInt(d.rounds) || 1;
        room.currentRound = 1; room.turnIdx = 0; room.bingoMarked = [];
        room.players.forEach(p => { p.isOut = false; p.ready = false; });

        if (d.gameType === 'draw') sendDrawTurn(d.roomId);
        else if (d.gameType === 'bingo') {
            room.bingoGoal = d.goal;
            io.to(d.roomId).emit('game_begin', { gameType: 'bingo_prepare', goal: room.bingoGoal });
        } else if (d.gameType === 'spy') {
            const pair = SPY_PAIRS[Math.floor(Math.random() * SPY_PAIRS.length)];
            const spyIdx = Math.floor(Math.random() * room.players.length);
            room.players.forEach((p, idx) => {
                p.isSpy = (idx === spyIdx);
                io.to(p.id).emit('game_begin', { gameType: 'spy', word: p.isSpy ? pair[1] : pair[0] });
            });
        }
    });

    // 你話我猜換人邏輯
    function sendDrawTurn(rid) {
        const r = rooms[rid];
        if (r.currentRound > r.totalRounds) return io.to(rid).emit('game_over', { winner: "遊戲結束", scores: r.players });
        const drawer = r.players[r.turnIdx];
        io.to(rid).emit('game_begin', { gameType: 'draw', drawerId: drawer.id, drawerName: drawer.name, info: `第 ${r.currentRound}/${r.totalRounds} 輪`, suggest: WORDS[Math.floor(Math.random()*WORDS.length)] });
    }

    socket.on('draw_guess', (d) => {
        const r = rooms[d.roomId];
        if (d.guess === r.currentWord) {
            r.players.find(p => p.id === socket.id).score += 2;
            r.turnIdx++; if (r.turnIdx >= r.players.length) { r.turnIdx = 0; r.currentRound++; }
            io.to(d.roomId).emit('toast', `答對了！答案是 [${r.currentWord}]`);
            setTimeout(() => sendDrawTurn(d.roomId), 2000);
        }
    });

    socket.on('spy_vote', (d) => {
        const r = rooms[d.roomId]; r.votes = r.votes || {}; r.votes[socket.id] = d.targetId;
        const activeP = r.players.filter(p => !p.isOut);
        if (Object.keys(r.votes).length >= activeP.length) {
            const counts = {}; Object.values(r.votes).forEach(id => counts[id] = (counts[id] || 0) + 1);
            const kickedId = Object.entries(counts).sort((a,b)=>b[1]-a[1])[0][0];
            const kickedP = r.players.find(p => p.id === kickedId);
            kickedP.isOut = true; r.votes = {};
            const spies = r.players.filter(p => !p.isOut && p.isSpy).length;
            const civs = r.players.filter(p => !p.isOut && !p.isSpy).length;
            if (spies === 0) io.to(d.roomId).emit('game_over', { winner: "平民隊", reason: "臥底被抓到了！" });
            else if (civs <= spies) io.to(d.roomId).emit('game_over', { winner: "臥底隊", reason: "臥底成功生存！" });
            else io.to(d.roomId).emit('spy_vote_result', { name: kickedP.name, isSpy: kickedP.isSpy });
        }
    });

    socket.on('bingo_pick', (d) => {
        const r = rooms[d.roomId]; r.bingoMarked.push(parseInt(d.num));
        r.turnIdx = (r.turnIdx + 1) % r.players.length;
        io.to(d.roomId).emit('bingo_start', { turnId: r.players[r.turnIdx].id, marked: r.bingoMarked });
    });

    socket.on('bingo_win', (d) => io.to(d.roomId).emit('game_over', { winner: socket.username, reason: "率先達成連線！" }));
    socket.on('draw_stroke', (d) => socket.to(d.roomId).emit('receive_stroke', d));
    socket.on('clear_canvas', (rid) => io.to(rid).emit('canvas_clear_signal'));
    socket.on('draw_submit_word', (d) => { if(rooms[d.roomId]) rooms[d.roomId].currentWord = d.word; });
    function syncRoom(rid) { io.to(rid).emit('room_update', { roomId: rid, players: rooms[rid].players, hostId: rooms[rid].host }); }
});
server.listen(process.env.PORT || 3000, '0.0.0.0');
