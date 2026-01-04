const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};
const defaultWords = ["珍珠奶茶", "西瓜", "大象", "漢堡", "蜘蛛人", "口罩", "太陽"];

io.on('connection', (socket) => {
    socket.on('join_room', (data) => {
        const { roomId, username, gameType } = data;
        socket.join(roomId);
        socket.username = username;
        socket.currentRoom = roomId;

        if (!rooms[roomId]) {
            rooms[roomId] = { gameType, host: socket.id, players: [], gameStarted: false, turnIdx: 0, currentAnswer: "" };
        }
        rooms[roomId].players.push({ id: socket.id, name: username });
        io.to(roomId).emit('room_update', rooms[roomId]);
    });

    socket.on('start_game', (data) => {
        const room = rooms[data.roomId];
        if (!room || room.host !== socket.id) return;
        room.gameStarted = true;
        room.turnIdx = 0;
        
        startNewRound(data.roomId);
    });

    function startNewRound(roomId) {
        const room = rooms[roomId];
        const painter = room.players[room.turnIdx];
        room.currentAnswer = ""; // 等待畫家出題
        io.to(roomId).emit('new_round', { 
            painterId: painter.id, 
            painterName: painter.name,
            gameType: room.gameType
        });
    }

    // 畫家設定題目
    socket.on('set_word', (data) => {
        const room = rooms[data.roomId];
        if (room) {
            room.currentAnswer = data.word;
            io.to(data.roomId).emit('chat_msg', { name: "系統", msg: `畫家已出好題，大家開猜！` });
        }
    });

    socket.on('send_chat', (data) => {
        const room = rooms[data.roomId];
        if (room && room.gameType === 'draw' && room.currentAnswer && data.msg === room.currentAnswer) {
            // 猜對了
            io.to(data.roomId).emit('round_over', { winner: socket.username, word: room.currentAnswer });
            // 下一位畫家
            room.turnIdx = (room.turnIdx + 1) % room.players.length;
            setTimeout(() => startNewRound(data.roomId), 3000);
        } else {
            io.to(data.roomId).emit('chat_msg', { name: socket.username, msg: data.msg });
        }
    });

    socket.on('drawing', (data) => socket.to(data.roomId).emit('render_drawing', data));
    socket.on('clear_canvas', (roomId) => io.to(roomId).emit('do_clear'));

    socket.on('disconnect', () => {
        const rId = socket.currentRoom;
        if (rooms[rId]) {
            rooms[rId].players = rooms[rId].players.filter(p => p.id !== socket.id);
            if (rooms[rId].players.length === 0) delete rooms[rId];
            else io.to(rId).emit('room_update', rooms[rId]);
        }
    });
});

server.listen(3000, '0.0.0.0');
