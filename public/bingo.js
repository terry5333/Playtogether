let myBoard = Array(25).fill(null);
let nextNum = 1;

function initBingoBoard() {
    const grid = document.getElementById('bingo-grid');
    grid.innerHTML = '';
    myBoard = Array(25).fill(null);
    nextNum = 1;
    for(let i=0; i<25; i++) {
        const cell = document.createElement('div');
        cell.className = "w-14 h-14 border-2 flex items-center justify-center bg-white cursor-pointer font-bold rounded-lg text-lg transition-all";
        cell.id = `cell-${i}`;
        cell.onclick = () => {
            if (myBoard.includes(null)) {
                if (myBoard[i] === null) fillCell(i, nextNum++);
                updateHint();
            } else if (window.isMyTurn) {
                socket.emit('bingo_click', { roomId: curRoom, num: myBoard[i] });
            }
        };
        grid.appendChild(cell);
    }
}

function fillCell(idx, num) {
    myBoard[idx] = num;
    document.getElementById(`cell-${idx}`).innerText = num;
    document.getElementById(`cell-${idx}`).classList.add('bg-blue-50', 'text-blue-600', 'border-blue-200');
}

function autoFillRandom() {
    const nums = Array.from({length: 25}, (_, i) => i + 1).sort(() => Math.random() - 0.5);
    nums.forEach((n, i) => fillCell(i, n));
    nextNum = 26;
    updateHint();
}

function updateHint() {
    const h = document.getElementById('fill-hint');
    h.innerText = nextNum > 25 ? "✅ 已填滿" : `請填入第 ${nextNum} 號`;
}

socket.on('bingo_sync', (num) => {
    const idx = myBoard.indexOf(num);
    if (idx !== -1) document.getElementById(`cell-${idx}`).classList.replace('bg-blue-50', 'bg-orange-500');
});
