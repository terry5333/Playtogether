const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};
const ADMIN_KEY = "bitch12345";

io.on('connection', (socket) => {
    socket.on('join_room', (data) => {
        const { roomId, username } = data;
        socket.join(roomId);
        socket.roomId = roomId;

        if (!rooms[roomId]) {
            rooms[roomId] = { 
                host: socket.id, players: [], gameStarted: false, 
                gameType: "", settings: {}, votes: {}, timer: null 
            };
        }
        rooms[roomId].players.push({ id: socket.id, name: username });
        io.to(roomId).emit('room_update', rooms[roomId]);
    });

    socket.on('start_game', (data) => {
        const room = rooms[data.roomId];
        if (!room || room.host !== socket.id) return;
        
        room.gameType = data.gameType;
        room.settings = data.settings;
        room.gameStarted = true;
        room.currentTurnIdx = 0;

        if (room.gameType === 'spy') {
            const pairs = [["香蕉", "芭樂"], ["鋼琴", "小提琴"], ["電腦", "平板"]];
            const pair = pairs[Math.floor(Math.random() * pairs.length)];
            const spyIdx = Math.floor(Math.random() * room.players.length);
            
            room.players.forEach((p, i) => {
                io.to(p.id).emit('spy_setup', { 
                    word: i === spyIdx ? pair[1] : pair[0],
                    timer: room.settings.spyTime 
                });
            });
            
            // 倒數計時邏輯
            let timeLeft = parseInt(room.settings.spyTime);
            if(room.timer) clearInterval(room.timer);
            room.timer = setInterval(() => {
                timeLeft--;
                if(timeLeft <= 0) {
                    clearInterval(room.timer);
                    io.to(data.roomId).emit('spy_force_vote');
                } else {
                    io.to(data.roomId).emit('timer_update', timeLeft);
                }
            }, 1000);
        }
        
        io.to(data.roomId).emit('game_begin', { 
            gameType: room.gameType, 
            settings: room.settings,
            turnId: room.players[0].id 
        });
    });

    socket.on('bingo_click', (data) => {
        const room = rooms[data.roomId];
        io.to(data.roomId).emit('bingo_sync', data.num);
        room.currentTurnIdx = (room.currentTurnIdx + 1) % room.players.length;
        io.to(data.roomId).emit('next_turn', { turnId: room.players[room.currentTurnIdx].id });
    });

    socket.on('cast_vote', (data) => {
        const room = rooms[data.roomId];
        room.votes[socket.id] = data.targetId;
        if(Object.keys(room.votes).length === room.players.length) {
            io.to(data.roomId).emit('vote_result', room.votes);
            room.votes = {};
        }
    });

    socket.on('admin_close', (data) => {
        if(data.key === ADMIN_KEY && rooms[data.targetId]) {
            io.to(data.targetId).emit('force_exit');
            delete rooms[data.targetId];
        }
    });

    socket.on('disconnect', () => {
        if (socket.roomId && rooms[socket.roomId]) {
            rooms[socket.roomId].players = rooms[socket.roomId].players.filter(p => p.id !== socket.id);
            if (rooms[socket.roomId].players.length === 0) {
                if(rooms[socket.roomId].timer) clearInterval(rooms[socket.roomId].timer);
                delete rooms[socket.roomId];
            } else {
                io.to(socket.roomId).emit('room_update', rooms[socket.roomId]);
            }
        }
    });
});

app.get('/admin-api', (req, res) => {
    if(req.query.key === ADMIN_KEY) res.json(rooms);
    else res.status(403).send("No");
});

server.listen(3000);
