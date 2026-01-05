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
    // 房間基礎邏輯略...

    // 賓果：開始輪流開號
    socket.on('bingo_start_picking', (data) => {
        const room = rooms[data.roomId];
        room.currentTurnIdx = 0;
        room.pickedNumbers = [];
        sendBingoTurn(data.roomId);
    });

    // 賓果：選號處理
    socket.on('bingo_pick_number', (data) => {
        const room = rooms[data.roomId];
        const num = parseInt(data.number);
        if (!room.pickedNumbers.includes(num)) {
            room.pickedNumbers.push(num);
            // 廣播給全體：哪個號碼被開出了
            io.to(data.roomId).emit('bingo_number_announced', { 
                number: num, 
                pickerName: socket.username 
            });

            // 輪到下一個人
            room.currentTurnIdx = (room.currentTurnIdx + 1) % room.players.length;
            sendBingoTurn(data.roomId);
        }
    });

    function sendBingoTurn(roomId) {
        const room = rooms[roomId];
        const currentPlayer = room.players[room.currentTurnIdx];
        io.to(roomId).emit('bingo_next_turn', { 
            activePlayerId: currentPlayer.id, 
            activePlayerName: currentPlayer.name 
        });
    }

    // 你話我猜：修復出題與轉場
    socket.on('draw_submit_word', (data) => {
        const room = rooms[data.roomId];
        room.currentWord = data.word;
        io.to(data.roomId).emit('draw_guessing_stage', { drawerName: socket.username });
    });

    // 誰是臥底：投票結算
    socket.on('cast_spy_vote', (data) => {
        const room = rooms[data.roomId];
        room.votes = room.votes || {};
        room.votes[data.targetName] = (room.votes[data.targetName] || 0) + 1;
        const alivePlayers = room.players.filter(p => p.alive);
        if (Object.values(room.votes).reduce((a, b) => a + b, 0) >= alivePlayers.length) {
            const loser = Object.keys(room.votes).reduce((a, b) => room.votes[a] > room.votes[b] ? a : b);
            io.to(data.roomId).emit('spy_vote_result', { loser });
            room.votes = {};
        }
    });
});

server.listen(3000);
