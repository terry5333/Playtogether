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
const spyWords = [['蘋果', '梨子'], ['咖啡', '奶茶'], ['火鍋', '燒烤'], ['醫生', '護士']];

io.on('connection', (socket) => {
    // PIN 碼檢查
    socket.on('check_pin', (pin) => {
        db.findOne({ pin }, (err, user) => {
            socket.emit('pin_result', { exists: !!user, user });
        });
    });

    // 儲存資料 (修正卡住問題)
    socket.on('save_profile', (data) => {
        db.update({ pin: data.pin }, { $set: data }, { upsert: true }, () => {
            db.findOne({ pin: data.pin }, (err, user) => {
                socket.emit('auth_success', user);
            });
        });
    });

    // 房主開房
    socket.on('create_room', () => {
        const rid = Math.floor(1000 + Math.random() * 9000).toString();
        rooms[rid] = { id: rid, players: [], status: 'LOBBY', host: socket.id };
        socket.emit('room_created', rid);
    });

    // 加入房間
    socket.on('join_room', (data) => {
        const rid = data.roomId;
        if (rooms[rid]) {
            socket.join(rid);
            socket.roomId = rid;
            if (!rooms[rid].players.find(p => p.pin === data.user.pin)) {
                rooms[rid].players.push({ ...data.user, socketId: socket.id });
            }
            io.to(rid).emit('room_update', rooms[rid]);
        }
    });

    // 房主啟動遊戲參數 (計時器、線數、回合)
    socket.on('start_game_config', (config) => {
        const r = rooms[socket.roomId];
        if (!r) return;
        r.config = config;
        
        if (config.type === '誰是臥底') {
            const pair = spyWords[Math.floor(Math.random() * spyWords.length)];
            const spyIdx = Math.floor(Math.random() * r.players.length);
            r.players.forEach((p, i) => {
                io.to(p.socketId).emit('init_game', { 
                    type: 'spy', 
                    word: i === spyIdx ? pair[1] : pair[0], 
                    timer: config.val 
                });
            });
        } else {
            io.to(socket.roomId).emit('init_game', { type: config.type.toLowerCase(), val: config.val });
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Server is running...'));
