// src/telegram/api.ts
import { TELEGRAM_URL, ADMIN_CHAT_ID, supabase } from "../config.ts";
import { log } from "../utils/misc.ts";
import type { Update } from "../types.ts";

/**
 * A generic function to make calls to the Telegram Bot API.
 */
export async function telegramApiCall(method: string, payload: object = {}): Promise<any> {
  const url = `${TELEGRAM_URL}/${method}`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const responseData = await response.json();
    if (!responseData.ok) {
      log("ERROR", `Telegram API Error (${method})`, {
        description: responseData.description,
        error_code: responseData.error_code,
        payload,
      });
    }
    return responseData;
  } catch (error) {
    log("ERROR", `Network/Fetch Error in telegramApiCall (${method})`, error);
    return { ok: false, description: `Network/Fetch Error: ${error.message}` };
  }
}


// --- CORRECTED API FUNCTIONS ---

export function sendMessage(chatId: number | string, text: string, options: { reply_markup?: object, reply_to_message_id?: number } = {}) {
  const payload: any = {
    chat_id: String(chatId),
    text,
    parse_mode: "Markdown",
    ...options
  };
  // This check prevents the "reply markup" error.
  if (!payload.reply_markup) {
    delete payload.reply_markup;
  }
  return telegramApiCall("sendMessage", payload);
}

export function editMessageText(chatId: number | string, messageId: number, text: string, replyMarkup: object | null = null) {
  const payload: any = {
    chat_id: String(chatId),
    message_id: messageId,
    text,
    parse_mode: "Markdown",
    reply_markup: replyMarkup
  };
  // This check prevents the "reply markup" error.
  if (!payload.reply_markup) {
      delete payload.reply_markup;
  }
  return telegramApiCall("editMessageText", payload);
}

export function answerCallbackQuery(queryId: string, text: string = "", showAlert: boolean = false) {
  return telegramApiCall("answerCallbackQuery", {
    callback_query_id: queryId,
    text: text.substring(0, 200),
    show_alert: showAlert,
  });
}

export async function sendDocument(chatId: number | string, documentBuffer: Uint8Array, filename: string, caption: string | null, replyMarkup: object | null) {
    const form = new FormData();
    form.append("chat_id", String(chatId));
    form.append("document", new Blob([documentBuffer], { type: "application/pdf" }), filename);
    if (caption) form.append("caption", caption);
    if (replyMarkup) form.append("reply_markup", JSON.stringify(replyMarkup));
    
    try {
        const response = await fetch(`${TELEGRAM_URL}/sendDocument`, {
            method: 'POST',
            body: form,
        });
        const responseData = await response.json();
        if (!responseData.ok) {
            log("ERROR", `sendDocument Error to ${chatId}`, responseData);
        }
        return responseData;
    } catch (e) {
        log("ERROR", `sendDocument Network/Fetch Error to ${chatId}`, e);
        return { ok: false, description: `Network/Fetch Error: ${e.message}` };
    }
}

export function copyMessage(chatId: number | string, fromChatId: number | string, messageId: number, replyMarkup: object | null = null) {
    const payload: any = {
        chat_id: String(chatId),
        from_chat_id: String(fromChatId),
        message_id: messageId,
        reply_markup: replyMarkup
    };
    if (!payload.reply_markup) {
        delete payload.reply_markup;
    }
    return telegramApiCall("copyMessage", payload);
}

export function deleteMessage(chatId: number | string, messageId: number) {
    return telegramApiCall("deleteMessage", {
        chat_id: String(chatId),
        message_id: messageId,
    });
}

export async function setWebhook(url: string): Promise<boolean> {
  log("INFO", `Setting webhook to: ${url}`);
  const res = await telegramApiCall("setWebhook", { url });
  if (res.ok) {
    log("INFO", "Webhook set successfully!");
    return true;
  } else {
    log("CRITICAL", "Failed to set webhook", res);
    return false;
  }
}

export async function forwardMessage(toChatId: string, fromChatId: string, messageId: number) {
    return telegramApiCall("forwardMessage", {
        chat_id: String(toChatId),
        from_chat_id: String(fromChatId),
        message_id: messageId,
    });
}