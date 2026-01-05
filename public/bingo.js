let myBoard = Array(25).fill(null);
let nextNum = 1;

function initBingoBoard() {
    const grid = document.getElementById('bingo-grid');
    grid.innerHTML = '';
    myBoard = Array(25).fill(null); nextNum = 1;
    for(let i=0; i<25; i++) {
        const cell = document.createElement('div');
        cell.className = "bingo-cell bg-slate-50 border-2 border-slate-100 flex items-center justify-center font-bold text-lg rounded-xl cursor-pointer";
        cell.id = `cell-${i}`;
        cell.onclick = () => {
            if (myBoard.includes(null)) {
                if(myBoard[i] === null) {
                    myBoard[i] = nextNum; cell.innerText = nextNum++;
                    cell.classList.add('bg-blue-50', 'text-blue-500');
                    document.getElementById('fill-hint').innerText = nextNum > 25 ? "✅ 設定完成" : `填入第 ${nextNum} 號`;
                }
            } else if (window.isMyTurn) {
                socket.emit('bingo_click', { roomId: curRoom, num: myBoard[i] });
            }
        };
        grid.appendChild(cell);
    }
}

function autoFillRandom() {
    const nums = Array.from({length: 25}, (_, i) => i + 1).sort(() => Math.random() - 0.5);
    nums.forEach((n, i) => {
        myBoard[i] = n;
        const c = document.getElementById(`cell-${i}`);
        c.innerText = n; c.classList.add('bg-blue-50', 'text-blue-500');
    });
    nextNum = 26; document.getElementById('fill-hint').innerText = "✅ 設定完成";
}

socket.on('bingo_sync', (num) => {
    const idx = myBoard.indexOf(num);
    if(idx !== -1) document.getElementById(`cell-${idx}`).className = "bingo-cell bg-orange-500 text-white flex items-center justify-center font-bold text-lg rounded-xl scale-90";
});
