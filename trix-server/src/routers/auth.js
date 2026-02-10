// src/routes/auth.js
const express = require('express');
const router = express.Router();

// Простой маршрут для теста
router.get('/test', (req, res) => {
    res.json({ message: 'Auth router работает!' });
});

// Регистрация
router.post('/register', (req, res) => {
    const { username, email, password } = req.body;
    
    if (!username || !email || !password) {
        return res.status(400).json({ error: 'Все поля обязательны' });
    }
    
    res.json({ 
        success: true, 
        message: 'Регистрация успешна',
        user: { username, email }
    });
});

module.exports = router; // ✅ ОБЯЗАТЕЛЬНО!