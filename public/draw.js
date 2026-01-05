let canvas, ctx, drawing = false;

function initDraw() {
    canvas = document.getElementById('canvas');
    ctx = canvas.getContext('2d');
    ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.strokeStyle = '#334155';
    canvas.onmousedown = (e) => { drawing = true; draw(e); };
    canvas.onmousemove = draw;
    canvas.onmouseup = () => { drawing = false; ctx.beginPath(); socket.emit('drawing', { roomId: curRoom, type: 'stop' }); };
}

function draw(e) {
    if(!drawing || !window.isMyTurn) return;
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    ctx.lineTo(x, y); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x, y);
    socket.emit('drawing', { roomId: curRoom, x, y, type: 'draw' });
}

socket.on('drawing', (d) => {
    if(window.isMyTurn) return;
    if(d.type === 'draw') { ctx.lineTo(d.x, d.y); ctx.stroke(); ctx.beginPath(); ctx.moveTo(d.x, d.y); }
    else ctx.beginPath();
});

socket.on('your_word', (d) => {
    alert(`你是畫家！題目：【${d.word}】`);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
});
