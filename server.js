<div id="game-panel" class="hidden w-full max-w-md morandi-card p-6 flex flex-col relative" style="height: 94vh;">
    <div class="flex justify-between items-center mb-2">
        <div id="status-tag" class="px-3 py-1 rounded-full btn-green text-[10px] font-bold">準備中</div>
        <div id="timer-display" class="hidden text-red-500 font-mono font-bold text-xl">60s</div>
    </div>

    <div id="player-list" class="flex gap-2 mb-4 overflow-x-auto min-h-[30px]"></div>

    <div class="flex-1 overflow-y-auto space-y-4">
        <div id="bingo-ui" class="hidden space-y-3">
            <div id="bingo-grid" class="grid grid-cols-5 gap-2"></div>
            <button onclick="autoFill()" class="w-full text-xs text-blue-500 py-2">🎲 隨機填號 (1-25)</button>
        </div>

        <div id="draw-ui" class="hidden space-y-2">
            <div id="painter-input-box" class="hidden bg-blue-50 p-3 rounded-2xl flex gap-2">
                <input id="topicInp" class="flex-1 p-2 rounded-xl text-xs outline-none" placeholder="輸入題目...">
                <button onclick="submitTopic()" class="px-4 btn-green rounded-xl text-xs">出題</button>
            </div>
            <canvas id="canvas" width="600" height="600"></canvas>
        </div>

        <div id="spy-ui" class="hidden space-y-4">
            <div id="spy-card" onclick="toggleSpy()" class="w-full h-40 bg-gray-50 rounded-3xl flex items-center justify-center border-2 border-dashed border-gray-200 cursor-pointer">
                <span id="spy-word-text" class="text-xl font-bold text-gray-400">點擊查看詞語</span>
            </div>
            <div id="vote-section" class="hidden space-y-2">
                <div id="vote-grid" class="grid grid-cols-2 gap-2"></div>
            </div>
        </div>

        <div id="chat-box" class="h-28 overflow-y-auto bg-gray-50 rounded-2xl p-4 text-[10px] border"></div>
    </div>

    <div class="mt-4 space-y-2">
        <input type="text" id="chatInp" class="w-full p-4 bg-gray-50 rounded-2xl outline-none" placeholder="輸入聊天內容...">
        <button id="startBtn" onclick="sendStart()" class="hidden w-full p-4 btn-green rounded-2xl font-bold">開始遊戲</button>
    </div>
</div>

<script>
    const socket = io();
    let myGame = "";

    // 關鍵：隱藏所有 UI 的函式
    function hideAll() {
        document.getElementById('bingo-ui').classList.add('hidden');
        document.getElementById('draw-ui').classList.add('hidden');
        document.getElementById('spy-ui').classList.add('hidden');
    }

    function confirmJoin(game) {
        const name = document.getElementById('nameInp').value;
        const room = document.getElementById('roomInp').value;
        if(!name || !room) return alert("請輸入暱稱與房號");

        myGame = game; // 紀錄當前模式
        document.getElementById('login-panel').classList.add('hidden');
        document.getElementById('game-panel').classList.remove('hidden');

        hideAll(); // 先全部藏起來
        document.getElementById(game + '-ui').classList.remove('hidden'); // 只開對應的

        if(game === 'bingo') initBingo(); // 如果是 Bingo 就初始化格子

        socket.emit('join_room', { roomId: room, username: name, gameType: game });
    }

    socket.on('room_update', (roomData) => {
        // 更新玩家列表
        const list = document.getElementById('player-list');
        list.innerHTML = roomData.players.map(p => `<div class="px-3 py-1 bg-white border rounded-full text-[10px]">${p.name}</div>`).join('');
        
        // 房主才看得到開始按鈕
        if(socket.id === roomData.host && !roomData.gameStarted) {
            document.getElementById('startBtn').classList.remove('hidden');
        }

        // 重要：確保後來加入的人也能看到正確的模式 UI
        if(!myGame) {
            myGame = roomData.gameType;
            hideAll();
            document.getElementById(myGame + '-ui').classList.remove('hidden');
        }
    });

    // ... 其他模式對應的 function ...
</script>
