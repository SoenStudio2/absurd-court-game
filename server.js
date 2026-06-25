const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(__dirname + '/public'));

let players = []; 
let gameState = {
    currentCase: "",
    tableClues: [], 
    timer: 1800, 
    round: 1
};

const cases = [
    "Подсудимый обвиняется в том, что съел чужой йогурт в общем холодильнике.",
    "Обвиняется в прослушивании треков Инстасамки без наушников в автобусе.",
    "Обвиняется в том, что заставил домашнего кота платить за коммуналку.",
    "Обвиняется в смывании в унитаз надежд на светлое будущее."
];

const clues = ["Подозрительный банан", "Чек на 15 тенге", "След сковородки", "Записка 'Я не крал'", "Дырявый носок", "Клочок волос", "Пятно на ковре", "Разбитая чашка", "Странный запах чая", "Следы от лап"];
const quirks = ["Смейся как гиена до и после каждой фразы", "Заменяй все гласные 'о' на 'ы'", "Каждые две фразы говори: 'Как завещал великий Ленин...'", "Говори шепотом, будто за тобой следят", "Кашляй перед каждым важным словом"];

function getRandomClues(count) {
    let shuffled = [...clues].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
}

function giveNewCardsToAll() {
    players.forEach(p => {
        p.quirk = quirks[Math.floor(Math.random() * quirks.length)];
        // Судье и Обвиняемому улики не положены по лору
        if (p.role !== "Судья" && p.role !== "Обвиняемый") {
            p.clues = getRandomClues(3); // Ровно 3 новые улики индивидуально
        } else {
            p.clues = [];
        }
        io.to(p.id).emit('init_role', { role: p.role, quirk: p.quirk, clues: p.clues });
    });
}

function startGame() {
    gameState.currentCase = cases[Math.floor(Math.random() * cases.length)];
    gameState.tableClues = [];
    gameState.round = 1;
    gameState.timer = 1800;

    let roles = ["Судья", "Прокурор", "Адвокат", "Обвиняемый"];
    if (players.length >= 5) roles.push("Свидетель");
    if (players.length >= 6) roles.push("Потерпевший");
    
    roles.sort(() => Math.random() - 0.5);

    players.forEach((p, index) => {
        p.role = roles[index] || "Зритель";
    });

    giveNewCardsToAll();
    io.emit('update_state', gameState);
}

io.on('connection', (socket) => {
    if (players.length >= 6) {
        socket.emit('error_msg', 'Комната полная!');
        return;
    }

    let newPlayer = { id: socket.id, name: `Игрок ${players.length + 1}`, role: "", quirk: "", clues: [] };
    players.push(newPlayer);
    io.emit('update_players', players);

    socket.on('start_game', () => {
        if (players.length >= 4) startGame();
    });

    socket.on('play_clue', (clue) => {
        let p = players.find(x => x.id === socket.id);
        if (p) {
            gameState.tableClues.push({ from: p.role, text: clue });
            p.clues = p.clues.filter(c => c !== clue); // Удаляется только у этого игрока
            socket.emit('init_role', { role: p.role, quirk: p.quirk, clues: p.clues });
            io.emit('update_state', gameState);
        }
    });

    socket.on('next_round', () => {
        // Проверка: только Судья может щелкать раунды
        let p = players.find(x => x.id === socket.id);
        if (!p || p.role !== "Судья") return;

        gameState.round++;
        // Каждые 3 раунда (на 4-й, 7-й и т.д.) полностью обновляем усложнения и даем 3 новые улики
        if ((gameState.round - 1) % 3 === 0) {
            giveNewCardsToAll();
        }
        io.emit('update_state', gameState);
    });

    socket.on('verdict', (isGuilty) => {
        let p = players.find(x => x.id === socket.id);
        if (p && p.role === "Судья") {
            io.emit('game_over', isGuilty ? "ВИНОВЕН! В тюрьму абсурда!" : "НЕ ВИНОВЕН! Свободу попугаям!");
        }
    });

    socket.on('disconnect', () => {
        players = players.filter(p => p.id !== socket.id);
        io.emit('update_players', players);
    });
});

setInterval(() => {
    if (gameState.timer > 0) {
        gameState.timer--;
        io.emit('timer_tick', gameState.timer);
    }
}, 1000);

server.listen(3000, () => console.log('Суд идет на http://localhost:3000'));