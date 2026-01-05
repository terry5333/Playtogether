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
    // 1. 創建房間
    socket.on('create_room', () => {
        const roomId = Math.floor(1000 + Math.random() * 9000).toString();
        rooms[roomId] = {
            host: socket.id, // 創建者即為房主
            players: [],
            gameStarted: false,
            scores: {}
        };
        socket.emit('room_created', { roomId });
    });

    // 2. 加入房間
    socket.on('join_room', (data) => {
        const { roomId, username } = data;
        if (!rooms[roomId]) return socket.emit('error_msg', '房間不存在');

        socket.join(roomId);
        socket.roomId = roomId;
        socket.username = username;

        // 如果原房主斷線，讓第一個進來的人補位
        if (!rooms[roomId].host) rooms[roomId].host = socket.id;

        // 確保名單不重複
        if (!rooms[roomId].players.find(p => p.id === socket.id)) {
            rooms[roomId].players.push({ id: socket.id, name: username });
            rooms[roomId].scores[username] = 0;
        }

        // 廣播給房間所有人，包含 hostId 供前端判定
        io.to(roomId).emit('room_update', {
            roomId: roomId,
            players: rooms[roomId].players,
            hostId: rooms[roomId].host,
            gameStarted: rooms[roomId].gameStarted
        });
    });

    // 3. 房主啟動遊戲
    socket.on('start_game_with_config', (data) => {
        const room = rooms[data.roomId];
        if (room && room.host === socket.id) {
            room.gameStarted = true;
            io.to(data.roomId).emit('game_begin', data);
        }
    });

    // 4. 斷線處理
    socket.on('disconnect', () => {
        if (socket.roomId && rooms[socket.roomId]) {
            const room = rooms[socket.roomId];
            room.players = room.players.filter(p => p.id !== socket.id);
            if (room.players.length === 0) {
                delete rooms[socket.roomId];
            } else {
                if (room.host === socket.id) room.host = room.players[0].id;
                io.to(socket.roomId).emit('room_update', {
                    roomId: socket.roomId,
                    players: room.players,
                    hostId: room.host
                });
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server is running on ${PORT}`));
