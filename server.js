const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let memoryDB = {}; 
let rooms = {};

const spyWords = [['蘋果', '梨子'], ['醫生', '護士'], ['火鍋', '燒烤'], ['咖啡', '奶茶']];
const cardIcons = ['🐶', '🐱', '🦊', '🐷', '🐵', '🐨', '🐸', '🦁'];

io.on('connection', (socket) => {
    socket.on('check_pin', (pin) => {
        const user = memoryDB[pin];
        socket.emit('pin_result', { exists: !!user, user: user });
    });

    socket.on('save_profile', (data) => {
        memoryDB[data.pin] = { ...data, score: data.score || 0 };
        socket.emit('auth_success', memoryDB[data.pin]);
    });

    socket.on('create_room', () => {
        const rid = Math.floor(1000 + Math.random() * 9000).toString();
        rooms[rid] = { id: rid, players: [], status: 'LOBBY' };
        socket.emit('room_created', rid);
    });

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

    socket.on('start_game', (config) => {
        const r = rooms[socket.roomId];
        if (!r) return;

        if (config.type === 'SPY') {
            const pair = spyWords[Math.floor(Math.random() * spyWords.length)];
            const spyIdx = Math.floor(Math.random() * r.players.length);
            r.players.forEach((p, i) => {
                io.to(p.socketId).emit('game_init', { type: 'SPY', word: i === spyIdx ? pair[1] : pair[0], role: i === spyIdx ? '臥底' : '平民', time: config.val });
            });
        } 
        else if (config.type === 'MEMORY') {
            let cards = [...cardIcons, ...cardIcons].sort(() => Math.random() - 0.5);
            io.to(socket.roomId).emit('game_init', { type: 'MEMORY', cards });
        }
        else if (config.type === 'BINGO') {
            io.to(socket.roomId).emit('game_init', { type: 'BINGO', target: config.val });
        }
        else if (config.type === 'GUESS') {
            io.to(socket.roomId).emit('game_init', { type: 'GUESS', drawer: r.players[0].username });
        }
    });

    socket.on('flip_card', (idx) => io.to(socket.roomId).emit('on_flip', idx));
    socket.on('draw', (data) => socket.to(socket.roomId).emit('on_draw', data));
});

server.listen(process.env.PORT || 3000);
