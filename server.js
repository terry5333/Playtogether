const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};
const spyWords = [
    {n:"泡麵", s:"快煮麵"}, {n:"珍珠奶茶", s:"波霸奶茶"}, 
    {n:"西瓜", s:"木瓜"}, {n:"炸雞", s:"烤雞"}, {n:"手機", s:"平板"}
];

io.on('connection', (socket) => {
    socket.on('join_room', (data) => {
        const { roomId, username, gameType } = data;
        socket.join(roomId);
        socket.username = username;
        socket.currentRoom = roomId;
        if (!rooms[roomId]) {
            rooms[roomId] = { gameType, host: socket.id, players: [], gameStarted: false, turnIdx: 0, votes: {}, roles: {}, currentAnswer: "" };
        }
        rooms[roomId].players.push({ id: socket.id, name: username });
        io.to(roomId).emit('room_update', rooms[roomId]);
    });

    socket.on('start_game', (data) => {
        const room = rooms[data.roomId];
        if (!room || room.host !== socket.id) return;
        room.gameStarted = true;
        room.votes = {};
        room.turnIdx = 0;

        if (room.gameType === 'spy') {
            const pair = spyWords[Math.floor(Math.random() * spyWords.length)];
            const spyIdx = Math.floor(Math.random() * room.players.length);
            room.players.forEach((p, i) => {
                const role = (i === spyIdx ? '臥底' : '平民');
                room.roles[p.id] = { role, name: p.name, word: (i === spyIdx ? pair.s : pair.n) };
                io.to(p.id).emit('receive_spy_word', { word: room.roles[p.id].word, role });
            });
            let count = 60;
            const timer = setInterval(() => {
                count--;
                io.to(data.roomId).emit('timer_update', count);
                if (count <= 0) { clearInterval(timer); io.to(data.roomId).emit('start_voting'); }
            }, 1000);
        } else if (room.gameType === 'draw') {
            sendNewDrawRound(data.roomId);
        }
        io.to(data.roomId).emit('game_begin', { gameType: room.gameType });
    });

    function sendNewDrawRound(roomId) {
        const room = rooms[roomId];
        const painter = room.players[room.turnIdx];
        io.to(roomId).emit('new_draw_round', { painterId: painter.id, painterName: painter.name });
    }

    socket.on('cast_vote', (data) => {
        const room = rooms[data.roomId];
        if (!room || room.votes[socket.id]) return;
        room.votes[socket.id] = data.targetId;
        io.to(data.roomId).emit('chat_msg', { name: "系統", msg: `📢 ${socket.username} 已完成投票` });

        if (Object.keys(room.votes).length === room.players.length) {
            const counts = {};
            Object.values(room.votes).forEach(id => counts[id] = (counts[id] || 0) + 1);
            const maxId = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
            const target = room.roles[maxId];
            const winMsg = (target.role === '臥底') ? "🎉 平民勝利！抓到臥底了！" : "💀 抓錯人了！臥底勝利！";
            io.to(data.roomId).emit('game_over', { msg: `最高票是 ${target.name}，他是 ${target.role}`, subMsg: winMsg });
            room.gameStarted = false;
        }
    });

    socket.on('set_word', (data) => { if(rooms[data.roomId]) rooms[data.roomId].currentAnswer = data.word; });
    socket.on('drawing', (data) => socket.to(data.roomId).emit('render_drawing', data));
    socket.on('clear_canvas', (rId) => io.to(rId).emit('do_clear'));
    socket.on('send_chat', (data) => {
        const room = rooms[data.roomId];
        if (room && room.gameType === 'draw' && data.msg === room.currentAnswer) {
            io.to(data.roomId).emit('chat_msg', { name: "系統", msg: `🎉 ${socket.username} 猜對了！答案是 ${room.currentAnswer}` });
            room.turnIdx = (room.turnIdx + 1) % room.players.length;
            setTimeout(() => sendNewDrawRound(data.roomId), 2000);
        } else {
            io.to(data.roomId).emit('chat_msg', { name: socket.username, msg: data.msg });
        }
    });

    socket.on('disconnect', () => { /* 斷線清理邏輯 */ });
});

server.listen(3000, '0.0.0.0');
