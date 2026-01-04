const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
let isDrawing = false;

function initDraw() {
    // 設置畫筆樣式
    ctx.strokeStyle = '#2F4F4F';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // 滑鼠事件
    canvas.onmousedown = (e) => startDrawing(e);
    canvas.onmousemove = (e) => draw(e);
    window.onmouseup = () => stopDrawing();

    // 手機觸控事件
    canvas.ontouchstart = (e) => { e.preventDefault(); startDrawing(e.touches[0]); };
    canvas.ontouchmove = (e) => { e.preventDefault(); draw(e.touches[0]); };
    canvas.ontouchend = () => stopDrawing();
}

function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    // 計算比例，確保不同螢幕尺寸座標一致
    return {
        x: (e.clientX - rect.left) * (canvas.width / rect.width),
        y: (e.clientY - rect.top) * (canvas.height / rect.height)
    };
}

function startDrawing(e) {
    if (!isTurn || myGame !== 'draw') return;
    isDrawing = true;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    socket.emit('drawing', { type: 'start', ...pos, roomId: curRoom });
}

function draw(e) {
    if (!isDrawing || !isTurn) return;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    socket.emit('drawing', { type: 'draw', ...pos, roomId: curRoom });
}

function stopDrawing() {
    isDrawing = false;
    socket.emit('drawing', { type: 'stop', roomId: curRoom });
}

// 接收對手的繪圖數據
socket.on('render_drawing', (d) => {
    if (d.type === 'start') {
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
    } else if (d.type === 'draw') {
        ctx.lineTo(d.x, d.y);
        ctx.stroke();
    } else {
        ctx.closePath();
    }
});
