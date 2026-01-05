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
    socket.on('create_room', () => {
        const roomId = Math.floor(1000 + Math.random() * 9000).toString();
        rooms[roomId] = { host: socket.id, players: [], gameType: "大廳", currentWord: "", turnIdx: 0, settings: {}, bingoMarked: [] };
        socket.emit('room_created', { roomId });
    });

    socket.on('join_room', (data) => {
        const { roomId, username } = data;
        if (!rooms[roomId]) return socket.emit('toast', '房間不存在');
        socket.join(roomId);
        socket.roomId = roomId;
        socket.username = username;
        if (!rooms[roomId].players.find(p => p.id === socket.id)) {
            rooms[roomId].players.push({ id: socket.id, name: username, score: 0, bingoBoard: [], role: "", word: "" });
        }
        syncData(roomId);
    });

    // 啟動遊戲：修正誰是臥底與設定傳遞
    socket.on('start_game_with_settings', (data) => {
        const room = rooms[data.roomId];
        if (!room) return;
        room.gameType = data.gameType;
        room.settings = data.settings;
        room.turnIdx = 0;
        room.bingoMarked = [];

        if (data.gameType === 'draw') {
            sendDrawTurn(data.roomId);
        } else if (data.gameType === 'spy') {
            const pair = [["西瓜", "香瓜"], ["原子筆", "鉛筆"], ["烤肉", "火鍋"]][Math.floor(Math.random()*3)];
            const spyIdx = Math.floor(Math.random() * room.players.length);
            room.players.forEach((p, idx) => {
                p.role = (idx === spyIdx ? "臥底" : "平民");
                p.word = (idx === spyIdx ? pair[1] : pair[0]);
                io.to(p.id).emit('game_begin', { gameType: 'spy', word: p.word, settings: room.settings });
            });
        } else if (data.gameType === 'bingo') {
            sendBingoTurn(data.roomId);
        }
        sendAdminUpdate();
    });

    // 你話我猜：題目設定與計時加分
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
        const room = rooms[data.roomId];
        if(room) {
            room.currentWord = data.word;
            room.drawStartTime = Date.now();
            io.to(data.roomId).emit('toast', '題目已設定，開始畫畫！', '#3b82f6');
        }
    });

    socket.on('draw_guess', (data) => {
        const room = rooms[data.roomId];
        if (room && room.currentWord && data.guess.trim() === room.currentWord.trim()) {
            const elapsed = (Date.now() - room.drawStartTime) / 1000;
            let pts = elapsed <= 60 ? 3 : (elapsed <= 120 ? 2 : 1);
            const winner = room.players.find(p => p.id === socket.id);
            if (winner) winner.score += pts;
            io.to(data.roomId).emit('toast', `${socket.username} 答對了(+${pts})`, '#16a34a');
            room.turnIdx = (room.turnIdx + 1) % room.players.length;
            setTimeout(() => sendDrawTurn(data.roomId), 2000);
            syncData(data.roomId);
        }
    });

    // 賓果：輪流點擊邏輯
    function sendBingoTurn(roomId) {
        const room = rooms[roomId];
        const player = room.players[room.turnIdx];
        io.to(roomId).emit('game_begin', { 
            gameType: 'bingo', turnName: player.name, turnId: player.id, marked: room.bingoMarked 
        });
    }

    socket.on('bingo_click', (data) => {
        const room = rooms[data.roomId];
        if (room && !room.bingoMarked.includes(data.num)) {
            room.bingoMarked.push(data.num);
            room.turnIdx = (room.turnIdx + 1) % room.players.length;
            sendBingoTurn(data.roomId);
        }
    });

    socket.on('draw_stroke', (d) => socket.to(d.roomId).emit('receive_stroke', d));

    socket.on('admin_login', (key) => {
        if (key === ADMIN_KEY) { socket.join('admin_group'); socket.emit('admin_auth_success'); sendAdminUpdate(); }
    });

    function syncData(rid) {
        if(!rooms[rid]) return;
        io.to(rid).emit('room_update', { roomId: rid, players: rooms[rid].players, hostId: rooms[rid].host });
        sendAdminUpdate();
    }

    function sendAdminUpdate() {
        io.to('admin_group').emit('admin_monitor_update', Object.values(rooms));
    }
});
server.listen(3000);
