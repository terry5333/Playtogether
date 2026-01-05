socket.on('spy_force_vote', () => {
    // 1. 隱藏描述區，開啟投票區
    document.getElementById('spy-card').classList.add('opacity-30');
    document.getElementById('vote-panel').classList.remove('hidden');
    
    // 2. 動態生成投票按鈕
    const panel = document.getElementById('vote-panel');
    panel.innerHTML = players.map(p => `
        <button onclick="vote('${p.id}')" class="p-4 bg-white rounded-2xl shadow-sm border font-bold">
            投給 ${p.name}
        </button>
    `).join('');
});
