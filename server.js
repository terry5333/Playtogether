const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// 1. 修復 Admin 路徑：確保輸入 /admin 能看到頁面
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

let memoryDB = {}; 
let rooms = {};

// 遊戲題庫
const library = {
    spy: [['西瓜', '哈密瓜'], ['牙刷', '牙膏'], ['老師', '教授'], ['外送', '快遞']],
    guess: ['珍珠奶茶', '台北101', '周杰倫', '臭豆腐', '蜘蛛人', '游泳']
};

io.on('connection', (socket) => {
    // ... 基礎 PIN 檢查與登入邏輯 (保持之前代碼) ...

    // 2. 房主選擇遊戲後，先進入「設定參數階段」
    socket.on('select_mode', (mode) => {
        const r = rooms[socket.roomId];
        if (r && r.hostPin === socket.userPin) {
            r.pendingMode = mode;
            io.to(socket.roomId).emit('open_config_ui', mode);
        }
    });

    // 3. 房主確認設定，正式啟動遊戲
    socket.on('confirm_start', (config) => {
        const r = rooms[socket.roomId];
        if (!r) return;
        
        r.config = config;
        const mode = r.pendingMode;

        if (mode === 'SPY') {
            const pair = library.spy[Math.floor(Math.random() * library.spy.length)];
            const spyIdx = Math.floor(Math.random() * r.players.length);
            r.players.forEach((p, i) => {
                const isSpy = (i === spyIdx);
                io.to(p.socketId).emit('game_start', {
                    type: 'SPY',
                    word: isSpy ? pair[1] : pair[0],
                    role: isSpy ? '臥底' : '平民',
                    timer: config.timer
                });
            });
        } 
        else if (mode === 'BINGO') {
            io.to(socket.roomId).emit('game_start', { type: 'BINGO', targetLines: config.lines });
        }
        else if (mode === 'GUESS') {
            io.to(socket.roomId).emit('game_start', { type: 'GUESS', rounds: config.rounds, drawerIdx: 0 });
        }
    });

    // --- 管理員後台 API ---
    socket.on('admin_login', (pin) => {
        if(pin === "9999") socket.emit('admin_auth_success', Object.values(rooms));
    });
});

server.listen(3000, () => console.log('Server running on http://localhost:3000'));
