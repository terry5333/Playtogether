function startSpyGame() {
    let timeLeft = 60;
    const timer = document.getElementById('spy-timer');
    const interval = setInterval(() => {
        timeLeft--;
        timer.innerText = `討論倒計時：${timeLeft}s`;
        if (timeLeft <= 0) {
            clearInterval(interval);
            timer.innerText = "討論結束，請投票！";
            showVoting();
        }
    }, 1000);
}

socket.on('spy_setup', (data) => {
    document.getElementById('spy-area').innerHTML = `
        <div class="p-6 bg-white rounded-lg shadow">
            <p class="text-gray-500">你的身分：${data.role}</p>
            <h2 class="text-3xl font-bold mt-2">${data.word}</h2>
        </div>
    `;
});

function showVoting() {
    let html = `<h3 class="font-bold mb-2">誰是臥底？投票：</h3>`;
    myPlayers.forEach(p => {
        html += `<button onclick="vote('${p.id}')" class="m-1 bg-red-500 text-white px-3 py-1 rounded">${p.name}</button>`;
    });
    document.getElementById('spy-area').innerHTML = html;
}

function vote(id) {
    socket.emit('cast_vote', { roomId: curRoom, targetId: id });
    document.getElementById('spy-area').innerHTML = "已投票，請等待結果...";
}

socket.on('vote_result', (data) => {
    alert(`結果：${data.outPlayer} 被處決了！`);
    location.reload(); // 結束後重置
});
