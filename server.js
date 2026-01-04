const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // 允許所有來源連線，避免部署後出現跨域問題
    }
});

// 讀取 public 資料夾內的靜態檔案
app.use(express.static(path.join(__dirname, 'public')));

// 儲存所有房間的記憶體物件
const rooms = {};

io.on('connection', (socket) => {
    console.log('新玩家連線:', socket.id);

    socket.on('join_room', (data) => {
        const { roomId, username, maxPlayers, winLines } = data;
        const rId = roomId.trim(); // 除去多餘空格
        
        socket.join(rId);
        socket.username = username;
        socket.currentRoom = rId;

        // 如果房間不存在，則初始化房間資料
        if (!rooms[rId]) {
            rooms[rId] = {
                host: socket.id, // 第一個進來的是房主
                maxPlayers: parseInt(maxPlayers) || 2,
                winLines: parseInt(winLines) || 5,
                players: [],
                isFinished: false
            };
        }

        const room = rooms[rId];

        // 將玩家加入房間名單
        room.players.push({
            id: socket.id,
            name: username
        });

        console.log(`玩家 ${username} 加入了房間: ${rId}`);

        // 向房間內所有人廣播最新的房間狀態與玩家名單
        io.to(rId).emit('room_update', {
            host: room.host,
            players: room.players,
            maxPlayers: room.maxPlayers,
            winLines: room.winLines
        });
    });

    // 處理玩家喊數字
    socket.on('game_move', (data) => {
        const room = rooms[data.roomId];
        if (room && !room.isFinished) {
            // 轉發數字給房間內「其他人」
            socket.to(data.roomId).emit('receive_move', {
                number: data.number,
                senderName: socket.username
            });
        }
    });

    // 處理獲勝邏輯 (一人勝利，全員結束)
    socket.on('player_win', (data) => {
        const room = rooms[data.roomId];
        if (room && !room.isFinished) {
            room.isFinished = true; // 鎖定房間，不再接收動作
            io.to(data.roomId).emit('game_over', {
                winner: socket.username
            });
            console.log(`房間 ${data.roomId} 遊戲結束，獲勝者: ${socket.username}`);
        }
    });

    // 斷線處理
    socket.on('disconnect', () => {
        const rId = socket.currentRoom;
        if (rooms[rId]) {
            // 從名單中移除
            rooms[rId].players = rooms[rId].players.filter(p => p.id !== socket.id);
            
            // 如果房間空了，刪除房間資料
            if (rooms[rId].players.length === 0) {
                delete rooms[rId];
            } else {
                // 如果是房主離開，將房主權限移交給下一個人
                if (rooms[rId].host === socket.id) {
                    rooms[rId].host = rooms[rId].players[0].id;
                }
                // 通知剩餘玩家更新名單
                io.to(rId).emit('room_update', {
                    host: rooms[rId].host,
                    players: rooms[rId].players
                });
            }
        }
        console.log('玩家離線:', socket.id);
    });
});

// Render 會自動分配 PORT，若在本地端則使用 3000
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Bingo 伺服器已啟動於 Port: ${PORT}`);
});
