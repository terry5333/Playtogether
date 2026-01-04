const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const rooms = {};

io.on('connection', (socket) => {
    socket.on('join_room', (data) => {
        const { roomId, username, gameType } = data;
        socket.join(roomId);
        socket.username = username;
        if (!rooms[roomId]) rooms[roomId] = { gameType, host: socket.id, players: [], gameStarted: false, turnIdx: 0, currentAnswer: "" };
        rooms[roomId].players.push({ id: socket.id, name: username });
        io.to(roomId).emit('room_update', rooms[roomId]);
    });

    socket.on('start_game', (data) => {
        const room = rooms[data.roomId];
        if (!room) return;
        room.gameStarted = true;
        // 分配第一個畫家
        const painter = room.players[0];
        io.to(data.roomId).emit('game_begin', { 
            turnId: painter.id, 
            turnName: painter.name, 
            winLines: data.winLines || 3 
        });
    });

    // 關鍵：轉發繪圖數據給房間內所有人
    socket.on('drawing', (data) => {
        socket.to(data.roomId).emit('render_drawing', data);
    });

    socket.on('set_word', (data) => {
        if(rooms[data.roomId]) {
            rooms[data.roomId].currentAnswer = data.word;
            io.to(data.roomId).emit('chat_msg', { name: "系統", msg: "畫家已出題，大家快猜！" });
        }
    });

    socket.on('send_chat', (data) => {
        const room = rooms[data.roomId];
        if (room && room.gameStarted && room.gameType === 'draw' && data.msg === room.currentAnswer) {
            io.to(data.roomId).emit('game_over', { msg: `猜對了！答案是 [${room.currentAnswer}]`, subMsg: `${socket.username} 獲得勝利！` });
        } else {
            io.to(data.roomId).emit('chat_msg', { name: socket.username, msg: data.msg });
        }
    });

    socket.on('bingo_click', (data) => {
        const room = rooms[data.roomId];
        if (room && room.players[room.turnIdx].id === socket.id) {
            io.to(data.roomId).emit('bingo_sync', data.num);
            room.turnIdx = (room.turnIdx + 1) % room.players.length;
            io.to(data.roomId).emit('next_turn', { turnId: room.players[room.turnIdx].id, turnName: room.players[room.turnIdx].name });
        }
    });

    socket.on('bingo_win', (data) => io.to(data.roomId).emit('game_over', { msg: `${data.name} BINGO!`, subMsg: "遊戲結束" }));
});

server.listen(3000, '0.0.0.0');
