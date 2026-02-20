/// ============================================
// TRIX Messenger Server v2.0
// С полной защитой от DDoS и SQLite базой данных
// ============================================
console.log('❤️ Сервер ЗАПУСКАЕТСЯ...');

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const validator = require('validator');
const compression = require('compression');
const fs = require('fs');

// ========== ИНИЦИАЛИЗАЦИЯ ==========
const app = express();  // ← ТОЛЬКО ОДИН РАЗ!
const server = http.createServer(app);
const PORT = process.env.PORT || 3001;

// ========== ЗАЩИТА ==========
// 1. Helmet - базовая защита
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// 2. Компрессия ответов
app.use(compression());

// 3. CORS настройки
app.use(cors({
    origin: ['http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:5500', 'https://trix-web.netlify.app'],
    credentials: true
}));

// 4. Rate Limiting (защита от DDoS)
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 минут
    max: 100, // максимум 100 запросов с одного IP
    message: { error: 'Слишком много запросов, попробуйте позже' },
    standardHeaders: true,
    legacyHeaders: false,
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 минут
    max: 5, // максимум 5 попыток входа
    message: { error: 'Слишком много попыток входа, попробуйте через 15 минут' },
    skipSuccessfulRequests: true, // сбрасывать счетчик при успешном входе
});

// Применяем лимиты
app.use('/api/', limiter);
app.use('/api/login', authLimiter);
app.use('/api/register', authLimiter);

// 5. Ограничение размера тела запроса
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// 6. Логирование запросов (для обнаружения атак)
app.use((req, res, next) => {
    const start = Date.now();
    
    res.on('finish', () => {
        const duration = Date.now() - start;
        
        // Логируем подозрительно медленные запросы
        if (duration > 5000) {
            console.log(`⚠️ Медленный запрос: ${req.method} ${req.url} - ${duration}ms - IP: ${req.ip}`);
        }
        
        // Логируем много ошибок 4xx
        if (res.statusCode >= 400 && res.statusCode < 500) {
            console.log(`❌ Ошибка клиента: ${res.statusCode} ${req.method} ${req.url} - IP: ${req.ip}`);
        }
    });
    
    next();
});

// 7. Простой blacklist IP (можно добавить свои)
const blacklistedIPs = new Set([
    // '123.123.123.123', // пример заблокированного IP
]);

app.use((req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    
    if (blacklistedIPs.has(ip)) {
        return res.status(403).json({ error: 'Доступ заблокирован' });
    }
    
    next();
});

// ========== СОЗДАНИЕ ПАПОК ==========
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// ========== SQLite БАЗА ДАННЫХ ==========
const db = new sqlite3.Database('./trix.db', (err) => {
    if (err) {
        console.error('❌ Ошибка подключения к БД:', err.message);
    } else {
        console.log('✅ Подключено к SQLite базе данных');
    }
});

// Создаем таблицы
db.serialize(() => {
    // Таблица пользователей
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE,
        password TEXT,
        avatar TEXT,
        status TEXT DEFAULT 'offline',
        lastSeen DATETIME,
        createdAt DATETIME,
        ip TEXT,
        userAgent TEXT
    )`);

    // Таблица сообщений
    db.run(`CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        roomId TEXT,
        senderId TEXT,
        content TEXT,
        type TEXT DEFAULT 'text',
        timestamp DATETIME,
        read BOOLEAN DEFAULT 0,
        FOREIGN KEY(senderId) REFERENCES users(id)
    )`);

    // Таблица чатов
    db.run(`CREATE TABLE IF NOT EXISTS chats (
        roomId TEXT PRIMARY KEY,
        user1Id TEXT,
        user2Id TEXT,
        createdAt DATETIME,
        lastMessage TEXT,
        lastMessageTime DATETIME,
        FOREIGN KEY(user1Id) REFERENCES users(id),
        FOREIGN KEY(user2Id) REFERENCES users(id)
    )`);

    // Таблица для блокировки IP
    db.run(`CREATE TABLE IF NOT EXISTS blocked_ips (
        ip TEXT PRIMARY KEY,
        reason TEXT,
        blockedAt DATETIME,
        expiresAt DATETIME
    )`);

    // Индексы для быстрого поиска
    db.run(`CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(roomId)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_users_status ON users(status)`);

    console.log('✅ Таблицы созданы/проверены');
});

// ========== ФУНКЦИИ РАБОТЫ С БД ==========
const dbAsync = {
    // Пользователи
    addUser: (user) => {
        return new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO users (id, username, password, avatar, status, lastSeen, createdAt, ip, userAgent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [user.id, user.username, user.password || '', user.avatar || '', 'online', new Date().toISOString(), new Date().toISOString(), user.ip || '', user.userAgent || ''],
                (err) => err ? reject(err) : resolve(user)
            );
        });
    },

    getUser: (userId) => {
        return new Promise((resolve, reject) => {
            db.get('SELECT * FROM users WHERE id = ?', [userId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    },

    getUserByUsername: (username) => {
        return new Promise((resolve, reject) => {
            db.get('SELECT * FROM users WHERE username = ?', [username], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    },

    getAllUsers: () => {
        return new Promise((resolve, reject) => {
            db.all('SELECT id, username, avatar, status, lastSeen FROM users', [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    },

    updateUserStatus: (userId, status) => {
        return new Promise((resolve, reject) => {
            db.run(
                'UPDATE users SET status = ?, lastSeen = ? WHERE id = ?',
                [status, new Date().toISOString(), userId],
                (err) => err ? reject(err) : resolve()
            );
        });
    },

    // Сообщения
    saveMessage: (message) => {
        return new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO messages (roomId, senderId, content, type, timestamp) VALUES (?, ?, ?, ?, ?)',
                [message.roomId, message.senderId, message.content, message.type || 'text', message.timestamp || new Date().toISOString()],
                function(err) {
                    if (err) reject(err);
                    else resolve({ ...message, id: this.lastID });
                }
            );
        });
    },

    getChatHistory: (roomId, limit = 50) => {
        return new Promise((resolve, reject) => {
            db.all(
                'SELECT * FROM messages WHERE roomId = ? ORDER BY timestamp ASC LIMIT ?',
                [roomId, limit],
                (err, rows) => err ? reject(err) : resolve(rows)
            );
        });
    },

    // Чаты
    createChat: (roomId, user1Id, user2Id) => {
        return new Promise((resolve, reject) => {
            db.run(
                'INSERT OR IGNORE INTO chats (roomId, user1Id, user2Id, createdAt) VALUES (?, ?, ?, ?)',
                [roomId, user1Id, user2Id, new Date().toISOString()],
                (err) => err ? reject(err) : resolve(roomId)
            );
        });
    },

    // Блокировка IP
    isIPBlocked: (ip) => {
        return new Promise((resolve, reject) => {
            db.get('SELECT * FROM blocked_ips WHERE ip = ? AND (expiresAt IS NULL OR expiresAt > datetime("now"))', [ip], (err, row) => {
                if (err) reject(err);
                else resolve(!!row);
            });
        });
    },

    blockIP: (ip, reason = 'Подозрительная активность', expiresIn = null) => {
        return new Promise((resolve, reject) => {
            const expiresAt = expiresIn ? new Date(Date.now() + expiresIn).toISOString() : null;
            db.run(
                'INSERT OR REPLACE INTO blocked_ips (ip, reason, blockedAt, expiresAt) VALUES (?, ?, ?, ?)',
                [ip, reason, new Date().toISOString(), expiresAt],
                (err) => err ? reject(err) : resolve()
            );
        });
    }
};

// ========== ПРОВЕРКА IP ПРИ КАЖДОМ ЗАПРОСЕ ==========
app.use(async (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    
    try {
        const blocked = await dbAsync.isIPBlocked(ip);
        if (blocked) {
            return res.status(403).json({ error: 'Ваш IP заблокирован' });
        }
        next();
    } catch (error) {
        next();
    }
});

// ========== ВЕБСОКЕТ С ЗАЩИТОЙ ==========
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    maxHttpBufferSize: 1e6, // максимальный размер сообщения ~1MB
    pingTimeout: 60000,
    pingInterval: 25000
});

// Хранилище онлайн пользователей и защита от спама
const onlineUsers = new Map(); // socketId -> user
const messageCounters = new Map(); // socketId -> { count, resetTime }
const RATE_LIMIT = {
    MESSAGES_PER_MINUTE: 20,
    CONNECTIONS_PER_IP: 5
};
const ipConnections = new Map();

io.use((socket, next) => {
    const ip = socket.handshake.address;
    const connections = ipConnections.get(ip) || 0;
    
    if (connections >= RATE_LIMIT.CONNECTIONS_PER_IP) {
        return next(new Error('Слишком много подключений с вашего IP'));
    }
    
    ipConnections.set(ip, connections + 1);
    
    socket.on('disconnect', () => {
        const conns = ipConnections.get(ip) || 1;
        ipConnections.set(ip, Math.max(0, conns - 1));
    });
    
    next();
});

io.on('connection', (socket) => {
    console.log('🔌 Новое подключение:', socket.id, 'IP:', socket.handshake.address);
    
    // Инициализация счетчика сообщений
    messageCounters.set(socket.id, {
        count: 0,
        resetTime: Date.now() + 60000
    });
    
    // Аутентификация
    socket.on('authenticate', async (data) => {
        try {
            const { username } = data;
            
            if (!username) {
                socket.emit('error', { message: 'Имя пользователя обязательно' });
                return;
            }
            
            // Валидация имени
            const cleanUsername = validator.trim(username);
            if (cleanUsername.length < 2 || cleanUsername.length > 20) {
                socket.emit('error', { message: 'Имя должно быть от 2 до 20 символов' });
                return;
            }
            
            if (!validator.isAlphanumeric(cleanUsername, 'en-US', { ignore: ' _-' })) {
                socket.emit('error', { message: 'Только буквы, цифры, пробел, _ и -' });
                return;
            }
            
            // Создаем или получаем пользователя
            const userId = Date.now().toString();
            const user = {
                id: userId,
                username: cleanUsername,
                avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(cleanUsername)}&background=random`,
                status: 'online'
            };
            
            // Проверяем, нет ли уже такого пользователя
            const existingUser = await dbAsync.getUserByUsername(cleanUsername);
            if (!existingUser) {
                await dbAsync.addUser({
                    ...user,
                    ip: socket.handshake.address,
                    userAgent: socket.handshake.headers['user-agent']
                });
            } else {
                user.id = existingUser.id;
                await dbAsync.updateUserStatus(existingUser.id, 'online');
            }
            
            // Сохраняем в памяти
            onlineUsers.set(socket.id, user);
            
            socket.emit('authenticated', { 
                success: true, 
                user: {
                    id: user.id,
                    username: user.username,
                    avatar: user.avatar
                }
            });
            
            // Отправляем список пользователей всем
            const allUsers = await dbAsync.getAllUsers();
            io.emit('userList', allUsers);
            
            console.log(`👤 ${user.username} вошел в чат`);
            
        } catch (error) {
            console.error('Ошибка аутентификации:', error);
            socket.emit('error', { message: 'Ошибка сервера' });
        }
    });
    
    // Отправка сообщения (с защитой от спама)
    socket.on('sendMessage', async (data) => {
        try {
            const user = onlineUsers.get(socket.id);
            if (!user) {
                socket.emit('error', { message: 'Не авторизован' });
                return;
            }
            
            // Проверка на спам
            const counter = messageCounters.get(socket.id);
            const now = Date.now();
            
            if (now > counter.resetTime) {
                // Сброс счетчика каждую минуту
                counter.count = 0;
                counter.resetTime = now + 60000;
                messageCounters.set(socket.id, counter);
            }
            
            if (counter.count >= RATE_LIMIT.MESSAGES_PER_MINUTE) {
                // Если спамит - блокируем на 5 минут
                await dbAsync.blockIP(socket.handshake.address, 'Спам сообщениями', 5 * 60 * 1000);
                socket.emit('error', { message: 'Вы заблокированы за спам' });
                socket.disconnect();
                return;
            }
            
            // Валидация сообщения
            const { roomId, content, type = 'text' } = data;
            
            if (!roomId || !content) {
                socket.emit('error', { message: 'Не все поля заполнены' });
                return;
            }
            
            if (content.length > 1000) {
                socket.emit('error', { message: 'Сообщение слишком длинное (макс. 1000 символов)' });
                return;
            }
            
            const cleanContent = validator.escape(content.substring(0, 1000));
            
            // Увеличиваем счетчик
            counter.count++;
            messageCounters.set(socket.id, counter);
            
            // Создаем сообщение
            const message = {
                roomId,
                senderId: user.id,
                senderName: user.username,
                content: cleanContent,
                type,
                timestamp: new Date().toISOString()
            };
            
            // Сохраняем в БД
            const savedMessage = await dbAsync.saveMessage(message);
            message.id = savedMessage.id;
            
            // Отправляем всем в комнате
            io.to(roomId).emit('newMessage', message);
            
            console.log(`💬 ${user.username}: ${cleanContent.substring(0, 30)}...`);
            
        } catch (error) {
            console.error('Ошибка отправки сообщения:', error);
            socket.emit('error', { message: 'Ошибка сервера' });
        }
    });
    
    // Присоединение к комнате
    socket.on('joinRoom', async (data) => {
        try {
            const { roomId } = data;
            const user = onlineUsers.get(socket.id);
            
            if (!user || !roomId) return;
            
            socket.join(roomId);
            
            // Отправляем историю сообщений
            const history = await dbAsync.getChatHistory(roomId);
            socket.emit('roomHistory', { roomId, messages: history });
            
            console.log(`👥 ${user.username} присоединился к ${roomId}`);
            
        } catch (error) {
            console.error('Ошибка joinRoom:', error);
        }
    });
    
    // Создание приватного чата
    socket.on('createPrivateChat', async (data) => {
        try {
            const { targetUserId } = data;
            const user = onlineUsers.get(socket.id);
            
            if (!user || !targetUserId) return;
            
            const roomId = [user.id, targetUserId].sort().join('_');
            
            // Сохраняем в БД
            await dbAsync.createChat(roomId, user.id, targetUserId);
            
            socket.emit('privateChatCreated', { roomId, withUserId: targetUserId });
            
        } catch (error) {
            console.error('Ошибка создания чата:', error);
        }
    });
    
    // Отключение
    socket.on('disconnect', async () => {
        try {
            const user = onlineUsers.get(socket.id);
            
            if (user) {
                // Обновляем статус в БД
                await dbAsync.updateUserStatus(user.id, 'offline');
                
                // Удаляем из памяти
                onlineUsers.delete(socket.id);
                messageCounters.delete(socket.id);
                
                // Обновляем список пользователей
                const allUsers = await dbAsync.getAllUsers();
                io.emit('userList', allUsers);
                
                console.log(`🔌 ${user.username} отключился`);
            }
            
        } catch (error) {
            console.error('Ошибка при отключении:', error);
        }
    });
});

// ========== API МАРШРУТЫ ==========

// Главная страница
// Главная страница
app.get('/', async (req, res) => {  // ← добавил async
    try {
        const totalUsers = await getTotalUsers();
        const totalMessages = await getTotalMessages();
        
        res.json({
            name: '🚀 TRIX Messenger Server',
            version: '2.0.0',
            status: 'online',
            protection: {
                ddos: '✅ Активна (rate limiting)',
                sqlInjection: '✅ Активна (валидация)',
                xss: '✅ Активна (helmet + экранирование)',
                bruteForce: '✅ Активна (ограничение попыток)',
                ipBlocking: '✅ Активна (черный список)',
                spam: '✅ Активна (лимит сообщений)'
            },
            database: 'SQLite',
            stats: {
                onlineUsers: onlineUsers.size,
                totalUsers,
                totalMessages
            },
            endpoints: {
                register: 'POST /api/register',
                users: 'GET /api/users',
                stats: 'GET /api/stats',
                blockIP: 'POST /api/admin/block (admin only)'
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка получения статистики' });
    }
});

// Регистрация
app.post('/api/register', async (req, res) => {
    try {
        const { username } = req.body;
        
        if (!username) {
            return res.status(400).json({ error: 'Имя пользователя обязательно' });
        }
        
        // Валидация
        const cleanUsername = validator.trim(username);
        
        if (cleanUsername.length < 2 || cleanUsername.length > 20) {
            return res.status(400).json({ error: 'Имя от 2 до 20 символов' });
        }
        
        if (!validator.isAlphanumeric(cleanUsername, 'en-US', { ignore: ' _-' })) {
            return res.status(400).json({ error: 'Только буквы, цифры, пробел, _ и -' });
        }
        
        // Проверка на существование
        const existing = await dbAsync.getUserByUsername(cleanUsername);
        if (existing) {
            return res.status(400).json({ error: 'Имя уже занято' });
        }
        
        const userId = Date.now().toString();
        const newUser = {
            id: userId,
            username: cleanUsername,
            avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(cleanUsername)}&background=random`,
            ip: req.ip,
            userAgent: req.headers['user-agent']
        };
        
        await dbAsync.addUser(newUser);
        
        res.json({
            success: true,
            message: 'Регистрация успешна',
            user: {
                id: newUser.id,
                username: newUser.username,
                avatar: newUser.avatar
            }
        });
        
    } catch (error) {
        console.error('Ошибка регистрации:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Список пользователей
app.get('/api/users', async (req, res) => {
    try {
        const users = await dbAsync.getAllUsers();
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: 'Ошибка получения пользователей' });
    }
});

// Статистика
app.get('/api/stats', async (req, res) => {
    try {
        res.json({
            onlineUsers: onlineUsers.size,
            totalUsers: await getTotalUsers(),
            totalMessages: await getTotalMessages(),
            activeChats: await getActiveChats(),
            blockedIPs: await getBlockedIPsCount()
        });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка получения статистики' });
    }
});

// Админка: блокировка IP (только для localhost)
app.post('/api/admin/block', async (req, res) => {
    const { ip, reason, minutes } = req.body;
    
    // Проверка что запрос с localhost
    if (req.ip !== '::1' && req.ip !== '127.0.0.1' && !req.ip.startsWith('::ffff:127.0.0.1')) {
        return res.status(403).json({ error: 'Доступ запрещен' });
    }
    
    try {
        const expiresIn = minutes ? minutes * 60 * 1000 : null;
        await dbAsync.blockIP(ip, reason || 'Заблокирован администратором', expiresIn);
        res.json({ success: true, message: `IP ${ip} заблокирован` });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка блокировки' });
    }
});

// Вспомогательные функции для статистики
function getTotalUsers() {
    return new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) as count FROM users', [], (err, row) => {
            if (err) reject(err);
            else resolve(row.count);
        });
    });
}

function getTotalMessages() {
    return new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) as count FROM messages', [], (err, row) => {
            if (err) reject(err);
            else resolve(row.count);
        });
    });
}

function getActiveChats() {
    return new Promise((resolve, reject) => {
        db.get('SELECT COUNT(DISTINCT roomId) as count FROM messages WHERE timestamp > datetime("now", "-1 hour")', [], (err, row) => {
            if (err) reject(err);
            else resolve(row.count);
        });
    });
}

function getBlockedIPsCount() {
    return new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) as count FROM blocked_ips WHERE expiresAt IS NULL OR expiresAt > datetime("now")', [], (err, row) => {
            if (err) reject(err);
            else resolve(row.count);
        });
    });
}

// Обработка 404
app.use((req, res) => {
    res.status(404).json({ error: 'Маршрут не найден' });
});

// Обработка ошибок
app.use((err, req, res, next) => {
    console.error('Ошибка сервера:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

// ========== ЗАПУСК ==========
server.listen(PORT, () => {
    console.log(`
    ╔══════════════════════════════════════════╗
    ║     🚀 TRIX Messenger Server v2.0       ║
    ╠══════════════════════════════════════════╣
    ║  📍 Порт: ${PORT}                        ║
    ║  🛡️  DDoS Protection: ✅                ║
    ║  💾 Database: SQLite                     ║
    ║  🔒 Helmet: ✅                          ║
    ║  🚦 Rate Limit: ✅                      ║
    ║  🚫 IP Blacklist: ✅                    ║
    ║  📊 WebSocket: ✅                       ║
    ╚═══════════════════════════════════════════╝
    
    📱 Веб-клиент: http://localhost:${PORT}
    🔌 WebSocket: ws://localhost:${PORT}
    
    📋 API:
    GET  /            - Главная
    POST /api/register - Регистрация
    GET  /api/users    - Список пользователей
    GET  /api/stats    - Статистика
    
    👥 Онлайн: ${onlineUsers.size}
    `);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Завершение работы...');
    db.close((err) => {
        if (err) console.error('Ошибка закрытия БД:', err);
        else console.log('✅ База данных закрыта');
        process.exit(0);
    });
});