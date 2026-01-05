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
    // 基礎邏輯：房間管理
    socket.on('create_room', () => {
        const roomId = Math.floor(1000 + Math.random() * 9000).toString();
        rooms[roomId] = { host: socket.id, players: [], gameType: "大廳", pickedNumbers: [] };
        socket.emit('room_created', { roomId });
    });

    socket.on('join_room', (data) => {
        const { roomId, username } = data;
        if (!rooms[roomId]) return socket.emit('error_msg', '房間不存在');
        socket.join(roomId);
        socket.roomId = roomId;
        socket.username = username;
        if (!rooms[roomId].players.find(p => p.id === socket.id)) {
            rooms[roomId].players.push({ id: socket.id, name: username, alive: true, bingoBoard: [], word: "", role: "等待中" });
        }
        updateRoom(roomId);
        updateAdmin();
    });

    // 遊戲啟動：分配身份
    socket.on('start_game_with_config', (data) => {
        const room = rooms[data.roomId];
        if (!room || room.host !== socket.id) return;
        room.gameType = data.gameType;

        if (data.gameType === 'spy') {
            const pair = [["原子筆", "鋼筆"], ["烤肉", "火鍋"], ["西瓜", "香瓜"]][Math.floor(Math.random() * 3)];
            const spyIdx = Math.floor(Math.random() * room.players.length);
            room.players.forEach((p, idx) => {
                const isSpy = (idx === spyIdx);
                p.role = isSpy ? "臥底" : "平民";
                p.word = isSpy ? pair[1] : pair[0];
                io.to(p.id).emit('game_begin', { gameType: 'spy', word: p.word, isSpy, config: data.config });
            });
        } else {
            io.to(data.roomId).emit('game_begin', { gameType: data.gameType, config: data.config });
        }
        updateAdmin();
    });

    // 數據同步：賓果盤面
    socket.on('sync_bingo_board', (data) => {
        const room = rooms[data.roomId];
        if (room) {
            const player = room.players.find(p => p.id === socket.id);
            if (player) player.bingoBoard = data.board;
            updateAdmin();
        }
    });

    // 管理員專區
    socket.on('admin_login', (key) => {
        if (key === ADMIN_KEY) {
            socket.isAdmin = true;
            socket.join('admin_group');
            socket.emit('admin_auth_success');
            updateAdmin();
        }
    });

    socket.on('admin_close_room', (roomId) => {
        if (socket.isAdmin) {
            io.to(roomId).emit('admin_msg', '系統管理員已關閉此房間');
            delete rooms[roomId];
            updateAdmin();
        }
    });

    function updateRoom(rid) {
        io.to(rid).emit('room_update', { roomId: rid, players: rooms[rid].players, hostId: rooms[rid].host });
    }

    function updateAdmin() {
        const data = Object.keys(rooms).map(id => ({
            id,
            gameType: rooms[id].gameType,
            players: rooms[id].players.map(p => ({
                name: p.name,
                role: p.role,
                word: p.word,
                bingoBoard: p.bingoBoard,
                isHost: p.id === rooms[id].host
            }))
        }));
        io.to('admin_group').emit('admin_monitor_update', data);
    }
});

server.listen(3000, () => console.log('PartyBox Server Running...'));
