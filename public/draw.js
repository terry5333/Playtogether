const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
let isDrawing = false;

function initDraw() {
    ctx.strokeStyle = '#2F4F4F';
    ctx.lineWidth = 3;
    canvas.onmousedown = (e) => {
        if(!isTurn) return;
        isDrawing = true;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        ctx.beginPath();
        ctx.moveTo(x, y);
        socket.emit('drawing', { type: 'start', x, y, roomId: curRoom });
    };
    canvas.onmousemove = (e) => {
        if(!isDrawing || !isTurn) return;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        ctx.lineTo(x, y);
        ctx.stroke();
        socket.emit('drawing', { type: 'draw', x, y, roomId: curRoom });
    };
    window.onmouseup = () => { isDrawing = false; };
}

socket.on('render_drawing', (d) => {
    if(d.type === 'start') { ctx.beginPath(); ctx.moveTo(d.x, d.y); }
    else { ctx.lineTo(d.x, d.y); ctx.stroke(); }
});
