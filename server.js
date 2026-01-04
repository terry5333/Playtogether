const express = require('path');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const path = require('path');
// 這行是關鍵，它讓瀏覽器能抓到 bingo.js
app.use(express.static(path.join(__dirname, 'public')));const path = require('path');
app.use(express.static(path.join(__dirname, 'public')));
const rooms = {};
const IDLE_TIME = 5 * 60 * 1000; // 5 分鐘閒置檢查

function resetIdleTimer(roomId) {
    if (!rooms[roomId]) return;
    if (rooms[roomId].idleTimer) clearTimeout(rooms[roomId].idleTimer);
    rooms[roomId].idleTimer = setTimeout(() => {
        io.to(roomId).emit('room_closed', { msg: "房間因閒置超過 5 分鐘已自動關閉" });
        delete rooms[roomId];
    }, IDLE_TIME);
}

io.on('connection', (socket) => {
    console.log('玩家連線:', socket.id);

    socket.on('join_room', (data) => {
        const { roomId, username, gameType } = data;
        socket.join(roomId);
        socket.roomId = roomId;

        if (!rooms[roomId]) {
            rooms[roomId] = { 
                gameType, 
                host: socket.id, 
                players: [], 
                gameStarted: false, 
                winLines: 3 
            };
        }
        rooms[roomId].players.push({ id: socket.id, name: username });
        resetIdleTimer(roomId);
        io.to(roomId).emit('room_update', rooms[roomId]);
    });

    socket.on('start_game', (data) => {
        const room = rooms[data.roomId];
        if (!room || room.host !== socket.id) return;
        room.gameStarted = true;
        room.winLines = parseInt(data.winLines) || 3;
        
        io.to(data.roomId).emit('game_begin', { 
            turnId: room.players[0].id, 
            turnName: room.players[0].name,
            winLines: room.winLines 
        });
    });

    socket.on('bingo_click', (data) => {
        const room = rooms[data.roomId];
        if (room) {
            resetIdleTimer(data.roomId);
            io.to(data.roomId).emit('bingo_sync', data.num);
            
            // 切換回合邏輯
            const players = room.players;
            const currentIdx = players.findIndex(p => p.id === socket.id);
            const nextIdx = (currentIdx + 1) % players.length;
            io.to(data.roomId).emit('next_turn', { 
                turnId: players[nextIdx].id, 
                turnName: players[nextIdx].name 
            });
        }
    });

    // 關鍵修正：解決 RangeError 無限遞迴
    socket.on('drawing', (data) => {
        if (data.roomId) {
            // 使用 socket.to(roomId).emit 只發送給「其他人」
            // 避免發送者自己收到後又觸發繪圖事件，造成伺服器崩潰
            socket.to(data.roomId).emit('render_drawing', data);
        }
    });

    socket.on('disconnect', () => {
        if (socket.roomId && rooms[socket.roomId]) {
            rooms[socket.roomId].players = rooms[socket.roomId].players.filter(p => p.id !== socket.id);
            if (rooms[socket.roomId].players.length === 0) {
                delete rooms[socket.roomId];
            } else {
                io.to(socket.roomId).emit('room_update', rooms[socket.roomId]);
            }
        }
    });
});

// 2. Render 部署必須監聽 0.0.0.0 並使用 PORT 環境變數
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
});
