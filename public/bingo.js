let myBingoNums = Array(25).fill(null);
let fillIndex = 1;

function initBingoGrid() {
    const grid = document.getElementById('bingo-grid');
    grid.innerHTML = "";
    for(let i=0; i<25; i++) {
        const cell = document.createElement('div');
        cell.className = "h-14 flex items-center justify-center border border-slate-100 font-bold";
        cell.onclick = () => {
            if(fillIndex <= 25) { // 階段一：自選填號
                if(myBingoNums[i]) return;
                myBingoNums[i] = fillIndex;
                cell.innerText = fillIndex;
                cell.classList.add('bg-blue-50', 'text-blue-500');
                fillIndex++;
            } else if(isMyTurn) { // 階段二：遊戲開始
                socket.emit('bingo_call', { num: myBingoNums[i], roomId: curRoom });
            }
        };
        grid.appendChild(cell);
    }
}
