function startSpyGame() {
    let timeLeft = 60;
    const timerEl = document.getElementById('spy-timer');
    const interval = setInterval(() => {
        timeLeft--;
        timerEl.innerText = `💬 討論倒計時：${timeLeft}s`;
        if (timeLeft <= 0) {
            clearInterval(interval);
            timerEl.innerText = "🚨 請開始投票！";
            showVotingUI();
        }
    }, 1000);
}

socket.on('spy_setup', (data) => {
    document.getElementById('spy-card').innerHTML = `
        <div class="text-xs font-black text-blue-500 uppercase tracking-widest mb-2">${data.role}</div>
        <div class="text-4xl font-black text-slate-800">${data.word}</div>
    `;
});

function showVotingUI() {
    const area = document.getElementById('vote-area');
    area.innerHTML = '';
    myPlayers.forEach(p => {
        const btn = document.createElement('button');
        btn.className = "bg-white border-2 border-slate-100 p-4 rounded-2xl font-bold hover:bg-red-50 hover:border-red-200 transition";
        btn.innerText = p.name;
        btn.onclick = () => {
            socket.emit('cast_vote', { roomId: curRoom, targetId: p.id });
            area.innerHTML = '<div class="col-span-2 text-center text-slate-400">已投票，等待其他玩家...</div>';
        };
        area.appendChild(btn);
    });
}

socket.on('vote_result', (data) => {
    alert(`📢 投票結果：${data.outPlayer} 被處決了！`);
    location.reload();
});
