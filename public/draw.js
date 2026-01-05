let canvas, ctx, isDrawing = false;

function initDraw() {
    canvas = document.getElementById('canvas');
    if (!canvas) return; // 確保畫布存在才執行
    ctx = canvas.getContext('2d');
    ctx.lineWidth = 3;
    
    canvas.onmousedown = (e) => { isDrawing = true; ctx.beginPath(); };
    canvas.onmousemove = (e) => {
        if (!isDrawing) return;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        ctx.lineTo(x, y);
        ctx.stroke();
        socket.emit('drawing', { x, y, roomId: curRoom });
    };
    window.onmouseup = () => isDrawing = false;
}

socket.on('render_drawing', (data) => {
    if (ctx) {
        ctx.lineTo(data.x, data.y);
        ctx.stroke();
    }
});
