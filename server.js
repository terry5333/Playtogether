const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 1. 重要：讓瀏覽器抓得到 public 資料夾裡所有的 .js 檔案
app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};

io.on('connection', (socket) => {
    // 玩家加入房間
    socket.on('join_room', (data) => {
        const { roomId, username } = data;
        socket.join(roomId);
        socket.roomId = roomId;

        if (!rooms[roomId]) {
            rooms[roomId] = { host: socket.id, players: [], gameStarted: false, winLines: 3 };
        }
        rooms[roomId].players.push({ id: socket.id, name: username });
        io.to(roomId).emit('room_update', rooms[roomId]);
    });

    // 開始遊戲
    socket.on('start_game', (data) => {
        const room = rooms[data.roomId];
        if (room && room.host === socket.id) {
            room.gameStarted = true;
            room.winLines = parseInt(data.winLines) || 3;
            io.to(data.roomId).emit('game_begin', { 
                turnId: room.players[0].id, 
                winLines: room.winLines 
            });
        }
    });

    // Bingo 點擊同步
    socket.on('bingo_click', (data) => {
        // 同步數字給房間所有人
        io.to(data.roomId).emit('bingo_sync', data.num);
        
        // 切換下一位玩家
        const room = rooms[data.roomId];
        if (room) {
            const currentIdx = room.players.findIndex(p => p.id === socket.id);
            const nextIdx = (currentIdx + 1) % room.players.length;
            io.to(data.roomId).emit('next_turn', { turnId: room.players[nextIdx].id });
        }
    });

    // 🏆 關鍵修正：解決你日誌中的 RangeError (無限遞迴)
    socket.on('drawing', (data) => {
        if (data.roomId) {
            // 使用 socket.to 表示發送給房間內「除了自己以外」的人
            // 這樣你畫畫時，訊息才不會傳回給你自己，避免崩潰
            socket.to(data.roomId).emit('render_drawing', data);
        }
    });

    socket.on('disconnect', () => {
        if (socket.roomId && rooms[socket.roomId]) {
            rooms[socket.roomId].players = rooms[socket.roomId].players.filter(p => p.id !== socket.id);
            if (rooms[socket.roomId].players.length === 0) delete rooms[socket.roomId];
        }
    });
});

// Render 部署必須監聽 0.0.0.0 並使用 PORT 環境變數
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
