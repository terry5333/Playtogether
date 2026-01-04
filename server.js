const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};
const spyWords = [{ n: "西瓜", s: "木瓜" }, { n: "泡麵", s: "快煮麵" }, { n: "手機", s: "平板" }];
const IDLE_TIME = 5 * 60 * 1000; // 5分鐘

// --- 輔助函式：重置閒置計時器 ---
function resetIdleTimer(roomId) {
    if (!rooms[roomId]) return;
    if (rooms[roomId].idleTimer) clearTimeout(rooms[roomId].idleTimer);
    rooms[roomId].idleTimer = setTimeout(() => {
        io.to(roomId).emit('room_closed', { msg: "房間因閒置超過 5 分鐘已自動關閉" });
        if (rooms[roomId].timer) clearInterval(rooms[roomId].timer);
        delete rooms[roomId];
    }, IDLE_TIME);
}

io.on('connection', (socket) => {
    socket.on('join_room', (data) => {
        const { roomId, username, gameType } = data;
        socket.join(roomId);
        socket.username = username;
        socket.roomId = roomId;

        if (!rooms[roomId]) {
            rooms[roomId] = { 
                gameType, host: socket.id, players: [], 
                gameStarted: false, turnIdx: 0, winLines: 3, 
                votes: {}, idleTimer: null 
            };
        }
        rooms[roomId].players.push({ id: socket.id, name: username });
        resetIdleTimer(roomId);
        io.to(roomId).emit('room_update', rooms[roomId]);
    });

    socket.on('start_game', (data) => {
        const room = rooms[data.roomId];
        if (!room || room.host !== socket.id) return;
        resetIdleTimer(data.roomId);
        room.gameStarted = true;
        room.turnIdx = 0;
        room.winLines = parseInt(data.winLines) || 3;

        if (room.gameType === 'spy') {
            const pair = spyWords[Math.floor(Math.random() * spyWords.length)];
            const spyIdx = Math.floor(Math.random() * room.players.length);
            room.players.forEach((p, i) => {
                io.to(p.id).emit('spy_setup', { word: (i === spyIdx ? pair.s : pair.n), role: (i === spyIdx ? "臥底" : "平民") });
            });
            let timeLeft = 60;
            const t = setInterval(() => {
                timeLeft--;
                io.to(data.roomId).emit('timer_tick', timeLeft);
                if (timeLeft <= 0) { clearInterval(t); io.to(data.roomId).emit('start_voting'); }
            }, 1000);
            room.timer = t;
        }
        
        io.to(data.roomId).emit('game_begin', { 
            turnId: room.players[0].id, turnName: room.players[0].name,
            gameType: room.gameType, winLines: room.winLines 
        });
    });

    socket.on('bingo_click', (data) => {
        resetIdleTimer(data.roomId);
        const room = rooms[data.roomId];
        if (room && room.gameStarted) {
            io.to(data.roomId).emit('bingo_sync', data.num);
            room.turnIdx = (room.turnIdx + 1) % room.players.length;
            io.to(data.roomId).emit('next_turn', { turnId: room.players[room.turnIdx].id, turnName: room.players[room.turnIdx].name });
        }
    });

    socket.on('drawing', (d) => {
        socket.to(d.roomId).emit('render_drawing', d);
        if (Math.random() > 0.95) resetIdleTimer(d.roomId); // 降低畫圖頻率的壓力
    });

    socket.on('set_word', (d) => { resetIdleTimer(d.roomId); io.to(d.roomId).emit('topic_locked'); });

    socket.on('disconnect', () => {
        if (socket.roomId && rooms[socket.roomId]) {
            rooms[socket.roomId].players = rooms[socket.roomId].players.filter(p => p.id !== socket.id);
            if (rooms[socket.roomId].players.length === 0) {
                clearTimeout(rooms[socket.roomId].idleTimer);
                delete rooms[socket.roomId];
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`Server: ${PORT}`));
