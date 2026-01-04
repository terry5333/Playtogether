let myRole = ""; // 角色：平民 或 臥底
let mySecretWord = ""; // 獲得的詞語

function initSpyUI() {
    const spyArea = document.createElement('div');
    spyArea.id = "spy-area";
    spyArea.className = "hidden flex-1 flex flex-col items-center justify-center space-y-6";
    spyArea.innerHTML = `
        <div id="spy-card" onclick="toggleSecret()" class="w-64 h-40 bg-gray-50 border-4 border-dashed border-gray-300 rounded-3xl flex items-center justify-center cursor-pointer select-none">
            <span id="spy-word-text" class="text-xl font-bold text-gray-400">點擊查看詞語</span>
        </div>
        <div id="vote-panel" class="hidden w-full space-y-3">
            <h3 class="text-center font-bold text-red-500">請投出你認為的臥底</h3>
            <div id="vote-grid" class="grid grid-cols-2 gap-2"></div>
        </div>
    `;
    document.getElementById('bingo-area').after(spyArea);
}

// 監聽伺服器分配身分
socket.on('spy_setup', (data) => {
    myRole = data.role;
    mySecretWord = data.word;
    document.getElementById('spy-word-text').innerText = "點擊查看詞語";
    document.getElementById('spy-word-text').style.color = "#9ca3af";
});

function toggleSecret() {
    const el = document.getElementById('spy-word-text');
    if (el.innerText === "點擊查看詞語") {
        el.innerText = mySecretWord;
        el.style.color = "#2F4F4F";
    } else {
        el.innerText = "點擊查看詞語";
        el.style.color = "#9ca3af";
    }
}

// 監聽投票開始
socket.on('start_voting', () => {
    const panel = document.getElementById('vote-panel');
    const grid = document.getElementById('vote-grid');
    panel.classList.remove('hidden');
    
    // 這裡由伺服器傳來的玩家清單生成投票按鈕
    // 假設玩家資料存在全域變數 currentPlayers 中
    grid.innerHTML = currentPlayers.map(p => `
        <button onclick="castVote('${p.id}')" class="p-3 bg-white border rounded-xl text-xs hover:bg-gray-100">
            ${p.name}
        </button>
    `).join('');
});

function castVote(targetId) {
    socket.emit('cast_vote', { roomId: curRoom, targetId: targetId });
    document.getElementById('vote-panel').classList.add('hidden');
    alert("投票成功！");
}

// 初始化 UI
initSpyUI();
