const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

let rooms = {};

io.on('connection', (socket) => {
    // 創建與加入邏輯
    socket.on('join_room', (data) => {
        const { roomId, username } = data;
        socket.join(roomId);
        socket.roomId = roomId;
        socket.username = username;

        if (!rooms[roomId]) {
            rooms[roomId] = { host: socket.id, players: [], gameStarted: false };
        }
        rooms[roomId].players.push({ id: socket.id, name: username });
        
        // 廣播更新房間資訊
        io.to(roomId).emit('room_update', {
            roomId: roomId,
            players: rooms[roomId].players,
            hostId: rooms[roomId].host,
            gameStarted: rooms[roomId].gameStarted
        });
    });

    // 聊天室系統
    socket.on('send_msg', (data) => {
        io.to(data.roomId).emit('receive_msg', {
            user: data.username,
            text: data.text,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
    });

    socket.on('start_game', (data) => {
        const room = rooms[data.roomId];
        if (room && room.host === socket.id) {
            room.gameStarted = true;
            io.to(data.roomId).emit('game_begin', data);
        }
    });

    socket.on('disconnect', () => {
        if (socket.roomId && rooms[socket.roomId]) {
            rooms[socket.roomId].players = rooms[socket.roomId].players.filter(p => p.id !== socket.id);
            io.to(socket.roomId).emit('room_update', {
                roomId: socket.roomId,
                players: rooms[socket.roomId].players,
                hostId: rooms[socket.roomId].host
            });
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
