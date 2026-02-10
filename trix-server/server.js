// server.js - ДЛЯ RENDER.COM
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 10000; // Render использует свой порт

// Middleware
app.use(cors());
app.use(express.json());

// ========== БАЗОВЫЕ API ==========

// Главная страница
app.get('/', (req, res) => {
    res.json({
        message: 'TRIX Messenger API',
        version: '1.0.0',
        status: 'online',
        endpoints: {
            auth: {
                register: 'POST /api/register',
                login: 'POST /api/login'
            },
            messages: {
                get: 'GET /api/messages/:chatId',
                send: 'POST /api/messages/send'
            },
            users: 'GET /api/users'
        }
    });
});

// Регистрация
app.post('/api/register', (req, res) => {
    const { username, email, password } = req.body;
    
    console.log('📝 Регистрация:', username, email);
    
    if (!username || !email || !password) {
        return res.status(400).json({
            success: false,
            error: 'Заполните все поля'
        });
    }
    
    // Простая регистрация (в памяти)
    const userId = Date.now();
    const token = `token_${userId}`;
    
    res.json({
        success: true,
        message: 'Регистрация успешна',
        token,
        user: {
            id: userId,
            username,
            email,
            displayName: username
        }
    });
});

// Вход
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    
    console.log('🔑 Вход:', email);
    
    if (!email || !password) {
        return res.status(400).json({
            success: false,
            error: 'Заполните все поля'
        });
    }
    
    // Простой вход
    const token = `token_${Date.now()}`;
    
    res.json({
        success: true,
        message: 'Вход успешен',
        token,
        user: {
            id: 1,
            username: 'user',
            email: email,
            displayName: 'Пользователь'
        }
    });
});

// Получить список пользователей
app.get('/api/users', (req, res) => {
    res.json({
        success: true,
        users: [
            {
                id: 1,
                username: 'alice',
                displayName: 'Алиса',
                status: 'online'
            },
            {
                id: 2,
                username: 'bob',
                displayName: 'Боб',
                status: 'offline'
            }
        ]
    });
});

// Получить сообщения чата
app.get('/api/messages/:chatId', (req, res) => {
    const { chatId } = req.params;
    
    res.json({
        success: true,
        chatId,
        messages: [
            {
                id: 1,
                senderId: 1,
                content: 'Привет!',
                timestamp: new Date().toISOString()
            },
            {
                id: 2,
                senderId: 2,
                content: 'Привет, как дела?',
                timestamp: new Date().toISOString()
            }
        ]
    });
});

// Отправить сообщение
app.post('/api/messages/send', (req, res) => {
    const { chatId, senderId, content } = req.body;
    
    console.log('💬 Отправка сообщения:', { chatId, senderId, content });
    
    if (!chatId || !senderId || !content) {
        return res.status(400).json({
            success: false,
            error: 'Заполните все поля'
        });
    }
    
    const newMessage = {
        id: Date.now(),
        chatId,
        senderId,
        content,
        timestamp: new Date().toISOString()
    };
    
    res.json({
        success: true,
        message: 'Сообщение отправлено',
        data: newMessage
    });
});

// Статус сервера
app.get('/api/status', (req, res) => {
    res.json({
        success: true,
        status: 'online',
        timestamp: new Date().toISOString(),
        server: 'Render'
    });
});

// Обработка 404
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Маршрут не найден'
    });
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`🚀 TRIX Server запущен на порту ${PORT}`);
    console.log(`🌐 URL: https://trix-server-ps8d.onrender.com`);
});