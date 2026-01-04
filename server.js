const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const rooms = {};
const spyWordBank = [
    { n: "泡麵", s: "快煮麵" }, { n: "西瓜", s: "木瓜" }, { n: "咖啡", s: "奶茶" },
    { n: "滑鼠", s: "觸控板" }, { n: "炸雞", s: "烤雞" }, { n: "手機", s: "平板" }
];

io.on('connection', (socket) => {
    socket.on('join_room', (data) => {
        const { roomId, username, gameType } = data;
        if (!roomId || !username) return;
        socket.join(roomId);
        socket.username = username;
        socket.roomId = roomId;

        if (!rooms[roomId]) {
            rooms[roomId] = { gameType, host: socket.id, players: [], gameStarted: false, turnIdx: 0, currentAnswer: "", winLines: 3 };
        }
        rooms[roomId].players.push({ id: socket.id, name: username });
        io.to(roomId).emit('room_update', rooms[roomId]);
    });

    socket.on('start_game', (data) => {
        const room = rooms[data.roomId];
        if (!room || room.host !== socket.id) return;
        room.gameStarted = true;
        room.winLines = parseInt(data.winLines) || 3;
        room.turnIdx = 0;

        if (room.gameType === 'spy') {
            const pair = spyWordBank[Math.floor(Math.random() * spyWordBank.length)];
            const spyIdx = Math.floor(Math.random() * room.players.length);
            room.players.forEach((p, i) => {
                io.to(p.id).emit('spy_setup', { word: (i === spyIdx ? pair.s : pair.n), role: (i === spyIdx ? "臥底" : "平民") });
            });
        }
        sendTurnUpdate(data.roomId);
    });

    function sendTurnUpdate(roomId) {
        const room = rooms[roomId];
        if (!room || room.players.length === 0) return;
        const p = room.players[room.turnIdx];
        room.currentAnswer = ""; 
        io.to(roomId).emit('game_begin', { turnId: p.id, turnName: p.name, winLines: room.winLines });
    }

    socket.on('send_chat', (data) => {
        const room = rooms[data.roomId];
        if (!room) return;
        if (room.gameType === 'draw' && room.currentAnswer && data.msg.trim() === room.currentAnswer) {
            io.to(data.roomId).emit('chat_msg', { name: "📢", msg: `猜對了！答案是 [${room.currentAnswer}]` });
            setTimeout(() => {
                room.turnIdx = (room.turnIdx + 1) % room.players.length;
                sendTurnUpdate(data.roomId);
                io.to(data.roomId).emit('clear_canvas');
            }, 2000);
        } else {
            io.to(data.roomId).emit('chat_msg', { name: socket.username, msg: data.msg });
        }
    });

    socket.on('drawing', (d) => socket.to(d.roomId).emit('render_drawing', d));
    socket.on('set_word', (d) => { if(rooms[d.roomId]) rooms[d.roomId].currentAnswer = d.word; });
    socket.on('bingo_click', (d) => {
        const room = rooms[d.roomId];
        if (room) {
            io.to(d.roomId).emit('bingo_sync', d.num);
            room.turnIdx = (room.turnIdx + 1) % room.players.length;
            sendTurnUpdate(d.roomId);
        }
    });
    socket.on('bingo_win', (d) => io.to(d.roomId).emit('game_over', { msg: `🏆 ${d.name} 贏了！` }));

    socket.on('disconnect', () => {
        if (socket.roomId && rooms[socket.roomId]) {
            rooms[socket.roomId].players = rooms[socket.roomId].players.filter(p => p.id !== socket.id);
            if (rooms[socket.roomId].players.length === 0) delete rooms[socket.roomId];
            else io.to(socket.roomId).emit('room_update', rooms[socket.roomId]);
        }
    });
});
server.listen(3000, '0.0.0.0');
