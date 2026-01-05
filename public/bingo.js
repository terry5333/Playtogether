let myBoard = Array(25).fill(null);
let nextNum = 1; // 追蹤快速選號的下一個數字

function initBingoBoard() {
    const grid = document.getElementById('bingo-grid');
    grid.innerHTML = '';
    myBoard = Array(25).fill(null);
    nextNum = 1;

    // 新增工具列：快速選號提示與隨機按鈕
    const controls = document.createElement('div');
    controls.className = "col-span-5 mb-4 flex justify-between items-center bg-blue-50 p-2 rounded-lg";
    controls.innerHTML = `
        <span id="quick-hint" class="text-sm font-bold text-blue-600">順序填號中: 第 ${nextNum} 號</span>
        <button onclick="autoFillRandom()" class="text-xs bg-blue-500 text-white px-2 py-1 rounded">一鍵隨機</button>
    `;
    grid.parentNode.insertBefore(controls, grid);

    for(let i=0; i<25; i++) {
        const cell = document.createElement('div');
        cell.className = "w-16 h-16 border-2 border-blue-100 flex items-center justify-center bg-white cursor-pointer text-lg font-bold transition-all hover:border-blue-400";
        cell.id = `cell-${i}`;
        
        cell.onclick = () => {
            // 模式 A：設定階段 (號碼還沒填滿)
            if (myBoard.includes(null)) {
                if (myBoard[i] === null) {
                    fillCell(i, nextNum);
                    nextNum++;
                    updateHint();
                }
            } 
            // 模式 B：遊戲階段 (號碼已填滿，開始輪流點擊)
            else {
                if (!window.isMyTurn) return alert("不是你的回合！");
                socket.emit('bingo_click', { roomId: curRoom, num: myBoard[i] });
            }
        };
        grid.appendChild(cell);
    }
}

// 填入數字並變色
function fillCell(index, num) {
    myBoard[index] = num;
    const cell = document.getElementById(`cell-${index}`);
    cell.innerText = num;
    cell.classList.add('bg-blue-50', 'text-blue-600');
}

// 模式 C：一鍵隨機自動填滿
function autoFillRandom() {
    const indices = Array.from({length: 25}, (_, i) => i);
    const nums = Array.from({length: 25}, (_, i) => i + 1).sort(() => Math.random() - 0.5);
    
    indices.forEach((idx, i) => {
        fillCell(idx, nums[i]);
    });
    nextNum = 26;
    updateHint();
}

function updateHint() {
    const hint = document.getElementById('quick-hint');
    if (nextNum > 25) {
        hint.innerText = "✅ 填寫完成！等待開局";
        hint.classList.replace('text-blue-600', 'text-green-600');
    } else {
        hint.innerText = `順序填號中: 第 ${nextNum} 號`;
    }
}

socket.on('bingo_sync', (num) => {
    const idx = myBoard.indexOf(num);
    if (idx !== -1) {
        const cell = document.getElementById(`cell-${idx}`);
        cell.classList.remove('bg-blue-50');
        cell.classList.add('bg-yellow-400', 'text-white', 'scale-90');
    }
});
