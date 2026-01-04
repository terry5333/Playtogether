const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};

// 誰是臥底題庫 (平民詞, 臥底詞)
const spyWords = [
    ["蘋果", "水梨"], ["電腦", "筆電"], ["跑步", "競走"], 
    ["泡麵", "拉麵"], ["手錶", "鬧鐘"], ["醫生", "護士"],
    ["吉他", "尤克里里"], ["漢堡", "三明治"], ["森林", "公園"]
];

io.on('connection', (socket) => {
    socket.on('join_room', (data) => {
        const { roomId, username, gameType, maxPlayers, winLines } = data;
        const rId = roomId.trim();
        socket.join(rId);
        socket.username = username;
        socket.currentRoom = rId;

        if (!rooms[rId]) {
            rooms[rId] = {
                gameType: gameType,
                host: socket.id,
                maxPlayers: parseInt(maxPlayers) || 2,
                winLines: parseInt(winLines) || 3,
                players: [],
                turnIndex: 0,
                isFinished: false,
                gameStarted: false
            };
        }

        const room = rooms[rId];
        room.players.push({ id: socket.id, name: username });

        io.to(rId).emit('room_update', {
            gameType: room.gameType,
            host: room.host,
            players: room.players,
            maxPlayers: room.maxPlayers,
            winLines: room.winLines,
            gameStarted: room.gameStarted
        });
    });

    socket.on('start_game', (roomId) => {
        const room = rooms[roomId];
        if (!room || room.host !== socket.id) return;
        
        room.gameStarted = true;

        if (room.gameType === 'bingo') {
            io.to(roomId).emit('game_begin', { 
                nextTurnId: room.players[room.turnIndex].id,
                nextTurnName: room.players[room.turnIndex].name
            });
        } else if (room.gameType === 'spy') {
            const pair = spyWords[Math.floor(Math.random() * spyWords.length)];
            const spyIdx = Math.floor(Math.random() * room.players.length);
            room.players.forEach((p, idx) => {
                const word = (idx === spyIdx) ? pair[1] : pair[0];
                io.to(p.id).emit('receive_spy_word', { word: word });
            });
            io.to(roomId).emit('spy_game_begin');
        }
    });

    socket.on('game_move', (data) => {
        const room = rooms[data.roomId];
        if (room && room.gameStarted && !room.isFinished) {
            const currentPlayer = room.players[room.turnIndex];
            if (socket.id !== currentPlayer.id) return;
            room.turnIndex = (room.turnIndex + 1) % room.players.length;
            io.to(data.roomId).emit('receive_move', {
                number: data.number,
                senderName: socket.username,
                nextTurnId: room.players[room.turnIndex].id,
                nextTurnName: room.players[room.turnIndex].name
            });
        }
    });

    socket.on('player_win', (data) => {
        const room = rooms[data.roomId];
        if (room && !room.isFinished) {
            room.isFinished = true;
            io.to(data.roomId).emit('game_over', { winner: socket.username });
        }
    });

    socket.on('disconnect', () => {
        const rId = socket.currentRoom;
        if (rooms[rId]) {
            rooms[rId].players = rooms[rId].players.filter(p => p.id !== socket.id);
            if (rooms[rId].players.length === 0) delete rooms[rId];
            else {
                if (rooms[rId].host === socket.id) rooms[rId].host = rooms[rId].players[0].id;
                io.to(rId).emit('room_update', rooms[rId]);
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`Server on ${PORT}`));
