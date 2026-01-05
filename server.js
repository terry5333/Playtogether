const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 靜態檔案目錄
app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};
const ADMIN_KEY = "bitch12345";

// 管理員 API
app.get('/admin-api', (req, res) => {
    if(req.query.key === ADMIN_KEY) res.json(rooms);
    else res.status(403).send("Forbidden");
});

io.on('connection', (socket) => {
    // 這裡放你之前的 socket.on 邏輯...
    // (join_room, start_game, bingo_click, cast_vote, drawing 等)
    
    socket.on('join_room', (data) => {
        const { roomId, username } = data;
        socket.join(roomId);
        if (!rooms[roomId]) {
            rooms[roomId] = { host: socket.id, players: [], gameStarted: false };
        }
        rooms[roomId].players.push({ id: socket.id, name: username });
        io.to(roomId).emit('room_update', rooms[roomId]);
    });
});

// 修正：必須使用 process.env.PORT 否則雲端空間會判定啟動失敗
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
