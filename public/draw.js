let canvas, ctx, drawing = false;

function initDraw() {
    canvas = document.getElementById('canvas');
    ctx = canvas.getContext('2d');
    ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.strokeStyle = '#334155';

    canvas.onmousedown = (e) => startDraw(e);
    canvas.onmousemove = (e) => draw(e);
    canvas.onmouseup = stopDraw;
    
    canvas.ontouchstart = (e) => startDraw(e.touches[0]);
    canvas.ontouchmove = (e) => draw(e.touches[0]);
    canvas.ontouchend = stopDraw;
}

function startDraw(e) { if(!window.isMyTurn) return; drawing = true; draw(e); }
function draw(e) {
    if(!drawing || !window.isMyTurn) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    ctx.lineTo(x, y); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x, y);
    socket.emit('drawing', { roomId: curRoom, x, y, type: 'draw' });
}
function stopDraw() { drawing = false; ctx.beginPath(); socket.emit('drawing', { roomId: curRoom, type: 'stop' }); }

socket.on('drawing', (data) => {
    if(window.isMyTurn) return;
    if(data.type === 'draw') { ctx.lineTo(data.x, data.y); ctx.stroke(); ctx.beginPath(); ctx.moveTo(data.x, data.y); }
    else if(data.type === 'stop') ctx.beginPath();
});

socket.on('your_word', (data) => {
    alert(`你是畫家！題目是：【${data.word}】`);
    if(ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
});
