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
    // 創建房間邏輯
    socket.on('create_room', () => {
        const roomId = Math.floor(1000 + Math.random() * 9000).toString();
        rooms[roomId] = { host: socket.id, players: [], gameStarted: false };
        socket.emit('room_created', { roomId });
    });

    // 加入房間
    socket.on('join_room', (data) => {
        const { roomId, username } = data;
        if (!rooms[roomId]) return socket.emit('error_msg', '房間不存在');
        
        socket.join(roomId);
        socket.roomId = roomId;
        socket.username = username;
        
        rooms[roomId].players.push({ id: socket.id, name: username });
        
        // 廣播更新房間資訊給所有人
        io.to(roomId).emit('room_update', {
            roomId: roomId,
            players: rooms[roomId].players,
            hostId: rooms[roomId].host
        });
    });

    // 聊天室邏輯
    socket.on('send_chat', (data) => {
        io.to(data.roomId).emit('receive_chat', {
            user: data.user,
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
            if (rooms[socket.roomId].players.length === 0) {
                delete rooms[socket.roomId];
            } else {
                io.to(socket.roomId).emit('room_update', {
                    roomId: socket.roomId,
                    players: rooms[socket.roomId].players,
                    hostId: rooms[socket.roomId].host
                });
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
