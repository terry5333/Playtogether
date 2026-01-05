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
    // 創建房間
    socket.on('create_room', () => {
        const roomId = Math.floor(1000 + Math.random() * 9000).toString();
        rooms[roomId] = { host: socket.id, players: [], gameType: "大廳", pickedNumbers: [] };
        socket.emit('room_created', { roomId });
    });

    // 進入房間核心邏輯
    socket.on('join_room', (data) => {
        const { roomId, username } = data;
        if (!rooms[roomId]) return socket.emit('toast', '房間不存在');
        
        socket.join(roomId);
        socket.roomId = roomId;
        socket.username = username;

        // 避免重複加入
        const existingPlayer = rooms[roomId].players.find(p => p.id === socket.id);
        if (!existingPlayer) {
            rooms[roomId].players.push({ 
                id: socket.id, name: username, alive: true, 
                bingoBoard: [], word: "", role: "等待中" 
            });
        }
        
        io.to(roomId).emit('room_update', { 
            roomId, 
            players: rooms[roomId].players, 
            hostId: rooms[roomId].host 
        });
        updateAdmin();
    });

    // 啟動遊戲
    socket.on('start_game_with_config', (data) => {
        const room = rooms[data.roomId];
        if (!room || room.host !== socket.id) return;
        room.gameType = data.gameType;
        io.to(data.roomId).emit('game_begin', { gameType: data.gameType, config: data.config });
    });

    // 管理員與數據同步邏輯 (省略重複部分以保持簡潔，同前一版)
    function updateAdmin() {
        const data = Object.keys(rooms).map(id => ({
            id, gameType: rooms[id].gameType,
            players: rooms[id].players.map(p => ({ name: p.name, role: p.role, bingoBoard: p.bingoBoard }))
        }));
        io.to('admin_group').emit('admin_monitor_update', data);
    }
});

server.listen(3000);
