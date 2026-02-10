// server.js - ПОЛНАЯ ВЕРСИЯ ДЛЯ TRIX MESSENGER
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Файлы для хранения данных
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const USERS_FILE = path.join(DATA_DIR, 'users.json');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');
const CHATS_FILE = path.join(DATA_DIR, 'chats.json');

// Функции работы с файлами
const readData = (filePath, defaultValue = {}) => {
    try {
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error(`Ошибка чтения ${filePath}:`, error.message);
    }
    return defaultValue;
};

const writeData = (filePath, data) => {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error(`Ошибка записи ${filePath}:`, error.message);
        return false;
    }
};

// Инициализация данных
let users = readData(USERS_FILE, {});
let messages = readData(MESSAGES_FILE, { chats: {} });
let chats = readData(CHATS_FILE, {});

// ==================== API МАРШРУТЫ ====================

// 1. ГЛАВНАЯ СТРАНИЦА
app.get('/', (req, res) => {
    res.json({
        name: 'TRIX Messenger API',
        version: '2.0.0',
        status: 'online',
        server: 'Render',
        endpoints: {
            auth: {
                register: 'POST /api/auth/register',
                login: 'POST /api/auth/login',
                me: 'GET /api/auth/me'
            },
            users: {
                list: 'GET /api/users',
                search: 'GET /api/users/search?q=...',
                profile: 'GET /api/users/:id'
            },
            chats: {
                list: 'GET /api/chats',
                create: 'POST /api/chats',
                messages: 'GET /api/chats/:id/messages'
            },
            messages: {
                send: 'POST /api/messages',
                delete: 'DELETE /api/messages/:id'
            }
        },
        stats: {
            users: Object.keys(users).length,
            chats: Object.keys(chats).length,
            totalMessages: Object.values(messages.chats || {}).reduce((sum, msgs) => sum + msgs.length, 0)
        }
    });
});

// 2. СТАТУС СЕРВЕРА
app.get('/api/status', (req, res) => {
    res.json({
        success: true,
        status: 'online',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        server: 'Render'
    });
});

// 3. АУТЕНТИФИКАЦИЯ
// Регистрация
app.post('/api/auth/register', (req, res) => {
    try {
        const { username, email, password, displayName } = req.body;
        
        console.log('📝 Регистрация:', username);
        
        // Валидация
        if (!username || !email || !password) {
            return res.status(400).json({
                success: false,
                error: 'Заполните все обязательные поля'
            });
        }
        
        if (username.length < 3) {
            return res.status(400).json({
                success: false,
                error: 'Имя пользователя должно быть не менее 3 символов'
            });
        }
        
        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                error: 'Пароль должен быть не менее 6 символов'
            });
        }
        
        // Проверка существующего пользователя
        const existingUser = Object.values(users).find(
            user => user.email === email || user.username === username
        );
        
        if (existingUser) {
            return res.status(400).json({
                success: false,
                error: 'Пользователь с таким email или именем уже существует'
            });
        }
        
        // Создание пользователя
        const userId = `user_${Date.now()}`;
        const newUser = {
            id: userId,
            username,
            email,
            password, // ⚠️ В продакшене нужно хешировать!
            displayName: displayName || username,
            avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=random`,
            status: 'offline',
            lastSeen: new Date().toISOString(),
            contacts: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        users[userId] = newUser;
        writeData(USERS_FILE, users);
        
        // Генерация простого токена
        const token = Buffer.from(`${userId}:${Date.now()}`).toString('base64');
        
        res.status(201).json({
            success: true,
            message: 'Регистрация успешна',
            token,
            user: {
                id: newUser.id,
                username: newUser.username,
                email: newUser.email,
                displayName: newUser.displayName,
                avatar: newUser.avatar,
                status: newUser.status
            }
        });
        
    } catch (error) {
        console.error('Ошибка регистрации:', error);
        res.status(500).json({
            success: false,
            error: 'Внутренняя ошибка сервера'
        });
    }
});

// Вход
app.post('/api/auth/login', (req, res) => {
    try {
        const { email, password } = req.body;
        
        console.log('🔑 Вход:', email);
        
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: 'Заполните все поля'
            });
        }
        
        // Поиск пользователя
        const user = Object.values(users).find(u => u.email === email);
        
        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Пользователь не найден'
            });
        }
        
        // Проверка пароля
        if (user.password !== password) {
            return res.status(401).json({
                success: false,
                error: 'Неверный пароль'
            });
        }
        
        // Обновление статуса
        user.status = 'online';
        user.lastSeen = new Date().toISOString();
        user.updatedAt = new Date().toISOString();
        writeData(USERS_FILE, users);
        
        // Генерация токена
        const token = Buffer.from(`${user.id}:${Date.now()}`).toString('base64');
        
        res.json({
            success: true,
            message: 'Вход успешен',
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                displayName: user.displayName,
                avatar: user.avatar,
                status: user.status,
                lastSeen: user.lastSeen
            }
        });
        
    } catch (error) {
        console.error('Ошибка входа:', error);
        res.status(500).json({
            success: false,
            error: 'Внутренняя ошибка сервера'
        });
    }
});

// Информация о текущем пользователе
app.get('/api/auth/me', (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'Токен не предоставлен'
            });
        }
        
        // Декодирование токена
        const decoded = Buffer.from(token, 'base64').toString('ascii');
        const [userId] = decoded.split(':');
        
        const user = users[userId];
        
        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Пользователь не найден'
            });
        }
        
        res.json({
            success: true,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                displayName: user.displayName,
                avatar: user.avatar,
                status: user.status,
                lastSeen: user.lastSeen,
                contacts: user.contacts,
                createdAt: user.createdAt
            }
        });
        
    } catch (error) {
        console.error('Ошибка проверки токена:', error);
        res.status(401).json({
            success: false,
            error: 'Недействительный токен'
        });
    }
});

// 4. ПОЛЬЗОВАТЕЛИ
// Список пользователей
app.get('/api/users', (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'Требуется авторизация'
            });
        }
        
        // Декодирование токена
        const decoded = Buffer.from(token, 'base64').toString('ascii');
        const [currentUserId] = decoded.split(':');
        
        const currentUser = users[currentUserId];
        
        if (!currentUser) {
            return res.status(401).json({
                success: false,
                error: 'Пользователь не найден'
            });
        }
        
        // Формирование списка пользователей (исключая текущего)
        const usersList = Object.values(users)
            .filter(user => user.id !== currentUserId)
            .map(user => ({
                id: user.id,
                username: user.username,
                displayName: user.displayName,
                avatar: user.avatar,
                status: user.status,
                lastSeen: user.lastSeen,
                isContact: currentUser.contacts.includes(user.id)
            }));
        
        res.json({
            success: true,
            users: usersList
        });
        
    } catch (error) {
        console.error('Ошибка получения пользователей:', error);
        res.status(500).json({
            success: false,
            error: 'Внутренняя ошибка сервера'
        });
    }
});

// Поиск пользователей
app.get('/api/users/search', (req, res) => {
    try {
        const { q } = req.query;
        
        if (!q || q.length < 2) {
            return res.json({
                success: true,
                users: []
            });
        }
        
        const searchTerm = q.toLowerCase();
        
        const results = Object.values(users)
            .filter(user => 
                user.username.toLowerCase().includes(searchTerm) ||
                user.displayName.toLowerCase().includes(searchTerm) ||
                user.email.toLowerCase().includes(searchTerm)
            )
            .map(user => ({
                id: user.id,
                username: user.username,
                displayName: user.displayName,
                avatar: user.avatar,
                status: user.status
            }));
        
        res.json({
            success: true,
            query: q,
            results
        });
        
    } catch (error) {
        console.error('Ошибка поиска:', error);
        res.status(500).json({
            success: false,
            error: 'Внутренняя ошибка сервера'
        });
    }
});

// Профиль пользователя
app.get('/api/users/:id', (req, res) => {
    try {
        const { id } = req.params;
        const user = users[id];
        
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'Пользователь не найден'
            });
        }
        
        res.json({
            success: true,
            user: {
                id: user.id,
                username: user.username,
                displayName: user.displayName,
                avatar: user.avatar,
                status: user.status,
                lastSeen: user.lastSeen,
                createdAt: user.createdAt
            }
        });
        
    } catch (error) {
        console.error('Ошибка получения профиля:', error);
        res.status(500).json({
            success: false,
            error: 'Внутренняя ошибка сервера'
        });
    }
});

// 5. ЧАТЫ
// Список чатов пользователя
app.get('/api/chats', (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'Требуется авторизация'
            });
        }
        
        const decoded = Buffer.from(token, 'base64').toString('ascii');
        const [userId] = decoded.split(':');
        
        const userChats = Object.values(chats)
            .filter(chat => chat.participants.includes(userId))
            .map(chat => {
                // Получаем последнее сообщение
                const chatMessages = messages.chats[chat.id] || [];
                const lastMessage = chatMessages.length > 0 
                    ? chatMessages[chatMessages.length - 1]
                    : null;
                
                // Получаем информацию об участниках
                const participantsInfo = chat.participants
                    .filter(pid => pid !== userId)
                    .map(pid => {
                        const user = users[pid];
                        return user ? {
                            id: user.id,
                            username: user.username,
                            displayName: user.displayName,
                            avatar: user.avatar,
                            status: user.status
                        } : null;
                    })
                    .filter(Boolean);
                
                return {
                    id: chat.id,
                    type: chat.type,
                    name: chat.name || participantsInfo[0]?.displayName || 'Чат',
                    avatar: chat.avatar || participantsInfo[0]?.avatar,
                    participants: participantsInfo,
                    lastMessage: lastMessage ? {
                        id: lastMessage.id,
                        content: lastMessage.content,
                        senderId: lastMessage.senderId,
                        timestamp: lastMessage.timestamp,
                        type: lastMessage.type
                    } : null,
                    unreadCount: chat.unreadCount?.[userId] || 0,
                    createdAt: chat.createdAt,
                    updatedAt: chat.updatedAt
                };
            })
            .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        
        res.json({
            success: true,
            chats: userChats
        });
        
    } catch (error) {
        console.error('Ошибка получения чатов:', error);
        res.status(500).json({
            success: false,
            error: 'Внутренняя ошибка сервера'
        });
    }
});

// Создание чата
app.post('/api/chats', (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'Требуется авторизация'
            });
        }
        
        const decoded = Buffer.from(token, 'base64').toString('ascii');
        const [userId] = decoded.split(':');
        
        const { participantId, type = 'private', name } = req.body;
        
        if (!participantId) {
            return res.status(400).json({
                success: false,
                error: 'Укажите участника чата'
            });
        }
        
        // Проверка существующего приватного чата
        if (type === 'private') {
            const existingChat = Object.values(chats).find(chat => 
                chat.type === 'private' &&
                chat.participants.includes(userId) &&
                chat.participants.includes(participantId) &&
                chat.participants.length === 2
            );
            
            if (existingChat) {
                return res.json({
                    success: true,
                    message: 'Чат уже существует',
                    chat: existingChat
                });
            }
        }
        
        // Создание нового чата
        const chatId = `chat_${Date.now()}`;
        const newChat = {
            id: chatId,
            type,
            participants: [userId, participantId],
            name: name || null,
            avatar: null,
            createdBy: userId,
            unreadCount: {},
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        chats[chatId] = newChat;
        writeData(CHATS_FILE, chats);
        
        // Инициализация сообщений для чата
        if (!messages.chats[chatId]) {
            messages.chats[chatId] = [];
            writeData(MESSAGES_FILE, messages);
        }
        
        res.status(201).json({
            success: true,
            message: 'Чат создан',
            chat: newChat
        });
        
    } catch (error) {
        console.error('Ошибка создания чата:', error);
        res.status(500).json({
            success: false,
            error: 'Внутренняя ошибка сервера'
        });
    }
});

// Сообщения чата
app.get('/api/chats/:id/messages', (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'Требуется авторизация'
            });
        }
        
        const { id: chatId } = req.params;
        const decoded = Buffer.from(token, 'base64').toString('ascii');
        const [userId] = decoded.split(':');
        
        // Проверка доступа к чату
        const chat = chats[chatId];
        if (!chat || !chat.participants.includes(userId)) {
            return res.status(403).json({
                success: false,
                error: 'Доступ запрещен'
            });
        }
        
        const chatMessages = messages.chats[chatId] || [];
        
        // Обнуляем счетчик непрочитанных
        if (chat.unreadCount && chat.unreadCount[userId] > 0) {
            chat.unreadCount[userId] = 0;
            chat.updatedAt = new Date().toISOString();
            writeData(CHATS_FILE, chats);
        }
        
        res.json({
            success: true,
            chatId,
            messages: chatMessages.map(msg => ({
                id: msg.id,
                senderId: msg.senderId,
                content: msg.content,
                type: msg.type,
                attachment: msg.attachment,
                timestamp: msg.timestamp,
                readBy: msg.readBy || [],
                deliveredTo: msg.deliveredTo || []
            }))
        });
        
    } catch (error) {
        console.error('Ошибка получения сообщений:', error);
        res.status(500).json({
            success: false,
            error: 'Внутренняя ошибка сервера'
        });
    }
});

// 6. СООБЩЕНИЯ
// Отправка сообщения
app.post('/api/messages', (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'Требуется авторизация'
            });
        }
        
        const decoded = Buffer.from(token, 'base64').toString('ascii');
        const [senderId] = decoded.split(':');
        
        const { chatId, content, type = 'text', attachment } = req.body;
        
        if (!chatId || (!content && !attachment)) {
            return res.status(400).json({
                success: false,
                error: 'Заполните все поля'
            });
        }
        
        // Проверка доступа к чату
        const chat = chats[chatId];
        if (!chat || !chat.participants.includes(senderId)) {
            return res.status(403).json({
                success: false,
                error: 'Доступ запрещен'
            });
        }
        
        // Создание сообщения
        const messageId = Date.now();
        const newMessage = {
            id: messageId,
            chatId,
            senderId,
            content: content || '',
            type,
            attachment: attachment || null,
            timestamp: new Date().toISOString(),
            readBy: [senderId],
            deliveredTo: chat.participants
        };
        
        // Сохранение сообщения
        if (!messages.chats[chatId]) {
            messages.chats[chatId] = [];
        }
        
        messages.chats[chatId].push(newMessage);
        writeData(MESSAGES_FILE, messages);
        
        // Обновление чата
        chat.lastMessage = newMessage;
        chat.updatedAt = new Date().toISOString();
        
        // Увеличение счетчиков непрочитанных для других участников
        chat.participants.forEach(participantId => {
            if (participantId !== senderId) {
                if (!chat.unreadCount) chat.unreadCount = {};
                chat.unreadCount[participantId] = (chat.unreadCount[participantId] || 0) + 1;
            }
        });
        
        writeData(CHATS_FILE, chats);
        
        res.status(201).json({
            success: true,
            message: 'Сообщение отправлено',
            data: newMessage
        });
        
    } catch (error) {
        console.error('Ошибка отправки сообщения:', error);
        res.status(500).json({
            success: false,
            error: 'Внутренняя ошибка сервера'
        });
    }
});

// 7. ОБРАБОТКА ОШИБОК
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Маршрут не найден'
    });
});

app.use((err, req, res, next) => {
    console.error('Ошибка сервера:', err);
    res.status(500).json({
        success: false,
        error: 'Внутренняя ошибка сервера'
    });
});

// ЗАПУСК СЕРВЕРА
app.listen(PORT, () => {
    console.log(`
    🚀 TRIX Messenger Server запущен!
    📍 Порт: ${PORT}
    🌐 URL: https://trix-server-ps8d.onrender.com
    
    📊 Статистика:
    👥 Пользователей: ${Object.keys(users).length}
    💬 Чатов: ${Object.keys(chats).length}
    
    📋 Основные эндпоинты:
    🔑 Аутентификация:
      POST /api/auth/register
      POST /api/auth/login
      GET  /api/auth/me
    
    👥 Пользователи:
      GET  /api/users
      GET  /api/users/search?q=...
      GET  /api/users/:id
    
    💬 Чаты:
      GET  /api/chats
      POST /api/chats
      GET  /api/chats/:id/messages
    
    ✉️ Сообщения:
      POST /api/messages
    `);
});