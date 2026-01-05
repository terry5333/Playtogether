let canvas, ctx, drawing = false;

function initDraw() {
    canvas = document.getElementById('canvas');
    ctx = canvas.getContext('2d');
    ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.strokeStyle = '#334155';

    const getPos = (e) => {
        const r = canvas.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    canvas.onmousedown = (e) => { if(!window.isMyTurn) return; drawing = true; const p = getPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
    canvas.onmousemove = (e) => {
        if(!drawing || !window.isMyTurn) return;
        const p = getPos(e);
        ctx.lineTo(p.x, p.y); ctx.stroke();
        socket.emit('drawing', { roomId: curRoom, x: p.x, y: p.y, type: 'draw' });
    };
    canvas.onmouseup = () => { drawing = false; ctx.beginPath(); socket.emit('drawing', { roomId: curRoom, type: 'stop' }); };
    
    // 觸控支援
    canvas.ontouchstart = (e) => { e.preventDefault(); canvas.onmousedown(e.touches[0]); };
    canvas.ontouchmove = (e) => { e.preventDefault(); canvas.onmousemove(e.touches[0]); };
    canvas.ontouchend = () => canvas.onmouseup();
}

socket.on('drawing', (d) => {
    if(window.isMyTurn) return;
    if(d.type === 'draw') { ctx.lineTo(d.x, d.y); ctx.stroke(); }
    else ctx.beginPath();
});

socket.on('your_word', (d) => {
    alert(`你是畫家！題目是：【${d.word}】`);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
});
