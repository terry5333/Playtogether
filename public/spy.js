let myRole = "", myWord = "";

socket.on('spy_setup', (data) => {
    myRole = data.role;
    myWord = data.word;
    const area = document.getElementById('spy-area');
    if(area) {
        area.innerHTML = `<button onclick="alert('你的詞語是: ' + myWord)" class="p-4 bg-blue-500 text-white rounded">點擊查看詞語</button>`;
    }
});
