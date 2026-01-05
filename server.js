const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));

let rooms = {};

io.on('connection', (socket) => {
    // 創建與加入邏輯
    socket.on('create_room', () => {
        const roomId = Math.floor(1000 + Math.random() * 9000).toString();
        rooms[roomId] = { host: socket.id, players: [], gameType: "大廳", currentWord: "" };
        socket.emit('room_created', { roomId });
    });

    socket.on('join_room', (data) => {
        const { roomId, username } = data;
        if (!rooms[roomId]) return socket.emit('toast', '房間不存在');
        socket.join(roomId);
        socket.roomId = roomId;
        socket.username = username;
        if (!rooms[roomId].players.find(p => p.id === socket.id)) {
            rooms[roomId].players.push({ id: socket.id, name: username, bingoBoard: [], word: "", role: "" });
        }
        io.to(roomId).emit('room_update', { roomId, players: rooms[roomId].players, hostId: rooms[roomId].host });
    });

    // 啟動遊戲核心 (補齊所有遊戲分支)
    socket.on('start_game', (data) => {
        const room = rooms[data.roomId];
        if (!room || room.host !== socket.id) return;
        room.gameType = data.gameType;

        if (data.gameType === 'spy') {
            const pair = [["蘋果", "水梨"], ["鋼筆", "鉛筆"]][Math.floor(Math.random()*2)];
            const spyIdx = Math.floor(Math.random() * room.players.length);
            room.players.forEach((p, idx) => {
                const isSpy = idx === spyIdx;
                p.word = isSpy ? pair[1] : pair[0];
                io.to(p.id).emit('game_begin', { gameType: 'spy', word: p.word });
            });
        } else if (data.gameType === 'draw') {
            // 第一位玩家當畫家
            const drawer = room.players[0];
            io.to(data.roomId).emit('game_begin', { gameType: 'draw', drawerId: drawer.id, drawerName: drawer.name });
        } else {
            io.to(data.roomId).emit('game_begin', { gameType: data.gameType });
        }
    });

    // 你話我猜：畫筆同步
    socket.on('draw_stroke', (data) => {
        socket.to(data.roomId).emit('receive_stroke', data);
    });

    socket.on('draw_submit_word', (data) => {
        rooms[data.roomId].currentWord = data.word;
        io.to(data.roomId).emit('toast', '畫家已出題，開始猜題！');
    });

    socket.on('draw_guess', (data) => {
        if (data.guess === rooms[data.roomId].currentWord) {
            io.to(data.roomId).emit('toast', `恭喜 ${socket.username} 猜對了！`, "#16a34a");
            io.to(data.roomId).emit('draw_correct', { winner: socket.username });
        }
    });

    // 賓果獲勝
    socket.on('bingo_win', (data) => {
        io.to(data.roomId).emit('toast', `🎉 ${data.name} 賓果連線成功！`, "#16a34a");
    });
});

server.listen(3000);
