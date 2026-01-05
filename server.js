const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));

let rooms = {};
const ADMIN_KEY = "1010215";

io.on('connection', (socket) => {
    // --- 房務系統 ---
    socket.on('create_room', () => {
        const roomId = Math.floor(1000 + Math.random() * 9000).toString();
        rooms[roomId] = { host: socket.id, players: [], gameType: "大廳", currentWord: "", turnIdx: 0 };
        socket.emit('room_created', { roomId });
    });

    socket.on('join_room', (data) => {
        const { roomId, username } = data;
        if (!rooms[roomId]) return socket.emit('toast', '房間不存在');
        socket.join(roomId);
        socket.roomId = roomId;
        socket.username = username;
        if (!rooms[roomId].players.find(p => p.id === socket.id)) {
            rooms[roomId].players.push({ id: socket.id, name: username, score: 0, role: "", word: "" });
        }
        syncData(roomId);
    });

    // --- 遊戲啟動控制 ---
    socket.on('start_game', (data) => {
        const room = rooms[data.roomId];
        if (!room || room.host !== socket.id) return;
        room.gameType = data.gameType;

        if (data.gameType === 'draw') {
            sendDrawTurn(data.roomId);
        } else if (data.gameType === 'spy') {
            const pair = [["原子筆", "鉛筆"], ["西瓜", "香瓜"], ["烤肉", "火鍋"]][Math.floor(Math.random()*3)];
            const spyIdx = Math.floor(Math.random() * room.players.length);
            room.players.forEach((p, idx) => {
                p.role = (idx === spyIdx ? "臥底" : "平民");
                p.word = (idx === spyIdx ? pair[1] : pair[0]);
                io.to(p.id).emit('game_begin', { gameType: 'spy', word: p.word });
            });
        } else {
            io.to(data.roomId).emit('game_begin', { gameType: data.gameType });
        }
        syncData(data.roomId);
    });

    // --- 你話我猜 邏輯 ---
    function sendDrawTurn(roomId) {
        const room = rooms[roomId];
        const drawer = room.players[room.turnIdx];
        room.currentWord = ""; 
        io.to(roomId).emit('game_begin', { 
            gameType: 'draw', drawerId: drawer.id, drawerName: drawer.name,
            scores: room.players.map(p => ({name: p.name, score: p.score})) 
        });
    }

    socket.on('draw_submit_word', (data) => {
        if(rooms[data.roomId]) rooms[data.roomId].currentWord = data.word;
        io.to(data.roomId).emit('toast', '畫家已出題，開始猜題！', '#3b82f6');
        sendAdminUpdate();
    });

    socket.on('draw_guess', (data) => {
        const room = rooms[data.roomId];
        if (data.guess === room.currentWord && room.currentWord !== "") {
            const winner = room.players.find(p => p.id === socket.id);
            const drawer = room.players[room.turnIdx];
            if (winner) winner.score += 10;
            if (drawer) drawer.score += 5;
            io.to(data.roomId).emit('toast', `${socket.username} 猜對了！+10分`, '#16a34a');
            room.turnIdx = (room.turnIdx + 1) % room.players.length;
            setTimeout(() => sendDrawTurn(data.roomId), 2000);
            syncData(data.roomId);
        }
    });

    socket.on('draw_stroke', (d) => socket.to(d.roomId).emit('receive_stroke', d));

    // --- 管理員系統 ---
    socket.on('admin_login', (key) => {
        if (key === ADMIN_KEY) {
            socket.join('admin_group');
            socket.emit('admin_auth_success');
            sendAdminUpdate();
        } else {
            socket.emit('toast', '密鑰錯誤！');
        }
    });

    function syncData(rid) {
        if(!rooms[rid]) return;
        io.to(rid).emit('room_update', { roomId: rid, players: rooms[rid].players, hostId: rooms[rid].host });
        sendAdminUpdate();
    }

    function sendAdminUpdate() {
        const allRooms = Object.keys(rooms).map(id => ({
            id, gameType: rooms[id].gameType, currentWord: rooms[id].currentWord,
            players: rooms[id].players
        }));
        io.to('admin_group').emit('admin_monitor_update', allRooms);
    }
});

server.listen(3000, () => console.log('Server is running on port 3000'));
