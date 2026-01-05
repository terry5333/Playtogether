let canvas, ctx;
let drawing = false;

function initDraw() {
    canvas = document.getElementById('canvas');
    if (!canvas) return; // 防止抓不到元素報錯
    ctx = canvas.getContext('2d');
    
    // 設定畫筆樣式
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#334155';

    // 滑鼠與觸控事件
    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseout', stopDrawing);

    canvas.addEventListener('touchstart', (e) => { e.preventDefault(); startDrawing(e.touches[0]); });
    canvas.addEventListener('touchmove', (e) => { e.preventDefault(); draw(e.touches[0]); });
    canvas.addEventListener('touchend', stopDrawing);
}

function startDrawing(e) {
    if (!window.isMyTurn) return; // 只有當前回合玩家可以畫畫
    drawing = true;
    draw(e);
}

function draw(e) {
    if (!drawing || !window.isMyTurn) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);

    // 同步給其他玩家
    socket.emit('drawing', {
        roomId: curRoom,
        x: x,
        y: y,
        type: 'draw'
    });
}

function stopDrawing() {
    drawing = false;
    ctx.beginPath();
    socket.emit('drawing', { roomId: curRoom, type: 'stop' });
}

// 接收對手的畫作
socket.on('drawing', (data) => {
    if (window.isMyTurn) return; // 自己在畫時不接收

    if (data.type === 'draw') {
        ctx.lineTo(data.x, data.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(data.x, data.y);
    } else if (data.type === 'stop') {
        ctx.beginPath();
    } else if (data.type === 'clear') {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
});

function clearCanvas() {
    if (!window.isMyTurn) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    socket.emit('drawing', { roomId: curRoom, type: 'clear' });
}
