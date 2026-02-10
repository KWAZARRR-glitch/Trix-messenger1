// src/routes/messages.js
const express = require('express');
const router = express.Router();

// Простой маршрут для теста
router.get('/test', (req, res) => {
    res.json({ message: 'Messages router работает!' });
});

// Получение сообщений
router.get('/:chatId', (req, res) => {
    res.json({ 
        chatId: req.params.chatId, 
        messages: [] 
    });
});

module.exports = router; // ✅ ОБЯЗАТЕЛЬНО!