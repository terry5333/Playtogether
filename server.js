const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};
const spyWords = [["蘋果", "水梨"], ["電腦", "筆電"], ["跑步", "競走"], ["泡麵", "拉麵"]];
const drawWords = ["皮卡丘", "珍珠奶茶", "長頸鹿", "自由女神", "海綿寶寶", "口罩", "鋼琴"];

io.on('connection', (socket) => {
    socket.on('join_room', (data) => {
        const { roomId, username, gameType, maxPlayers } = data;
        const rId = roomId.trim();
        socket.join(rId);
        socket.username = username;
        socket.currentRoom = rId;

        if (!rooms[rId]) {
            rooms[rId] = {
                gameType, host: socket.id, players: [],
                gameStarted: false, turnIndex: 0, currentWord: ""
            };
        }
        const room = rooms[rId];
        room.players.push({ id: socket.id, name: username, isAlive: true });
        io.to(rId).emit('room_update', room);
    });

    socket.on('start_game', (roomId) => {
        const room = rooms[roomId];
        if (!room || room.host !== socket.id) return;
        room.gameStarted = true;

        if (room.gameType === 'draw') {
            room.currentWord = drawWords[Math.floor(Math.random() * drawWords.length)];
            const painter = room.players[room.turnIndex];
            io.to(roomId).emit('draw_start', { 
                painterId: painter.id, 
                painterName: painter.name,
                word: room.currentWord 
            });
        } else if (room.gameType === 'spy') {
            const pair = spyWords[Math.floor(Math.random() * spyWords.length)];
            const spyIdx = Math.floor(Math.random() * room.players.length);
            room.players.forEach((p, idx) => {
                io.to(p.id).emit('receive_spy_word', { word: (idx === spyIdx ? pair[1] : pair[0]) });
            });
        }
    });

    // 你畫我猜：畫布座標同步
    socket.on('drawing', (data) => {
        // 包含 x, y, lastX, lastY, color, isDrawing
        socket.to(data.roomId).emit('render_drawing', data);
    });

    socket.on('clear_canvas', (roomId) => {
        io.to(roomId).emit('do_clear_canvas');
    });

    // 猜題檢測
    socket.on('send_guess', (data) => {
        const room = rooms[data.roomId];
        if (room && data.msg === room.currentWord) {
            io.to(data.roomId).emit('game_over', { winner: socket.username, msg: `答案就是 [${room.currentWord}]！` });
        } else {
            io.to(data.roomId).emit('chat_msg', { name: socket.username, msg: data.msg });
        }
    });

    socket.on('disconnect', () => {
        const rId = socket.currentRoom;
        if (rooms[rId]) {
            rooms[rId].players = rooms[rId].players.filter(p => p.id !== socket.id);
            if (rooms[rId].players.length === 0) delete rooms[rId];
            else io.to(rId).emit('room_update', rooms[rId]);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0');
