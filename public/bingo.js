let myBoard = Array(25).fill(null);
let nextNum = 1;
let marked = Array(25).fill(false);

function initBingoBoard() {
    const grid = document.getElementById('bingo-grid');
    grid.innerHTML = '';
    for(let i=0; i<25; i++) {
        const cell = document.createElement('div');
        cell.className = "bingo-cell bg-slate-50 border-2 border-slate-100 flex items-center justify-center font-bold text-lg rounded-xl cursor-pointer hover:bg-white";
        cell.id = `cell-${i}`;
        cell.onclick = () => {
            if (myBoard.includes(null)) {
                if(myBoard[i] === null) fillCell(i, nextNum++);
            } else if (window.isMyTurn) {
                socket.emit('bingo_click', { roomId: curRoom, num: myBoard[i] });
            }
        };
        grid.appendChild(cell);
    }
}

function fillCell(i, num) {
    myBoard[i] = num;
    const c = document.getElementById(`cell-${i}`);
    c.innerText = num; c.classList.add('bg-blue-50', 'text-blue-500', 'border-blue-200');
    document.getElementById('fill-hint').innerText = nextNum > 25 ? "✅ 準備完成" : `請填入第 ${nextNum} 號`;
}

function autoFillRandom() {
    const ns = Array.from({length: 25}, (_, i) => i + 1).sort(() => Math.random() - 0.5);
    ns.forEach((n, i) => fillCell(i, n));
    nextNum = 26;
}

socket.on('bingo_sync', (num) => {
    const idx = myBoard.indexOf(num);
    if(idx !== -1) {
        marked[idx] = true;
        document.getElementById(`cell-${idx}`).className = "bingo-cell bg-orange-500 text-white flex items-center justify-center font-bold text-lg rounded-xl scale-95 shadow-lg";
        checkWin();
    }
});

function checkWin() {
    let lines = 0;
    // 橫豎判定
    for(let i=0; i<5; i++) {
        if([0,1,2,3,4].every(j => marked[i*5+j])) lines++;
        if([0,1,2,3,4].every(j => marked[j*5+i])) lines++;
    }
    // 斜線判定
    if([0,6,12,18,24].every(i => marked[i])) lines++;
    if([4,8,12,16,20].every(i => marked[i])) lines++;
    
    const target = parseInt(document.getElementById('winLines').value) || 3;
    if(lines >= target) {
        alert(`🎊 賓果！你達成了 ${lines} 條連線，獲得勝利！`);
    }
}
