let bingoLayout = Array(25).fill(null);
let markedCells = Array(25).fill(false);
let fillIndex = 0;

function initBingoBoard() {
    const grid = document.getElementById('bingo-grid');
    grid.innerHTML = '';
    for(let i=0; i<25; i++) {
        const cell = document.createElement('div');
        cell.className = "bingo-cell";
        cell.id = `cell-${i}`;
        cell.onclick = () => {
            if(bingoLayout[i] === null) {
                fillIndex++;
                bingoLayout[i] = fillIndex;
                cell.innerText = fillIndex;
            } else if(isTurn && !markedCells[i]) {
                socket.emit('bingo_click', { roomId: curRoom, num: bingoLayout[i] });
            }
        };
        grid.appendChild(cell);
    }
}

function bingoAutoFill() {
    const nums = Array.from({length: 25}, (_, i) => i + 1).sort(() => Math.random() - 0.5);
    nums.forEach((n, i) => {
        bingoLayout[i] = n;
        document.getElementById(`cell-${i}`).innerText = n;
    });
    fillIndex = 25;
}

socket.on('bingo_sync', (num) => {
    const idx = bingoLayout.indexOf(num);
    if(idx !== -1) {
        markedCells[idx] = true;
        document.getElementById(`cell-${idx}`).classList.add('marked');
        checkBingoWin();
    }
});

function checkBingoWin() {
    let lines = 0;
    const m = markedCells;
    // 橫向
    for(let i=0; i<25; i+=5) if(m[i]&&m[i+1]&&m[i+2]&&m[i+3]&&m[i+4]) lines++;
    // 縱向
    for(let i=0; i<5; i++) if(m[i]&&m[i+5]&&m[i+10]&&m[i+15]&&m[i+20]) lines++;
    // 斜向
    if(m[0]&&m[6]&&m[12]&&m[18]&&m[24]) lines++;
    if(m[4]&&m[8]&&m[12]&&m[16]&&m[20]) lines++;

    if(lines >= winTarget) alert("🎉 你賓果了！獲勝目標達成！");
}
