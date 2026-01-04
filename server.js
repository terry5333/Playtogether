const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 1. 設置靜態檔案路徑：確保能讀取 public 資料夾下的 html 和 js
app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};
const IDLE_TIME = 5 * 60 * 1000; // 5分鐘閒置檢查

// 2. 房間閒置檢查邏輯
function resetIdleTimer(roomId) {
    if (!rooms[roomId]) return;
    if (rooms[roomId].idleTimer) clearTimeout(rooms[roomId].idleTimer);
    rooms[roomId].idleTimer = setTimeout(() => {
        io.to(roomId).emit('room_closed', { msg: "房間因閒置超過 5 分鐘已自動關閉" });
        delete rooms[roomId];
    }, IDLE_TIME);
}

io.on('connection', (socket) => {
    console.log('新玩家連線:', socket.id);

    // 加入房間
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
        
        // 廣播房間資訊
        io.to(roomId).emit('room_update', rooms[roomId]);
    });

    // 開始遊戲
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

    // Bingo 點擊同步
    socket.on('bingo_click', (data) => {
        const room = rooms[data.roomId];
        if (room) {
            resetIdleTimer(data.roomId);
            io.to(data.roomId).emit('bingo_sync', data.num);
            
            // 切換回合
            const players = room.players;
            const currentIdx = players.findIndex(p => p.id === socket.id);
            const nextIdx = (currentIdx + 1) % players.length;
            const nextPlayer = players[nextIdx];
            
            io.to(data.roomId).emit('next_turn', { 
                turnId: nextPlayer.id, 
                turnName: nextPlayer.name 
            });
        }
    });

    // 核心修正：你畫我猜繪圖同步 (避免無限迴圈)
    socket.on('drawing', (data) => {
        if (data.roomId) {
            // 使用 socket.to(roomId).emit 確保訊息不回傳給發送者
            // 這能解決 RangeError: Maximum call stack size exceeded
            socket.to(data.roomId).emit('render_drawing', data);
        }
    });

    // 斷線處理
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

// 3. Render 部署必須監聽 0.0.0.0 並使用 PORT 環境變數
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`伺服器正運行於埠號 ${PORT}`);
});
