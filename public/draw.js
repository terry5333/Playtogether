let ctx, isDrawing = false;

function setupCanvas() {
    const cvs = document.getElementById('canvas');
    ctx = cvs.getContext('2d');
    cvs.addEventListener('mousedown', startDraw);
    cvs.addEventListener('mousemove', drawing);
    cvs.addEventListener('mouseup', endDraw);
}

function drawing(e) {
    if(!isDrawing || !isMyTurn) return;
    const {x, y} = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    socket.emit('drawing', { x, y, type: 'line', roomId: curRoom });
}
