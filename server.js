const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};
const spyWords = [
    ["蘋果", "水梨"], ["電腦", "筆電"], ["跑步", "競走"], 
    ["泡麵", "拉麵"], ["手錶", "鬧鐘"], ["醫生", "護士"],
    ["吉他", "尤克里里"], ["漢堡", "三明治"], ["森林", "公園"]
];

io.on('connection', (socket) => {
    socket.on('join_room', (data) => {
        const { roomId, username, gameType, maxPlayers, winLines } = data;
        const rId = roomId.trim();
        socket.join(rId);
        socket.username = username;
        socket.currentRoom = rId;

        if (!rooms[rId]) {
            rooms[rId] = {
                gameType: gameType,
                host: socket.id,
                maxPlayers: parseInt(maxPlayers) || 2,
                players: [],
                isFinished: false,
                gameStarted: false,
                votes: {},
                votedCount: 0,
                alivePlayers: [],
                spyId: null, // 紀錄誰是臥底
                timer: null
            };
        }
        const room = rooms[rId];
        room.players.push({ id: socket.id, name: username, isAlive: true, isSpy: false });
        io.to(rId).emit('room_update', room);
    });

    socket.on('start_game', (roomId) => {
        const room = rooms[roomId];
        if (!room || room.host !== socket.id) return;
        
        room.gameStarted = true;
        room.alivePlayers = room.players.map(p => p.id);

        if (room.gameType === 'spy') {
            const pair = spyWords[Math.floor(Math.random() * spyWords.length)];
            const spyIdx = Math.floor(Math.random() * room.players.length);
            
            room.players.forEach((p, idx) => {
                p.isSpy = (idx === spyIdx);
                if(p.isSpy) room.spyId = p.id;
                const word = p.isSpy ? pair[1] : pair[0];
                io.to(p.id).emit('receive_spy_word', { word: word });
            });
            io.to(roomId).emit('spy_game_begin');
            startCountdown(roomId, 120); // 啟動 120 秒倒數
        }
    });

    function startCountdown(roomId, seconds) {
        let timeLeft = seconds;
        const room = rooms[roomId];
        if (room.timer) clearInterval(room.timer);

        room.timer = setInterval(() => {
            timeLeft--;
            io.to(roomId).emit('timer_update', timeLeft);
            if (timeLeft <= 0) {
                clearInterval(room.timer);
                io.to(roomId).emit('force_vote'); // 時間到，強制進入投票
            }
        }, 1000);
    }

    socket.on('cast_vote', (data) => {
        const room = rooms[data.roomId];
        if (!room) return;

        room.votes[data.targetId] = (room.votes[data.targetId] || 0) + 1;
        room.votedCount++;

        if (room.votedCount >= room.alivePlayers.length) {
            let maxVotes = 0;
            let targetId = null;
            for (let id in room.votes) {
                if (room.votes[id] > maxVotes) { maxVotes = room.votes[id]; targetId = id; }
            }

            const kickedPlayer = room.players.find(p => p.id === targetId);
            kickedPlayer.isAlive = false;
            room.alivePlayers = room.alivePlayers.filter(id => id !== targetId);

            const isSpyKicked = (targetId === room.spyId);
            
            io.to(data.roomId).emit('vote_result', {
                kickedName: kickedPlayer.name,
                isSpy: isSpyKicked,
                alivePlayers: room.players
            });

            // 判斷遊戲勝負
            if (isSpyKicked) {
                io.to(data.roomId).emit('game_over', { winner: "平民隊" });
            } else if (room.alivePlayers.length <= 2) {
                io.to(data.roomId).emit('game_over', { winner: "臥底 (成功生存)" });
            } else {
                startCountdown(data.roomId, 120); // 繼續下一輪倒數
            }

            room.votes = {};
            room.votedCount = 0;
        }
    });

    // Bingo 邏輯保留 (略，與之前一致)
    socket.on('game_move', (data) => { /* ... */ });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0');
