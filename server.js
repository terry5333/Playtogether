const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const rooms = {};
const spyWords = [{ n: "西瓜", s: "木瓜" }, { n: "咖啡", s: "奶茶" }, { n: "手機", s: "平板" }];

io.on('connection', (socket) => {
    socket.on('join_room', (data) => {
        const { roomId, username, gameType } = data;
        socket.join(roomId);
        socket.username = username;
        socket.roomId = roomId;

        if (!rooms[roomId]) {
            rooms[roomId] = { 
                gameType, // 儲存房間模式
                host: socket.id, 
                players: [], 
                gameStarted: false, 
                turnIdx: 0, 
                currentAnswer: "", 
                timer: null 
            };
        }
        rooms[roomId].players.push({ id: socket.id, name: username });
        
        // 回傳房間資料，包含 gameType 確保前端顯示正確 UI
        io.to(roomId).emit('room_update', rooms[roomId]);
    });

    socket.on('start_game', (data) => {
        const room = rooms[data.roomId];
        if (!room || room.host !== socket.id) return;
        room.gameStarted = true;

        if (room.gameType === 'spy') {
            const pair = spyWords[Math.floor(Math.random() * spyWords.length)];
            const spyIdx = Math.floor(Math.random() * room.players.length);
            room.players.forEach((p, i) => {
                io.to(p.id).emit('spy_setup', { word: (i === spyIdx ? pair.s : pair.n), role: (i === spyIdx ? "臥底" : "平民") });
            });
            // 啟動 60 秒自動倒數
            let timeLeft = 60;
            room.timer = setInterval(() => {
                timeLeft--;
                io.to(data.roomId).emit('timer_tick', timeLeft);
                if (timeLeft <= 0) {
                    clearInterval(room.timer);
                    io.to(data.roomId).emit('start_voting');
                }
            }, 1000);
        }
        
        const p = room.players[room.turnIdx];
        io.to(data.roomId).emit('game_begin', { turnId: p.id, turnName: p.name, gameType: room.gameType });
    });

    // ... 其他 set_word, drawing, bingo_click 邏輯 ...
});
server.listen(3000, '0.0.0.0');
