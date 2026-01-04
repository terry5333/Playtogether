const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const rooms = {};

io.on('connection', (socket) => {
    socket.on('join_room', (data) => {
        const { roomId, username, gameType } = data;
        if (!roomId || !username) return;
        
        socket.join(roomId);
        socket.username = username;
        socket.roomId = roomId;

        if (!rooms[roomId]) {
            rooms[roomId] = { 
                gameType, 
                host: socket.id, 
                players: [], 
                gameStarted: false, 
                turnIdx: 0, 
                currentAnswer: "", 
                targetLines: 3 
            };
        }
        rooms[roomId].players.push({ id: socket.id, name: username });
        io.to(roomId).emit('room_update', rooms[roomId]);
    });

    socket.on('start_game', (data) => {
        const room = rooms[data.roomId];
        if (!room || room.host !== socket.id) return;

        room.gameStarted = true;
        room.targetLines = parseInt(data.winLines) || 3;
        room.turnIdx = 0;
        
        sendTurnUpdate(data.roomId);
    });

    function sendTurnUpdate(roomId) {
        const room = rooms[roomId];
        if (!room || room.players.length === 0) return;

        const currentPlayer = room.players[room.turnIdx];
        room.currentAnswer = ""; 
        
        io.to(roomId).emit('game_begin', { 
            turnId: currentPlayer.id, 
            turnName: currentPlayer.name, 
            winLines: room.targetLines,
            gameType: room.gameType
        });
    }

    // 你畫我猜：處理正確答案
    socket.on('send_chat', (data) => {
        const room = rooms[data.roomId];
        if (!room) return;

        if (room.gameType === 'draw' && room.currentAnswer && data.msg.trim() === room.currentAnswer.trim()) {
            io.to(data.roomId).emit('chat_msg', { name: "📢 系統", msg: `恭喜 ${socket.username} 猜對了！答案是【${room.currentAnswer}】` });
            
            // 延遲換人，避免太突然
            setTimeout(() => {
                if (rooms[data.roomId]) {
                    rooms[data.roomId].turnIdx = (rooms[data.roomId].turnIdx + 1) % rooms[data.roomId].players.length;
                    sendTurnUpdate(data.roomId);
                    io.to(data.roomId).emit('clear_canvas');
                }
            }, 2000);
        } else {
            io.to(data.roomId).emit('chat_msg', { name: socket.username, msg: data.msg });
        }
    });

    socket.on('drawing', (data) => {
        if (data.roomId) socket.to(data.roomId).emit('render_drawing', data);
    });

    socket.on('set_word', (data) => {
        if (rooms[data.roomId]) {
            rooms[data.roomId].currentAnswer = data.word;
            io.to(data.roomId).emit('chat_msg', { name: "🎨 系統", msg: "畫家已經出題，大家開動腦筋！" });
        }
    });

    socket.on('bingo_click', (data) => {
        const room = rooms[data.roomId];
        if (room && room.players[room.turnIdx].id === socket.id) {
            io.to(data.roomId).emit('bingo_sync', data.num);
            room.turnIdx = (room.turnIdx + 1) % room.players.length;
            const nextP = room.players[room.turnIdx];
            io.to(data.roomId).emit('next_turn', { turnId: nextP.id, turnName: nextP.name });
        }
    });

    socket.on('bingo_win', (data) => {
        io.to(data.roomId).emit('game_over', { 
            msg: `🎉 ${data.name} 勝利！`, 
            subMsg: `率先達成 ${rooms[data.roomId]?.targetLines || 3} 條連線！` 
        });
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

server.listen(3000, '0.0.0.0');
