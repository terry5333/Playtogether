const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};

io.on('connection', (socket) => {
    // 房間基礎邏輯
    socket.on('join_room', (data) => {
        const { roomId, username } = data;
        socket.join(roomId);
        socket.roomId = roomId;
        if (!rooms[roomId]) {
            rooms[roomId] = { host: socket.id, players: [], gameStarted: false, timer: null };
        }
        rooms[roomId].players.push({ id: socket.id, name: username });
        io.to(roomId).emit('room_update', rooms[roomId]);
    });

    // 遊戲啟動分流
    socket.on('start_game', (data) => {
        const room = rooms[data.roomId];
        if (!room || room.host !== socket.id) return;
        room.gameStarted = true;
        room.gameType = data.gameType;

        if (data.gameType === 'bingo') {
            io.to(data.roomId).emit('init_bingo', { winLines: data.settings.winLines });
        } 
        else if (data.gameType === 'draw') {
            room.currentRound = 0;
            room.totalRounds = data.settings.totalRounds;
            startNewDrawRound(data.roomId);
        } 
        else if (data.gameType === 'spy') {
            startSpyGame(data.roomId, data.settings.spyTime);
        }
    });

    // --- Bingo 邏輯 ---
    socket.on('bingo_call', (data) => {
        io.to(data.roomId).emit('bingo_sync', data.num);
        nextTurn(data.roomId);
    });

    // --- Draw 邏輯 ---
    socket.on('drawing', (data) => socket.to(data.roomId).emit('drawing', data));

    // --- Spy 邏輯 ---
    socket.on('cast_vote', (data) => {
        const room = rooms[data.roomId];
        if(!room.votes) room.votes = {};
        room.votes[socket.id] = data.targetId;
        if(Object.keys(room.votes).length === room.players.length) {
            io.to(data.roomId).emit('vote_result', room.votes);
            room.votes = {};
        }
    });

    socket.on('disconnect', () => { /* 斷線處理 */ });
});

// 輔助函式：切換回合與遊戲細節
function nextTurn(roomId) { /* 切換 index 並 emit next_turn */ }
function startSpyGame(roomId, time) { /* 分配詞彙並啟動計時器 */ }
