import sys
import os
import random
from PyQt5.QtWidgets import (
    QApplication, QWidget, QVBoxLayout, QHBoxLayout, QListWidget, QTextEdit,
    QLineEdit, QPushButton, QLabel
)
from PyQt5.QtGui import QColor, QTextCursor, QFont
from PyQt5.QtCore import QTimer

# ---------- Настройки ----------
BG_COLOR = "#111111"       # фон приложения
HEADER_COLOR = "#8B0000"   # тёмно-красная шапка и меню
TEXT_COLOR = "#FFFFFF"     # основной текст
INPUT_COLOR = "#222222"    # поле ввода
MY_MSG_COLOR = "#2A0000"   # сообщения "Ты"
BOT_MSG_COLOR = "#333333"  # сообщения бота

HISTORY_DIR = "history"
if not os.path.exists(HISTORY_DIR):
    os.makedirs(HISTORY_DIR)

chats = ["Алексей", "Мария", "Дмитрий", "Сергей", "TRIX Bot 🤖"]
current_chat = chats[0]

# ---------- Главное окно ----------
class TRIXMessenger(QWidget):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("TRIX Messenger")
        self.setGeometry(100, 100, 900, 600)
        self.setStyleSheet(f"background-color: {BG_COLOR}; color: {TEXT_COLOR};")
        self.current_chat = current_chat
        self.initUI()

    def initUI(self):
        main_layout = QHBoxLayout(self)
        main_layout.setContentsMargins(0,0,0,0)

        # Боковая панель
        self.chat_list = QListWidget()
        self.chat_list.setStyleSheet(f"background-color: {HEADER_COLOR}; color: {TEXT_COLOR};")
        self.chat_list.addItems(chats)
        self.chat_list.currentTextChanged.connect(self.switch_chat)
        self.chat_list.setFixedWidth(200)
        main_layout.addWidget(self.chat_list)

        # Правая панель
        right_panel = QVBoxLayout()

        # Заголовок
        self.chat_header = QLabel(f"Чат с {self.current_chat}")
        self.chat_header.setStyleSheet(f"background-color: {HEADER_COLOR}; color: {TEXT_COLOR}; padding: 10px;")
        self.chat_header.setFont(QFont("Arial", 14, QFont.Bold))
        right_panel.addWidget(self.chat_header)

        # Окно сообщений
        self.messages = QTextEdit()
        self.messages.setReadOnly(True)
        self.messages.setStyleSheet(f"background-color: {BG_COLOR}; color: {TEXT_COLOR};")
        self.messages.setFont(QFont("Arial", 11))
        right_panel.addWidget(self.messages, 8)

        # Поле ввода
        input_layout = QHBoxLayout()
        self.input_field = QLineEdit()
        self.input_field.setStyleSheet(f"background-color: {INPUT_COLOR}; color: {TEXT_COLOR}; padding:5px;")
        self.input_field.returnPressed.connect(self.send_message)
        send_btn = QPushButton("Отправить")
        send_btn.setStyleSheet(f"background-color: {HEADER_COLOR}; color: {TEXT_COLOR}; padding:5px;")
        send_btn.clicked.connect(self.send_message)
        input_layout.addWidget(self.input_field, 8)
        input_layout.addWidget(send_btn, 2)
        right_panel.addLayout(input_layout)

        main_layout.addLayout(right_panel, 8)

        self.load_history()
        self.timer = QTimer()
        self.timer.timeout.connect(self.load_history)
        self.timer.start(500)

    # Файлы истории
    def history_file(self):
        return os.path.join(HISTORY_DIR, f"{self.current_chat}.txt")

    # Добавление сообщений
    def add_message(self, text, sender):
        color = MY_MSG_COLOR if sender=="Ты" else BOT_MSG_COLOR
        self.messages.setTextColor(QColor(color))
        self.messages.append(f"{sender}: {text}")
        self.messages.moveCursor(QTextCursor.End)
        # сохраняем
        with open(self.history_file(), "a", encoding="utf-8") as f:
            f.write(f"{sender}: {text}\n")

    # Отправка сообщений
    def send_message(self):
        text = self.input_field.text().strip()
        if not text: return
        self.input_field.clear()
        self.add_message(text, "Ты")
        # бот отвечает через 0.7 сек
        QTimer.singleShot(700, self.bot_reply)

    # Бот
    def bot_reply(self):
        replies = ["Ок 👍", "Понял", "Интересно 🤔", "Хаха 😄", "Расскажи ещё"]
        self.add_message(random.choice(replies), self.current_chat)

    # Смена чата
    def switch_chat(self, chat_name):
        self.current_chat = chat_name
        self.chat_header.setText(f"Чат с {self.current_chat}")
        self.load_history()

    # Загрузка истории
    def load_history(self):
        self.messages.clear()
        file = self.history_file()
        if os.path.exists(file):
            with open(file, "r", encoding="utf-8") as f:
                for line in f:
                    sender, msg = line.strip().split(": ", 1)
                    color = MY_MSG_COLOR if sender=="Ты" else BOT_MSG_COLOR
                    self.messages.setTextColor(QColor(color))
                    self.messages.append(f"{sender}: {msg}")

# Запуск
app = QApplication(sys.argv)
window = TRIXMessenger()
window.show()
sys.exit(app.exec_())
