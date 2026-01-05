const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};

io.on('connection', (socket) => {
    // 房間基礎邏輯
    socket.on('join_room', (data) => {
        const { roomId, username } = data;
        socket.join(roomId);
        socket.roomId = roomId;
        if (!rooms[roomId]) {
            rooms[roomId] = { host: socket.id, players: [], gameStarted: false, timer: null };
        }
        rooms[roomId].players.push({ id: socket.id, name: username });
        io.to(roomId).emit('room_update', rooms[roomId]);
    });

    // 遊戲啟動分流
    socket.on('start_game', (data) => {
        const room = rooms[data.roomId];
        if (!room || room.host !== socket.id) return;
        room.gameStarted = true;
        room.gameType = data.gameType;

        if (data.gameType === 'bingo') {
            io.to(data.roomId).emit('init_bingo', { winLines: data.settings.winLines });
        } 
        else if (data.gameType === 'draw') {
            room.currentRound = 0;
            room.totalRounds = data.settings.totalRounds;
            startNewDrawRound(data.roomId);
        } 
        else if (data.gameType === 'spy') {
            startSpyGame(data.roomId, data.settings.spyTime);
        }
    });

    // --- Bingo 邏輯 ---
    socket.on('bingo_call', (data) => {
        io.to(data.roomId).emit('bingo_sync', data.num);
        nextTurn(data.roomId);
    });

    // --- Draw 邏輯 ---
    socket.on('drawing', (data) => socket.to(data.roomId).emit('drawing', data));

    // --- Spy 邏輯 ---
    socket.on('cast_vote', (data) => {
        const room = rooms[data.roomId];
        if(!room.votes) room.votes = {};
        room.votes[socket.id] = data.targetId;
        if(Object.keys(room.votes).length === room.players.length) {
            io.to(data.roomId).emit('vote_result', room.votes);
            room.votes = {};
        }
    });

    socket.on('disconnect', () => { /* 斷線處理 */ });
});

// 輔助函式：切換回合與遊戲細節
function nextTurn(roomId) { /* 切換 index 並 emit next_turn */ }
function startSpyGame(roomId, time) { /* 分配詞彙並啟動計時器 */ }
const ADMIN_PASSWORD = "bitch12345"; // 建議修改

// 提供管理員獲取所有房間即時數據
app.get('/admin/data', (req, res) => {
    const { key } = req.query;
    if (key !== ADMIN_PASSWORD) return res.status(403).send("密鑰錯誤");

    const roomStats = Object.entries(rooms).map(([id, data]) => ({
        roomId: id,
        gameType: data.gameType || "未選擇",
        playerCount: data.players.length,
        hostName: data.players.find(p => p.id === data.host)?.name || "未知",
        players: data.players.map(p => p.name),
        gameStarted: data.gameStarted,
        createdAt: data.createdAt // 可以在 join_room 時建立時間戳
    }));

    res.json(roomStats);
});

// 管理員強制指令
io.on('connection', (socket) => {
    socket.on('admin_command', (data) => {
        if (data.key !== ADMIN_PASSWORD) return;

        if (data.type === 'DELETE_ROOM') {
            io.to(data.targetId).emit('force_exit', { reason: "管理員已解散此房間" });
            delete rooms[data.targetId];
            io.emit('admin_update'); // 通知管理員頁面重新刷新
        }
        
        if (data.type === 'ANNOUNCEMENT') {
            io.emit('global_msg', { content: data.content }); // 全服公告
        }
    });
});
