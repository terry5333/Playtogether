const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};

io.on('connection', (socket) => {
    socket.on('join_room', (data) => {
        const { roomId, username, maxPlayers, winLines } = data;
        socket.join(roomId);
        socket.username = username;
        socket.currentRoom = roomId;

        if (!rooms[roomId]) {
            rooms[roomId] = {
                host: socket.id,
                maxPlayers: parseInt(maxPlayers) || 2,
                winLines: parseInt(winLines) || 5,
                players: [],
                gameStarted: false,
                isFinished: false
            };
        }

        const room = rooms[roomId];
        if (room.gameStarted) {
            socket.emit('error_msg', '遊戲已在進行中，無法加入');
            return;
        }

        room.players.push({ id: socket.id, name: username });
        
        // 更新房間資訊給所有人
        io.to(roomId).emit('room_update', {
            host: room.host,
            players: room.players,
            maxPlayers: room.maxPlayers,
            winLines: room.winLines,
            gameStarted: room.gameStarted
        });
    });

    socket.on('game_move', (data) => {
        if (rooms[data.roomId] && !rooms[data.roomId].isFinished) {
            socket.to(data.roomId).emit('receive_move', {
                number: data.number,
                senderName: socket.username
            });
        }
    });

    // 處理獲勝
    socket.on('player_win', (data) => {
        const room = rooms[data.roomId];
        if (room && !room.isFinished) {
            room.isFinished = true;
            io.to(data.roomId).emit('game_over', { winner: socket.username });
        }
    });

    socket.on('disconnect', () => {
        const roomId = socket.currentRoom;
        if (rooms[roomId]) {
            rooms[roomId].players = rooms[roomId].players.filter(p => p.id !== socket.id);
            if (rooms[roomId].players.length === 0) {
                delete rooms[roomId];
            } else {
                io.to(roomId).emit('room_update', { players: rooms[roomId].players });
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
