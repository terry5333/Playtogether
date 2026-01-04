const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// 儲存所有房間的狀態
const rooms = {};

io.on('connection', (socket) => {
    socket.on('join_room', (data) => {
        const { roomId, maxPlayers, winLines } = data;
        socket.join(roomId);

        // 如果房間不存在，建立新房間，第一個進來的是房主
        if (!rooms[roomId]) {
            rooms[roomId] = {
                admin: socket.id,
                maxPlayers: parseInt(maxPlayers) || 2,
                winLines: parseInt(winLines) || 5,
                players: []
            };
        }

        rooms[roomId].players.push(socket.id);
        
        // 告訴大家目前房間狀態
        io.to(roomId).emit('room_update', {
            isAdmin: socket.id === rooms[roomId].admin,
            currentPlayers: rooms[roomId].players.length,
            maxPlayers: rooms[roomId].maxPlayers,
            winLines: rooms[roomId].winLines
        });
    });

    socket.on('game_move', (data) => {
        socket.to(data.roomId).emit('receive_move', data);
    });

    socket.on('disconnecting', () => {
        for (const roomId of socket.rooms) {
            if (rooms[roomId]) {
                rooms[roomId].players = rooms[roomId].players.filter(id => id !== socket.id);
                if (rooms[roomId].players.length === 0) delete rooms[roomId];
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
