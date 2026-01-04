const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

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
                winLines: 3 
            };
        }
        rooms[roomId].players.push({ id: socket.id, name: username });
        io.to(roomId).emit('room_update', rooms[roomId]);
    });

    socket.on('start_game', (data) => {
        const room = rooms[data.roomId];
        if (!room || room.host !== socket.id) return;

        room.gameStarted = true;
        room.winLines = parseInt(data.winLines) || 3;
        room.turnIdx = 0;
        
        sendTurnUpdate(data.roomId);
    });

    function sendTurnUpdate(roomId) {
        const room = rooms[roomId];
        if (!room) return;

        const currentPlayer = room.players[room.turnIdx];
        room.currentAnswer = ""; // 換人時清空上一題答案
        
        io.to(roomId).emit('game_begin', { 
            turnId: currentPlayer.id, 
            turnName: currentPlayer.name, 
            winLines: room.winLines,
            gameType: room.gameType
        });
    }

    socket.on('drawing', (data) => {
        if (data.roomId) socket.to(data.roomId).emit('render_drawing', data);
    });

    socket.on('set_word', (data) => {
        const room = rooms[data.roomId];
        if (room) {
            room.currentAnswer = data.word.trim();
            io.to(data.roomId).emit('chat_msg', { name: "🎨 系統", msg: "畫家已出題，請開始搶答！" });
        }
    });

    socket.on('send_chat', (data) => {
        const room = rooms[data.roomId];
        if (!room) return;

        // 你畫我猜：判定答案
        if (room.gameType === 'draw' && room.currentAnswer && data.msg.trim() === room.currentAnswer) {
            io.to(data.roomId).emit('chat_msg', { name: "🎉 系統", msg: `恭喜 ${socket.username} 猜對了！答案是【${room.currentAnswer}】` });
            
            // 猜對後 3 秒自動換下一位畫家
            setTimeout(() => {
                if (rooms[data.roomId]) {
                    rooms[data.roomId].turnIdx = (rooms[data.roomId].turnIdx + 1) % rooms[data.roomId].players.length;
                    sendTurnUpdate(data.roomId);
                    io.to(data.roomId).emit('clear_canvas');
                }
            }, 3000);
        } else {
            io.to(data.roomId).emit('chat_msg', { name: socket.username, msg: data.msg });
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
        const room = rooms[data.roomId];
        if(room) {
            io.to(data.roomId).emit('game_over', { 
                msg: `🏆 ${data.name} 獲勝！`, 
                subMsg: `率先連成 ${room.winLines} 條線！` 
            });
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`伺服器運行於埠號 ${PORT}`));
