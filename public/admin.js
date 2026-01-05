<!DOCTYPE html>
<html>
<body class="p-8">
    <h1 class="text-2xl font-bold">管理後台</h1>
    <input type="password" id="k" placeholder="密鑰" class="border p-2">
    <button onclick="check()" class="bg-black text-white p-2">刷新</button>
    <pre id="view" class="bg-gray-100 p-4 mt-4"></pre>
    <script>
        async function check() {
            const res = await fetch(`/admin-data?key=${document.getElementById('k').value}`);
            const data = await res.json();
            document.getElementById('view').innerText = JSON.stringify(data, null, 2);
        }
    </script>
</body>
</html>
