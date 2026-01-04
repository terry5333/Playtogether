// --- server.js 核心邏輯 ---
let rooms = {};

io.on('connection', (socket) => {
    socket.on('join_room', (data) => {
        const { roomId, username, gameType } = data;
        socket.join(roomId);
        if (!rooms[roomId]) {
            rooms[roomId] = { 
                gameType, 
                host: socket.id, 
                players: [], 
                turnIdx: 0, 
                currentAnswer: "" 
            };
        }
        rooms[roomId].players.push({ id: socket.id, name: username });
        io.to(roomId).emit('room_update', rooms[roomId]);
    });

    socket.on('start_game', (data) => {
        const room = rooms[data.roomId];
        if (room) {
            room.gameStarted = true;
            room.turnIdx = 0;
            sendNewTurn(data.roomId);
        }
    });

    // 統一換人函數
    function sendNewTurn(roomId) {
        const room = rooms[roomId];
        if (!room || room.players.length === 0) return;
        
        const currentPlayer = room.players[room.turnIdx];
        room.currentAnswer = ""; // 換人時重設答案
        
        io.to(roomId).emit('game_begin', {
            turnId: currentPlayer.id,
            turnName: currentPlayer.name,
            gameType: room.gameType
        });
        io.to(roomId).emit('clear_canvas'); // 強制所有人清空畫板
    }

    // 監聽畫家手動跳過或猜對後的切換
    socket.on('next_turn_request', (data) => {
        const room = rooms[data.roomId];
        if (room) {
            room.turnIdx = (room.turnIdx + 1) % room.players.length;
            sendNewTurn(data.roomId);
        }
    });
});
