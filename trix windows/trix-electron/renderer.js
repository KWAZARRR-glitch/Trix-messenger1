let currentChat = "";

function selectChat(chatName) {
  currentChat = chatName;
  document.getElementById("chat-header").innerText = chatName;
  document.getElementById("messages").innerHTML = "";
}

function sendMessage() {
  const input = document.getElementById("message-input");
  const text = input.value.trim();
  if (!text) return;
  addMessage(text, "me");
  input.value = "";
  setTimeout(botReply, 700);
}

function addMessage(text, sender) {
  const msgDiv = document.createElement("div");
  msgDiv.classList.add("message");
  if (sender === "me") msgDiv.classList.add("me");
  else msgDiv.classList.add("bot");
  msgDiv.innerText = text;
  document.getElementById("messages").appendChild(msgDiv);
  document.getElementById("messages").scrollTop = document.getElementById("messages").scrollHeight;
}

function botReply() {
  if (!currentChat) return;
  const replies = ["Ок 👍", "Понял", "Интересно 🤔", "Хаха 😄", "Расскажи ещё"];
  const reply = replies[Math.floor(Math.random()*replies.length)];
  addMessage(reply, "bot");
}

// Отправка по Enter
document.getElementById("message-input").addEventListener("keypress", function(e){
  if (e.key === "Enter") sendMessage();
});
