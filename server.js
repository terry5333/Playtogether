// 在 server.js 的 join_room 邏輯中，初始化 turnIndex
if (!rooms[rId]) {
    rooms[rId] = {
        host: socket.id,
        maxPlayers: parseInt(maxPlayers) || 2,
        winLines: parseInt(winLines) || 5,
        players: [],
        turnIndex: 0, // 從第一個進入的人開始
        isFinished: false,
        gameStarted: false
    };
}

// 修改 game_move 邏輯
socket.on('game_move', (data) => {
    const room = rooms[data.roomId];
    if (room && !room.isFinished) {
        const currentPlayer = room.players[room.turnIndex];
        
        // 檢查發送者是否為當前輪到的玩家
        if (socket.id !== currentPlayer.id) {
            return socket.emit('error_msg', '還沒輪到你喔！');
        }

        // 切換到下一個玩家
        room.turnIndex = (room.turnIndex + 1) % room.players.length;

        // 廣播數字與下一個輪到誰
        io.to(data.roomId).emit('receive_move', {
            number: data.number,
            senderName: socket.username,
            nextTurnId: room.players[room.turnIndex].id
        });
    }
});
