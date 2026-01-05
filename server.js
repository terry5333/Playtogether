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
    // 基礎房務
    socket.on('create_room', () => {
        const roomId = Math.floor(1000 + Math.random() * 9000).toString();
        rooms[roomId] = { host: socket.id, players: [], gameType: "大廳", currentWord: "", turnIdx: 0, settings: {} };
        socket.emit('room_created', { roomId });
    });

    socket.on('join_room', (data) => {
        const { roomId, username } = data;
        if (!rooms[roomId]) return socket.emit('toast', '房間不存在');
        socket.join(roomId);
        socket.roomId = roomId;
        socket.username = username;
        rooms[roomId].players.push({ id: socket.id, name: username, score: 0, bingoBoard: [], startTime: 0 });
        syncData(roomId);
    });

    // 房主啟動遊戲並發送設定
    socket.on('start_game_with_settings', (data) => {
        const room = rooms[data.roomId];
        if (!room || room.host !== socket.id) return;
        room.gameType = data.gameType;
        room.settings = data.settings;
        room.turnIdx = 0;

        if (data.gameType === 'draw') {
            sendDrawTurn(data.roomId);
        } else {
            io.to(data.roomId).emit('game_begin', { gameType: data.gameType, settings: data.settings });
        }
        sendAdminUpdate();
    });

    // 你話我猜：階梯加分邏輯
    function sendDrawTurn(roomId) {
        const room = rooms[roomId];
        const drawer = room.players[room.turnIdx];
        room.currentWord = "";
        room.drawStartTime = Date.now(); // 記錄開始時間
        io.to(roomId).emit('game_begin', { 
            gameType: 'draw', drawerId: drawer.id, drawerName: drawer.name,
            scores: room.players.map(p => ({name: p.name, score: p.score})) 
        });
    }

    socket.on('draw_submit_word', (data) => {
        const room = rooms[data.roomId];
        room.currentWord = data.word;
        room.drawStartTime = Date.now(); // 畫家送出題目後重新計時
        io.to(data.roomId).emit('toast', '題目已設定，開始計時！', '#3b82f6');
    });

    socket.on('draw_guess', (data) => {
        const room = rooms[data.roomId];
        if (data.guess.trim() === room.currentWord.trim() && room.currentWord !== "") {
            const elapsed = (Date.now() - room.drawStartTime) / 1000;
            let points = 1;
            if (elapsed <= 60) points = 3;
            else if (elapsed <= 120) points = 2;

            const winner = room.players.find(p => p.id === socket.id);
            if (winner) winner.score += points;
            
            io.to(data.roomId).emit('toast', `${socket.username} 答對了！(+${points}分)`, '#16a34a');
            
            // 換下一位
            room.turnIdx = (room.turnIdx + 1) % room.players.length;
            setTimeout(() => sendDrawTurn(data.roomId), 2000);
            syncData(data.roomId);
        }
    });

    // 賓果同步 (管理員查看用)
    socket.on('sync_bingo', (data) => {
        const room = rooms[data.roomId];
        const p = room.players.find(p => p.id === socket.id);
        if (p) p.bingoBoard = data.board;
        sendAdminUpdate();
    });

    // 管理員權限
    socket.on('admin_kick', (data) => {
        const room = rooms[data.roomId];
        if (room) {
            io.to(data.playerId).emit('toast', '你已被管理員踢出');
            io.sockets.sockets.get(data.playerId)?.leave(data.roomId);
            room.players = room.players.filter(p => p.id !== data.playerId);
            syncData(data.roomId);
        }
    });

    socket.on('admin_close_room', (rid) => {
        io.to(rid).emit('toast', '房間已被管理員關閉');
        delete rooms[rid];
        sendAdminUpdate();
    });

    function syncData(rid) {
        if(!rooms[rid]) return;
        io.to(rid).emit('room_update', { roomId: rid, players: rooms[rid].players, hostId: rooms[rid].host });
    }

    function sendAdminUpdate() {
        io.to('admin_group').emit('admin_monitor_update', Object.values(rooms));
    }

    socket.on('admin_login', (key) => {
        if (key === ADMIN_KEY) { socket.join('admin_group'); socket.emit('admin_auth_success'); sendAdminUpdate(); }
    });
});
server.listen(3000);
