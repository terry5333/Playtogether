const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));

let rooms = {};

// 統一的 Admin 數據推送函數
function broadcastAdminData() {
    const data = Object.keys(rooms).map(rid => ({
        id: rid,
        game: rooms[rid].gameType || 'Lobby',
        players: rooms[rid].players.map(p => ({ id: p.id, name: p.name })),
        host: rooms[rid].players.find(p => p.id === rooms[rid].host)?.name || '未知'
    }));
    io.emit('admin_data_update', data); // 向所有連接的 Admin 廣播
}

io.on('connection', (socket) => {
    // 當有人連線，如果是 Admin，立刻給他一次數據
    socket.on('admin_init', () => {
        broadcastAdminData();
    });

    socket.on('create_room', () => {
        const rid = Math.floor(1000 + Math.random() * 9000).toString();
        rooms[rid] = { host: socket.id, players: [], gameType: 'Lobby', turnIdx: 0, scores: {} };
        socket.emit('room_created', { roomId: rid });
        broadcastAdminData();
    });

    socket.on('join_room', (d) => {
        const r = rooms[d.roomId];
        if (!r) return socket.emit('toast', '❌ 房間不存在');
        
        // 確保姓名被正確寫入
        socket.join(d.roomId);
        socket.roomId = d.roomId;
        socket.userName = d.username; // 存入 socket 物件方便追蹤
        
        r.players.push({ id: socket.id, name: d.username });
        
        // 同步給房間內所有人
        io.to(d.roomId).emit('room_update', { 
            roomId: d.roomId, 
            players: r.players, 
            hostId: r.host 
        });
        
        broadcastAdminData(); // 更新 Admin 數據
    });

    // 處理斷線，移除玩家
    socket.on('disconnect', () => {
        if (socket.roomId && rooms[socket.roomId]) {
            rooms[socket.roomId].players = rooms[socket.roomId].players.filter(p => p.id !== socket.id);
            if (rooms[socket.roomId].players.length === 0) {
                delete rooms[socket.roomId];
            } else {
                io.to(socket.roomId).emit('room_update', { 
                    roomId: socket.roomId, 
                    players: rooms[socket.roomId].players, 
                    hostId: rooms[socket.roomId].host 
                });
            }
            broadcastAdminData();
        }
    });

    // 其他遊戲邏輯 (如 host_setup_game 等) 保持不變...
});

server.listen(process.env.PORT || 3000, '0.0.0.0');
