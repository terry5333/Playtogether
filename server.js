const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let memoryDB = {}; 
let rooms = {};

io.on('connection', (socket) => {
    // 登入與個人資料
    socket.on('save_profile', (data) => {
        memoryDB[data.pin] = { ...data, score: memoryDB[data.pin]?.score || 0 };
        socket.emit('auth_success', memoryDB[data.pin]);
    });

    // 建立房間
    socket.on('create_room', () => {
        const rid = Math.floor(1000 + Math.random() * 9000).toString();
        rooms[rid] = { id: rid, players: [], host: socket.id, messages: [] };
        socket.emit('room_created', rid);
    });

    // 加入房間
    socket.on('join_room', (data) => {
        const rid = data.roomId;
        if (rooms[rid]) {
            socket.join(rid);
            socket.roomId = rid;
            socket.user = data.user;
            
            if (!rooms[rid].players.find(p => p.pin === data.user.pin)) {
                rooms[rid].players.push({ ...data.user, socketId: socket.id });
            }
            
            io.to(rid).emit('room_data', {
                room: rooms[rid],
                isHost: rooms[rid].host === socket.id
            });
        }
    });

    // 聊天功能
    socket.on('send_msg', (msg) => {
        const rid = socket.roomId;
        if (rid && rooms[rid]) {
            const chatObj = { user: socket.user.username, text: msg, avatar: socket.user.avatar };
            rooms[rid].messages.push(chatObj);
            io.to(rid).emit('new_msg', chatObj);
        }
    });

    // 遊戲啟動同步
    socket.on('start_game', (type) => {
        const rid = socket.roomId;
        if (rooms[rid] && rooms[rid].host === socket.id) {
            io.to(rid).emit('goto_game', type);
        }
    });

    socket.on('disconnect', () => {
        // 離線處理可在此擴充
    });
});

server.listen(process.env.PORT || 3000);
