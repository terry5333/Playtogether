let bingoLayout = Array(25).fill(null);
let markedCells = Array(25).fill(false);

function initBingoBoard() {
    const grid = document.getElementById('bingo-grid');
    if (!grid) return;
    grid.innerHTML = '';
    for(let i=0; i<25; i++) {
        const cell = document.createElement('div');
        cell.className = "bingo-cell border p-2 h-16 flex items-center justify-center cursor-pointer bg-white";
        cell.id = `cell-${i}`;
        cell.onclick = () => {
            let n = prompt("輸入 1-25 數字");
            if(n) { bingoLayout[i] = parseInt(n); cell.innerText = n; }
        };
        grid.appendChild(cell);
    }
}

socket.on('bingo_sync', (num) => {
    const idx = bingoLayout.indexOf(num);
    if(idx !== -1) {
        markedCells[idx] = true;
        document.getElementById(`cell-${idx}`).classList.add('bg-yellow-200');
    }
});
