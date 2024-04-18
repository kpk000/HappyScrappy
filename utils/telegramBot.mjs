import axios from "axios";

export async function sendAmzMessageTelegram(message, imagePathOrUrl) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_BOT_ID;

  if (!botToken || !chatId) {
    console.log("Bot token or chat ID not defined.");
    return;
  }

  try {
    const url = `https://api.telegram.org/bot${botToken}/sendPhoto`;
    const response = await axios.post(url, {
      chat_id: chatId,
      photo: imagePathOrUrl,
      caption: message,
      parse_mode: "html",
    });
    if (response.status === 200) {
      return true;
    }
  } catch (error) {
    console.error("Error al enviar mensaje:", error);
  }
  {
    return false;
  }
}

export async function sendZlndoMessageTelegram(message, imagePathOrUrl) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_BOT_ID;

  if (!botToken || !chatId) {
    console.log("Bot token or chat ID not defined.");
    return;
  }

  try {
    const url = `https://api.telegram.org/bot${botToken}/sendPhoto`;
    const response = await axios.post(url, {
      chat_id: chatId,
      photo: imagePathOrUrl,
      caption: message,
      parse_mode: "html",
    });
    if (response.status === 200) {
      return true;
    }
  } catch (error) {
    console.error("Error al enviar mensaje:", error);
  }
  {
    return false;
  }
}
