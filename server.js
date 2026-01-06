const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const Datastore = require('nedb');
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const db = new Datastore({ filename: 'users.db', autoload: true });

app.use(express.static('public'));

let rooms = {};
let gameHistory = [];

const spyWords = [['蘋果', '梨子'], ['醫生', '護士'], ['自拍', '他拍'], ['咖啡', '奶茶'], ['火鍋', '燒烤']];

io.on('connection', (socket) => {
    // --- PIN 碼與帳號系統 ---
    socket.on('check_pin', (pin) => {
        db.findOne({ pin }, (err, user) => socket.emit('pin_result', { exists: !!user, user }));
    });

    socket.on('save_profile', (data) => {
        db.update({ pin: data.pin }, { $set: data, $min: { score: 0 } }, { upsert: true }, () => {
            db.findOne({ pin: data.pin }, (err, user) => {
                socket.emit('auth_success', user);
                updateAdmin();
            });
        });
    });

    // --- 創房與房間管理 ---
    socket.on('create_room', () => {
        const rid = Math.floor(1000 + Math.random() * 9000).toString();
        rooms[rid] = { id: rid, players: [], status: 'LOBBY', host: socket.id, gameType: null, config: {} };
        socket.emit('room_created', rid);
    });

    socket.on('join_room', (data) => {
        const rid = data.roomId;
        if (rooms[rid]) {
            socket.join(rid);
            socket.roomId = rid;
            if (!rooms[rid].players.find(p => p.pin === data.user.pin)) {
                rooms[rid].players.push({ ...data.user, socketId: socket.id, ready: false });
            }
            io.to(rid).emit('room_update', rooms[rid]);
        }
    });

    // --- 遊戲參數設定 (需求 4, 5, 6) ---
    socket.on('start_game_config', (config) => {
        const r = rooms[socket.roomId];
        if (!r) return;
        r.config = config;
        r.status = 'PLAYING';
        
        if (config.type === '誰是臥底') {
            const pair = spyWords[Math.floor(Math.random() * spyWords.length)];
            const spyIdx = Math.floor(Math.random() * r.players.length);
            r.players.forEach((p, i) => {
                io.to(p.socketId).emit('init_game', { type: 'spy', word: i === spyIdx ? pair[1] : pair[0], timer: config.timer });
            });
        } 
        else if (config.type === 'Bingo') {
            io.to(socket.roomId).emit('init_game', { type: 'bingo', winLines: config.winLines });
        }
    });

    // --- 加分系統 ---
    socket.on('add_win_score', (pin) => {
        db.update({ pin: pin }, { $inc: { score: 10 } }, {}, () => updateAdmin());
    });
});

function updateAdmin() {
    db.find({}).sort({ score: -1 }).exec((err, users) => {
        io.emit('admin_update', { users, rooms });
    });
}
server.listen(3000);
// 確保後端邏輯是這樣的：
socket.on('save_profile', (data) => {
    console.log("正在儲存玩家:", data.pin);
    
    // 使用 $set 避免覆蓋掉舊有的 score
    const updateData = { 
        username: data.username, 
        avatar: data.avatar, 
        pin: data.pin 
    };

    // upsert: true 代表沒有就新增，有就更新
    db.update({ pin: data.pin }, { $set: updateData }, { upsert: true }, (err) => {
        if (err) {
            console.error("資料庫寫入失敗:", err);
            return socket.emit('save_error', '儲存失敗，請再試一次');
        }
        
        // 寫入成功後，重新讀取一次資料確保正確性
        db.findOne({ pin: data.pin }, (err, user) => {
            console.log("儲存成功，發送驗證回傳");
            socket.emit('auth_success', user);
            // 如果你有廣播給 Admin 的邏輯，放在這裡
        });
    });
});
