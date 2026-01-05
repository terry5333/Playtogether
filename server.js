const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

let rooms = {};
const ADMIN_KEY = "admin888";

io.on('connection', (socket) => {
    // 創建房間
    socket.on('create_room', () => {
        const roomId = Math.floor(1000 + Math.random() * 9000).toString();
        rooms[roomId] = {
            host: socket.id,
            players: [],
            gameStarted: false,
            gameType: null,
            playerBoards: {},
            scores: {}
        };
        socket.emit('room_created', { roomId });
    });

    // 加入房間
    socket.on('join_room', (data) => {
        const { roomId, username } = data;
        if (!rooms[roomId]) return socket.emit('error_msg', '房間不存在');
        
        socket.join(roomId);
        socket.roomId = roomId;
        socket.username = username;

        if (!rooms[roomId].host) rooms[roomId].host = socket.id;
        if (!rooms[roomId].players.find(p => p.id === socket.id)) {
            rooms[roomId].players.push({ id: socket.id, name: username });
            rooms[roomId].scores[username] = 0;
        }

        io.to(roomId).emit('room_update', {
            roomId: roomId,
            players: rooms[roomId].players,
            hostId: rooms[roomId].host
        });
    });

    // 啟動遊戲邏輯 (包含詞彙分配)
    socket.on('start_game', (data) => {
        const room = rooms[data.roomId];
        if (!room || room.host !== socket.id) return;

        room.gameStarted = true;
        room.gameType = data.gameType;

        if (data.gameType === 'spy') {
            const pairs = [["蘋果", "水梨"], ["鋼琴", "風琴"], ["漢堡", "三明治"]];
            const selected = pairs[Math.floor(Math.random() * pairs.length)];
            const spyIdx = Math.floor(Math.random() * room.players.length);
            
            room.players.forEach((p, idx) => {
                io.to(p.id).emit('game_begin', {
                    gameType: 'spy',
                    word: (idx === spyIdx) ? selected[1] : selected[0],
                    isSpy: (idx === spyIdx)
                });
            });
        } else {
            io.to(data.roomId).emit('game_begin', { gameType: data.gameType });
        }
    });

    // 賓果同步與管理員紀錄
    socket.on('bingo_init_done', (data) => {
        if(rooms[data.roomId]) rooms[data.roomId].playerBoards[socket.id] = data.board;
    });

    socket.on('bingo_click', (data) => {
        io.to(data.roomId).emit('bingo_sync', data.num);
    });

    // 管理員操作
    socket.on('admin_kick_player', (data) => {
        if (data.key !== ADMIN_KEY) return;
        const room = rooms[data.roomId];
        if (room) {
            io.to(data.targetId).emit('admin_msg', '你已被管理員踢出');
            io.sockets.sockets.get(data.targetId)?.leave(data.roomId);
            room.players = room.players.filter(p => p.id !== data.targetId);
            io.to(data.roomId).emit('room_update', { roomId: data.roomId, players: room.players, hostId: room.host });
        }
    });

    socket.on('disconnect', () => {
        if (socket.roomId && rooms[socket.roomId]) {
            const room = rooms[socket.roomId];
            room.players = room.players.filter(p => p.id !== socket.id);
            if (room.players.length === 0) delete rooms[socket.roomId];
            else {
                if (room.host === socket.id) room.host = room.players[0].id;
                io.to(socket.roomId).emit('room_update', { roomId: socket.roomId, players: room.players, hostId: room.host });
            }
        }
    });
});

app.get('/admin/full_data', (req, res) => {
    if (req.query.key !== ADMIN_KEY) return res.status(403).send("Forbidden");
    res.json(rooms);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server on ${PORT}`));
