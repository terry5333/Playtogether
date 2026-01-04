const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};

io.on('connection', (socket) => {
    socket.on('join_room', (data) => {
        const { roomId, username, gameType } = data;
        const rId = roomId.trim();
        socket.join(rId);
        socket.username = username;
        socket.currentRoom = rId;

        if (!rooms[rId]) {
            rooms[rId] = {
                gameType, host: socket.id, players: [],
                gameStarted: false, turnIndex: 0, currentWord: "", currentPainter: null
            };
        }
        rooms[rId].players.push({ id: socket.id, name: username });
        io.to(rId).emit('room_update', rooms[rId]);
    });

    // 房主啟動遊戲，通知第一位玩家出題
    socket.on('start_game', (roomId) => {
        const room = rooms[roomId];
        if (!room || room.host !== socket.id) return;
        room.gameStarted = true;
        sendPickerNotification(roomId);
    });

    // 通知當前輪到的玩家「設定題目」
    function sendPickerNotification(roomId) {
        const room = rooms[roomId];
        const picker = room.players[room.turnIndex];
        room.currentPainter = picker.id;
        io.to(roomId).emit('waiting_for_word', { pickerName: picker.name, pickerId: picker.id });
    }

    // 玩家提交自己出的題目
    socket.on('set_word', (data) => {
        const room = rooms[data.roomId];
        if (room && socket.id === room.currentPainter) {
            room.currentWord = data.word;
            io.to(data.roomId).emit('draw_start', { 
                painterId: room.currentPainter, 
                painterName: socket.username,
                word: room.currentWord 
            });
        }
    });

    socket.on('drawing', (data) => socket.to(data.roomId).emit('render_drawing', data));
    socket.on('clear_canvas', (roomId) => io.to(roomId).emit('do_clear_canvas'));

    socket.on('send_guess', (data) => {
        const room = rooms[data.roomId];
        if (room && data.msg === room.currentWord) {
            io.to(data.roomId).emit('round_over', { winner: socket.username, word: room.currentWord });
            
            // 輪向下一位
            room.turnIndex = (room.turnIndex + 1) % room.players.length;
            setTimeout(() => {
                io.to(data.roomId).emit('do_clear_canvas');
                sendPickerNotification(data.roomId);
            }, 3000);
        } else {
            io.to(data.roomId).emit('chat_msg', { name: socket.username, msg: data.msg });
        }
    });

    socket.on('disconnect', () => {
        const rId = socket.currentRoom;
        if (rooms[rId]) {
            rooms[rId].players = rooms[rId].players.filter(p => p.id !== socket.id);
            if (rooms[rId].players.length === 0) delete rooms[rId];
            else io.to(rId).emit('room_update', rooms[rId]);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0');
