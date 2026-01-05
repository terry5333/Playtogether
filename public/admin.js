<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-900 text-white p-8">
    <div class="max-w-4xl mx-auto">
        <div class="flex justify-between mb-8">
            <h1 class="text-2xl font-bold">管理後台</h1>
            <div class="flex gap-2">
                <input type="password" id="adminKey" placeholder="密鑰" class="bg-slate-800 p-2 rounded">
                <button onclick="loadData()" class="bg-blue-600 px-4 py-2 rounded">刷新</button>
            </div>
        </div>
        <div class="bg-slate-800 rounded-xl overflow-hidden">
            <table class="w-full text-left text-sm">
                <thead class="bg-slate-700 uppercase">
                    <tr>
                        <th class="p-4">房間ID</th>
                        <th class="p-4">創建者</th>
                        <th class="p-4">玩家名單</th>
                        <th class="p-4">操作</th>
                    </tr>
                </thead>
                <tbody id="list"></tbody>
            </table>
        </div>
    </div>
    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io();
        async function loadData() {
            const key = document.getElementById('adminKey').value;
            const res = await fetch(`/admin-data?key=${key}`);
            const data = await res.json();
            document.getElementById('list').innerHTML = data.rooms.map(r => `
                <tr class="border-t border-slate-700">
                    <td class="p-4">${r.id}</td>
                    <td class="p-4 text-orange-400 font-bold">${r.hostName}</td>
                    <td class="p-4 text-slate-400">${r.players.join(', ')}</td>
                    <td class="p-4">
                        <button onclick="closeRoom('${r.id}')" class="text-red-400">強制關閉</button>
                    </td>
                </tr>
            `).join('');
        }
        function closeRoom(id) {
            const key = document.getElementById('adminKey').value;
            socket.emit('admin_close_room', { key, targetRoomId: id });
            setTimeout(loadData, 500);
        }
    </script>
</body>
</html>
