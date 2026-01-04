<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>遊戲盒：修復版</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        :root { --blue: #A3B9C9; --green: #2F4F4F; --bg: #F2F0EB; }
        body { background-color: var(--bg); color: var(--green); touch-action: none; overflow: hidden; font-family: sans-serif; }
        .morandi-card { background: white; border-radius: 2rem; box-shadow: 0 8px 24px rgba(0,0,0,0.05); }
        .btn-green { background-color: var(--green); color: white; }
        .btn-blue { background-color: var(--blue); color: white; }
        .bingo-cell { aspect-ratio: 1/1; border: 1px solid #eee; border-radius: 0.5rem; display: flex; align-items: center; justify-content: center; font-weight: bold; background: white; transition: 0.2s; }
        .cell-marked { background-color: var(--green) !important; color: white !important; transform: scale(0.95); }
        .cell-filled { background-color: #f0f4f7; color: var(--blue); }
        #canvas { background: white; border-radius: 1rem; width: 100%; height: 320px; border: 2px solid #eee; touch-action: none; }
        .hidden { display: none !important; }
    </style>
</head>
<body class="min-h-screen flex items-center justify-center p-4">

    <div id="login-panel" class="w-full max-w-sm morandi-card p-8 space-y-6">
        <h1 class="text-2xl font-bold text-center">GAME HUB</h1>
        <div class="space-y-4">
            <input type="text" id="nameInp" placeholder="您的暱稱" class="w-full p-4 bg-gray-50 rounded-2xl outline-none">
            <input type="text" id="roomInp" placeholder="房間號碼" class="w-full p-4 bg-gray-50 rounded-2xl outline-none">
        </div>
        <div class="grid gap-3">
            <button onclick="confirmJoin('bingo')" class="p-4 btn-blue rounded-2xl font-bold">🔢 BINGO</button>
            <button onclick="confirmJoin('draw')" class="p-4 btn-green rounded-2xl font-bold">🎨 你畫我猜</button>
        </div>
    </div>

    <div id="game-panel" class="hidden w-full max-w-md morandi-card p-6 flex flex-col relative" style="height: 92vh;">
        <div class="flex justify-between items-center mb-4">
            <div id="status-tag" class="px-4 py-1 rounded-full btn-green text-xs font-bold">等待開始</div>
            <div id="room-display" class="text-xs opacity-40"></div>
        </div>

        <div id="player-list" class="flex gap-2 overflow-x-auto mb-4 min-h-[35px]"></div>

        <div class="flex-1 overflow-y-auto space-y-4 pr-1">
            <div id="bingo-ui" class="hidden space-y-3">
                <div class="flex justify-between items-center text-[10px] font-bold">
                    <span id="target-msg">請填滿 25 格</span>
                    <button onclick="autoFill()" class="text-blue-500 bg-blue-50 px-2 py-1 rounded">🎲 快速填號</button>
                </div>
                <div id="bingo-grid" class="grid grid-cols-5 gap-2"></div>
                <div id="host-bingo-opts" class="hidden bg-gray-50 p-3 rounded-xl text-xs flex justify-between items-center">
                    <span>目標連線數：</span>
                    <select id="win-lines-select" class="bg-white border rounded">
                        <option value="1">1 條</option><option value="2">2 條</option><option value="3" selected>3 條</option><option value="5">5 條</option>
                    </select>
                </div>
            </div>

            <div id="draw-ui" class="hidden space-y-2">
                <div id="painter-tools" class="hidden bg-blue-50 p-2 rounded-xl flex gap-2">
                    <input id="topicInp" class="flex-1 p-2 rounded text-xs outline-none" placeholder="設定題目...">
                    <button onclick="submitTopic()" class="px-4 btn-green rounded text-xs">出題</button>
                </div>
                <canvas id="canvas" width="500" height="500"></canvas>
                <button id="skip-btn" onclick="nextPainter()" class="hidden w-full py-2 text-[10px] text-gray-400">跳過此人</button>
            </div>

            <div id="chat-box" class="h-28 overflow-y-auto bg-gray-50 rounded-2xl p-4 text-[11px] space-y-1 border"></div>
        </div>

        <div class="mt-4 space-y-3">
            <div class="flex gap-2">
                <input type="text" id="chatInp" class="flex-1 p-4 bg-gray-50 rounded-2xl text-sm outline-none" placeholder="輸入聊天內容或答案...">
                <button onclick="sendMessage()" class="px-6 btn-blue rounded-2xl font-bold">送出</button>
            </div>
            <button id="startBtn" onclick="sendStart()" class="hidden w-full p-4 btn-green rounded-2xl font-bold shadow-lg">開始遊戲</button>
        </div>

        <div id="result-overlay" class="absolute inset-0 z-50 bg-white/95 hidden flex flex-col items-center justify-center p-8 rounded-[2rem] text-center">
            <h2 id="result-title" class="text-2xl font-bold mb-2"></h2>
            <p id="result-desc" class="text-sm opacity-60 mb-8"></p>
            <button onclick="location.reload()" class="w-full p-4 btn-blue rounded-2xl font-bold">回大廳</button>
        </div>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io();
        let myName, curRoom, myGame, isHost = false, isMyTurn = false, isPainter = false, gameStarted = false;
        let bingoLayout = Array(25).fill(null), fillCount = 1, markedCells = Array(25).fill(false), winTarget = 3;
        const canvas = document.getElementById('canvas'), ctx = canvas.getContext('2d');

        // --- 畫圖核心 ---
        let drawing = false, lastX = 0, lastY = 0;
        function getPos(e) {
            const rect = canvas.getBoundingClientRect();
            const cx = e.touches ? e.touches[0].clientX : e.clientX;
            const cy = e.touches ? e.touches[0].clientY : e.clientY;
            return { x: (cx - rect.left) * (canvas.width / rect.width), y: (cy - rect.top) * (canvas.height / rect.height) };
        }
        function startDraw(e) { if (!isPainter || !gameStarted) return; drawing = true; const p = getPos(e); [lastX, lastY] = [p.x, p.y]; }
        function moveDraw(e) {
            if (!drawing || !isPainter) return; e.preventDefault();
            const p = getPos(e); const d = { x: p.x, y: p.y, lastX, lastY, roomId: curRoom };
            socket.emit('drawing', d); renderLine(d); [lastX, lastY] = [p.x, p.y];
        }
        function renderLine(d) { ctx.beginPath(); ctx.strokeStyle = "#2F4F4F"; ctx.lineWidth = 4; ctx.lineCap = "round"; ctx.moveTo(d.lastX, d.lastY); ctx.lineTo(d.x, d.y); ctx.stroke(); }
        canvas.addEventListener('mousedown', startDraw); canvas.addEventListener('mousemove', moveDraw); window.addEventListener('mouseup', () => drawing = false);
        canvas.addEventListener('touchstart', startDraw, {passive:false}); canvas.addEventListener('touchmove', moveDraw, {passive:false});
        socket.on('render_drawing', renderLine);
        socket.on('clear_canvas', () => ctx.clearRect(0, 0, canvas.width, canvas.height));

        // --- 遊戲邏輯 ---
        function confirmJoin(game) {
            myName = document.getElementById('nameInp').value;
            curRoom = document.getElementById('roomInp').value;
            if(!myName || !curRoom) return;
            myGame = game;
            document.getElementById('login-panel').classList.add('hidden');
            document.getElementById('game-panel').classList.remove('hidden');
            document.getElementById('room-display').innerText = `ID: ${curRoom}`;
            socket.emit('join_room', { roomId: curRoom, username: myName, gameType: game });
            if(game === 'bingo') initBingo();
            if(game === 'draw') document.getElementById('draw-ui').classList.remove('hidden');
        }

        function initBingo() {
            const grid = document.getElementById('bingo-grid'); grid.innerHTML = '';
            document.getElementById('bingo-ui').classList.remove('hidden');
            for(let i=0; i<25; i++) {
                const b = document.createElement('div'); b.className = "bingo-cell"; b.id = `cell-${i}`;
                b.onclick = () => {
                    if (!gameStarted && fillCount <= 25 && !bingoLayout[i]) {
                        bingoLayout[i] = fillCount; b.innerText = fillCount; b.classList.add('cell-filled'); fillCount++;
                    } else if (gameStarted && isMyTurn && bingoLayout[i] && !markedCells[i]) {
                        socket.emit('bingo_click', { roomId: curRoom, num: bingoLayout[i] });
                    }
                };
                grid.appendChild(b);
            }
        }

        function autoFill() {
            const nums = Array.from({length: 25}, (_, i) => i + 1).sort(() => Math.random() - 0.5);
            nums.forEach((n, i) => { bingoLayout[i] = n; const c = document.getElementById(`cell-${i}`); c.innerText = n; c.classList.add('cell-filled'); });
            fillCount = 26;
        }

        socket.on('room_update', (d) => {
            isHost = (socket.id === d.host);
            document.getElementById('player-list').innerHTML = d.players.map(p => `<div class="px-3 py-1 bg-white border rounded-full text-[10px] shadow-sm">${p.name}${p.id===d.host?'★':''}</div>`).join('');
            if(isHost && !d.gameStarted) {
                document.getElementById('startBtn').classList.remove('hidden');
                if(myGame === 'bingo') document.getElementById('host-bingo-opts').classList.remove('hidden');
                if(myGame === 'draw') document.getElementById('skip-btn').classList.remove('hidden');
            }
        });

        function sendStart() {
            const lines = document.getElementById('win-lines-select')?.value || 3;
            socket.emit('start_game', { roomId: curRoom, winLines: lines });
        }

        socket.on('game_begin', (d) => {
            gameStarted = true; winTarget = d.winLines;
            document.getElementById('startBtn').classList.add('hidden');
            document.getElementById('host-bingo-opts').classList.add('hidden');
            if(myGame === 'bingo') document.getElementById('target-msg').innerText = `目標連線：${winTarget} 條`;
            if(myGame === 'draw') {
                isPainter = (socket.id === d.turnId);
                document.getElementById('painter-tools').classList.toggle('hidden', !isPainter);
            }
            updateTurn(d.turnId, d.turnName);
        });

        function updateTurn(id, name) {
            isMyTurn = (socket.id === id);
            const tag = document.getElementById('status-tag');
            tag.innerText = isMyTurn ? "🌟 你的回合" : `輪到 ${name}`;
            tag.className = `px-4 py-1 rounded-full text-xs font-bold ${isMyTurn ? 'btn-blue' : 'btn-green'}`;
        }

        socket.on('next_turn', (d) => updateTurn(d.turnId, d.turnName));

        socket.on('bingo_sync', (n) => {
            const idx = bingoLayout.indexOf(n);
            if(idx !== -1) {
                markedCells[idx] = true;
                document.getElementById(`cell-${idx}`).classList.add('cell-marked');
                checkBingoWin();
            }
        });

        // --- 核心修復：精準連線計算法 ---
        function checkBingoWin() {
            let lines = 0;
            const m = markedCells;
            // 橫線
            for(let i=0; i<25; i+=5) if(m[i] && m[i+1] && m[i+2] && m[i+3] && m[i+4]) lines++;
            // 直線
            for(let i=0; i<5; i++) if(m[i] && m[i+5] && m[i+10] && m[i+15] && m[i+20]) lines++;
            // 斜線
            if(m[0] && m[6] && m[12] && m[18] && m[24]) lines++;
            if(m[4] && m[8] && m[12] && m[16] && m[20]) lines++;

            if(lines >= winTarget) socket.emit('bingo_win', { roomId: curRoom, name: myName });
        }

        function submitTopic() {
            const w = document.getElementById('topicInp').value;
            if(!w) return;
            socket.emit('set_word', { roomId: curRoom, word: w });
            document.getElementById('painter-tools').innerHTML = `<div class="p-2 text-xs font-bold text-blue-600">題目：${w} (請開始畫圖)</div>`;
        }

        function nextPainter() { socket.emit('next_painter', { roomId: curRoom }); }

        function sendMessage() {
            const inp = document.getElementById('chatInp');
            if(inp.value) { socket.emit('send_chat', { roomId: curRoom, msg: inp.value }); inp.value = ''; }
        }

        socket.on('chat_msg', (d) => {
            const b = document.getElementById('chat-box');
            b.innerHTML += `<div><b>${d.name}:</b> ${d.msg}</div>`; b.scrollTop = 999;
        });

        socket.on('game_over', (d) => {
            document.getElementById('result-overlay').classList.remove('hidden');
            document.getElementById('result-title').innerText = d.msg;
            document.getElementById('result-desc').innerText = d.subMsg;
        });
    </script>
</body>
</html>
