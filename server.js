<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Morandi 派對遊戲盒</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        .bingo-cell { aspect-ratio: 1 / 1; transition: all 0.2s; }
        .active-turn { border: 4px solid #f97316; animation: pulse 2s infinite; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }
    </style>
</head>
<body class="bg-slate-50 min-h-screen font-sans text-slate-900">

    <div id="lobby" class="flex items-center justify-center min-h-screen p-4">
        <div class="bg-white p-8 rounded-3xl shadow-xl w-full max-w-md space-y-6 border border-slate-100">
            <h1 class="text-3xl font-extrabold text-center text-slate-800 tracking-tight">遊戲盒</h1>
            <div class="space-y-4">
                <input type="text" id="username" placeholder="輸入暱稱" class="w-full p-4 border rounded-2xl bg-slate-50 focus:ring-2 focus:ring-blue-400 outline-none transition">
                <input type="text" id="roomId" placeholder="房間號碼" class="w-full p-4 border rounded-2xl bg-slate-50 focus:ring-2 focus:ring-blue-400 outline-none transition">
                
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="text-xs font-bold text-slate-400 ml-2 mb-1 block uppercase">最大人數</label>
                        <input type="number" id="maxPlayers" value="5" class="w-full p-3 border rounded-xl bg-slate-50 outline-none">
                    </div>
                    <div>
                        <label class="text-xs font-bold text-slate-400 ml-2 mb-1 block uppercase">勝利線數</label>
                        <input type="number" id="winLines" value="3" class="w-full p-3 border rounded-xl bg-slate-50 outline-none">
                    </div>
                </div>

                <select id="gameSelect" class="w-full p-4 border rounded-2xl bg-slate-50 outline-none appearance-none">
                    <option value="bingo">賓果連連看</option>
                    <option value="spy">誰是臥底</option>
                </select>
                
                <button onclick="confirmJoin()" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-2xl shadow-lg shadow-blue-200 transition-all active:scale-95">
                    加入房間
                </button>
            </div>
        </div>
    </div>

    <div id="game-area" class="hidden max-w-lg mx-auto p-4 py-8">
        <div id="turn-status" class="text-center text-2xl font-black text-orange-500 mb-6 drop-shadow-sm"></div>
        <div id="spy-timer" class="text-center font-mono text-red-500 mb-4 text-xl font-bold"></div>

        <div id="bingo-container" class="hidden space-y-4">
            <div id="bingo-header" class="flex justify-between items-center bg-blue-50 p-3 rounded-2xl border border-blue-100">
                <span id="fill-hint" class="text-sm font-bold text-blue-600">請設定號碼</span>
                <button onclick="autoFillRandom()" class="text-xs bg-blue-500 text-white px-3 py-1.5 rounded-full font-bold">一鍵隨機</button>
            </div>
            <div id="bingo-grid" class="grid grid-cols-5 gap-2 bg-white p-3 rounded-3xl shadow-inner border-4 border-slate-100"></div>
        </div>

        <div id="spy-container" class="hidden space-y-4">
            <div id="spy-card" class="bg-white p-8 rounded-3xl shadow-lg text-center border-b-8 border-blue-500"></div>
            <div id="vote-area" class="grid grid-cols-2 gap-2 mt-6"></div>
        </div>

        <div id="host-controls" class="hidden mt-8">
            <button onclick="sendStartGame()" class="w-full bg-orange-500 hover:bg-orange-600 text-white font-black py-5 rounded-2xl shadow-xl shadow-orange-100 transition-all active:scale-95 text-lg">
                開始遊戲
            </button>
        </div>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io(); // 優先定義
        let curRoom = "";
        let isHost = false;
        let myPlayers = [];
        window.isMyTurn = false;

        function confirmJoin() {
            const username = document.getElementById('username').value;
            const roomId = document.getElementById('roomId').value;
            const gameType = document.getElementById('gameSelect').value;
            const maxPlayers = document.getElementById('maxPlayers').value;

            if (username && roomId) {
                curRoom = roomId;
                socket.emit('join_room', { roomId, username, gameType, maxPlayers });
                document.getElementById('lobby').classList.add('hidden');
                document.getElementById('game-area').classList.remove('hidden');
                
                if (gameType === 'bingo') {
                    document.getElementById('bingo-container').classList.remove('hidden');
                    initBingoBoard();
                } else {
                    document.getElementById('spy-container').classList.remove('hidden');
                }
            } else {
                alert("請填寫完整資訊");
            }
        }

        function sendStartGame() {
            const lines = document.getElementById('winLines').value;
            socket.emit('start_game', { roomId: curRoom, winLines: lines });
        }

        socket.on('room_update', (room) => {
            isHost = (socket.id === room.host);
            myPlayers = room.players;
            if (isHost && !room.gameStarted) {
                document.getElementById('host-controls').classList.remove('hidden');
            }
        });

        socket.on('game_begin', (data) => {
            document.getElementById('host-controls').classList.add('hidden');
            updateTurnDisplay(data.turnId);
            if (data.gameType === 'spy') startSpyGame();
        });

        socket.on('next_turn', (data) => updateTurnDisplay(data.turnId));

        function updateTurnDisplay(turnId) {
            window.isMyTurn = (socket.id === turnId);
            const statusEl = document.getElementById('turn-status');
            statusEl.innerText = window.isMyTurn ? "🎯 輪到你的回合！" : "⌛ 等待對手...";
            document.getElementById('bingo-grid').className = `grid grid-cols-5 gap-2 bg-white p-3 rounded-3xl shadow-inner border-4 ${window.isMyTurn ? 'border-orange-400' : 'border-slate-100'}`;
        }
    </script>
        // server.js 

// 7. 管理員 API 強化
app.get('/admin-data', (req, res) => {
    const adminKey = "terry"; 
    if (req.query.key === adminKey) {
        const stats = {
            totalRooms: Object.keys(rooms).length,
            rooms: Object.entries(rooms).map(([id, data]) => ({
                id,
                gameType: data.gameType,
                hostId: data.host, // 房長 ID
                hostName: data.players.find(p => p.id === data.host)?.name || "未知", // 誰創建的
                playerCount: data.players.length,
                players: data.players.map(p => ({ id: p.id, name: p.name })), // 房間裡面有誰
                started: data.gameStarted
            }))
        };
        res.json(stats);
    } else {
        res.status(403).send("密鑰錯誤");
    }
});

// Socket 監聽：強制關閉房間
io.on('connection', (socket) => {
    // ... 原有的邏輯 ...

    socket.on('admin_close_room', (data) => {
        if (data.key === "admin123") {
            const roomId = data.targetRoomId;
            if (rooms[roomId]) {
                // 通知房間內所有人房間已被關閉
                io.to(roomId).emit('error_msg', '此房間已被管理員強制關閉');
                io.to(roomId).emit('force_disconnect'); 
                delete rooms[roomId]; // 關閉房間系統
                console.log(`管理員關閉了房間: ${roomId}`);
            }
        }
    });
});
    <script src="bingo.js"></script>
    <script src="spy.js"></script>
</body>
</html>
