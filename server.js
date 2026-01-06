const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const Datastore = require('nedb');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const db = new Datastore({ filename: 'users.db', autoload: true });

app.use(express.static('public'));

io.on('connection', (socket) => {
    console.log('新玩家連線:', socket.id);

    // PIN 檢查
    socket.on('check_pin', (pin) => {
        console.log('正在檢查 PIN:', pin);
        db.findOne({ pin: pin }, (err, user) => {
            socket.emit('pin_result', { exists: !!user, user: user });
        });
    });

    // 儲存玩家資料 - 這裡最容易卡住，我們加上強制回傳
    socket.on('save_profile', (data) => {
        console.log('接收到儲存請求:', data);
        if (!data.pin) return console.log('錯誤: 缺少 PIN 碼');

        db.update({ pin: data.pin }, { $set: data }, { upsert: true }, (err) => {
            if (err) {
                console.log('資料庫寫入錯誤:', err);
                return;
            }
            db.findOne({ pin: data.pin }, (err, user) => {
                console.log('儲存成功，回傳 auth_success');
                socket.emit('auth_success', user);
            });
        });
    });

    // 房主設定與開始遊戲
    socket.on('start_game_config', (config) => {
        console.log('收到遊戲設定:', config);
        // ...其餘邏輯...
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
