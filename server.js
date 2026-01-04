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
        const { roomId, username, gameType } = data;
        socket.join(roomId);
        socket.username = username;
        socket.currentRoom = roomId;
        if (!rooms[roomId]) {
            rooms[roomId] = { gameType, host: socket.id, players: [], gameStarted: false, turnIdx: 0 };
        }
        rooms[roomId].players.push({ id: socket.id, name: username });
        io.to(roomId).emit('room_update', rooms[roomId]);
    });

    socket.on('start_game', (data) => {
        const room = rooms[data.roomId];
        if (!room || room.host !== socket.id) return;
        room.gameStarted = true;
        room.turnIdx = 0;

        // 如果是你畫我猜，立即指定畫家
        if (room.gameType === 'draw') {
            const painter = room.players[room.turnIdx];
            io.to(data.roomId).emit('new_draw_round', { 
                painterId: painter.id, 
                painterName: painter.name 
            });
        }
        io.to(data.roomId).emit('game_begin', { gameType: room.gameType });
    });

    socket.on('set_word', (data) => {
        const room = rooms[data.roomId];
        if (room) {
            room.currentAnswer = data.word;
            io.to(data.roomId).emit('chat_msg', { name: "系統", msg: "題目已出好，大家開猜！" });
        }
    });

    socket.on('drawing', (data) => socket.to(data.roomId).emit('render_drawing', data));
    socket.on('clear_canvas', (rId) => io.to(rId).emit('do_clear'));

    socket.on('send_chat', (data) => {
        const room = rooms[data.roomId];
        if (room && room.gameType === 'draw' && room.currentAnswer && data.msg === room.currentAnswer) {
            io.to(data.roomId).emit('round_over', { winner: socket.username });
            // 自動下一輪
            room.turnIdx = (room.turnIdx + 1) % room.players.length;
            const nextPainter = room.players[room.turnIdx];
            setTimeout(() => {
                io.to(data.roomId).emit('new_draw_round', { painterId: nextPainter.id, painterName: nextPainter.name });
            }, 3000);
        } else {
            io.to(data.roomId).emit('chat_msg', { name: socket.username, msg: data.msg });
        }
    });
});

server.listen(3000, '0.0.0.0');
