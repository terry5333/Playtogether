const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 關鍵：告訴伺服器去 'public' 資料夾尋找靜態網頁檔案
app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};
const IDLE_TIME = 5 * 60 * 1000; // 5 分鐘

function resetIdleTimer(roomId) {
    if (!rooms[roomId]) return;
    if (rooms[roomId].idleTimer) clearTimeout(rooms[roomId].idleTimer);
    rooms[roomId].idleTimer = setTimeout(() => {
        io.to(roomId).emit('room_closed', { msg: "房間因閒置超過 5 分鐘已自動關閉" });
        delete rooms[roomId];
    }, IDLE_TIME);
}

io.on('connection', (socket) => {
    socket.on('join_room', (data) => {
        const { roomId, username, gameType } = data;
        socket.join(roomId);
        socket.roomId = roomId;

        if (!rooms[roomId]) {
            rooms[roomId] = { 
                gameType, host: socket.id, players: [], 
                gameStarted: false, turnIdx: 0, winLines: 3, 
                idleTimer: null 
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
        room.winLines = parseInt(data.winLines) || 3;
        
        io.to(data.roomId).emit('game_begin', { 
            turnId: room.players[0].id, 
            turnName: room.players[0].name,
            winLines: room.winLines 
        });
    });

    socket.on('bingo_click', (data) => {
        resetIdleTimer(data.roomId);
        const room = rooms[data.roomId];
        if (room) {
            io.to(data.roomId).emit('bingo_sync', data.num);
            room.turnIdx = (room.turnIdx + 1) % room.players.length;
            const nextP = room.players[room.turnIdx];
            io.to(data.roomId).emit('next_turn', { turnId: nextP.id, turnName: nextP.name });
        }
    });

    socket.on('drawing', (d) => {
        socket.to(d.roomId).emit('render_drawing', d);
    });

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

// Render 部署必須監聽 0.0.0.0 並使用 PORT 環境變數
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`伺服器運行於 ${PORT}`));
