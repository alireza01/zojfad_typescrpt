// src/telegram/api.ts
import { TELEGRAM_URL, ADMIN_CHAT_ID, supabase } from "../config.ts";
import { log } from "../utils/misc.ts";
import type { Update } from "../types.ts";

/**
 * A generic function to make calls to the Telegram Bot API.
 * @param method - The API method to call (e.g., "sendMessage").
 * @param payload - The JSON payload for the method.
 * @returns The response from the Telegram API.
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

// --- Specific API Functions ---

export function sendMessage(chatId: number | string, text: string, replyMarkup: object | null = null) {
  return telegramApiCall("sendMessage", {
    chat_id: String(chatId),
    text,
    parse_mode: "Markdown",
    reply_markup: replyMarkup,
  });
}

export function editMessageText(chatId: number | string, messageId: number, text: string, replyMarkup: object | null = null) {
  return telegramApiCall("editMessageText", {
    chat_id: String(chatId),
    message_id: messageId,
    text,
    parse_mode: "Markdown",
    reply_markup: replyMarkup,
  });
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

// ⭐ ADD THESE NEW FUNCTIONS
export function copyMessage(chatId: number | string, fromChatId: number | string, messageId: number, replyMarkup: object | null = null) {
    return telegramApiCall("copyMessage", {
        chat_id: String(chatId),
        from_chat_id: String(fromChatId),
        message_id: messageId,
        reply_markup: replyMarkup,
    });
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

// --- Broadcasting (Admin) ---
export async function forwardMessage(toChatId: string, fromChatId: string, messageId: number) {
    return telegramApiCall("forwardMessage", {
        chat_id: toChatId,
        from_chat_id: fromChatId,
        message_id: messageId,
        disable_notification: true,
    });
}

export async function broadcastMessage(fromChatId: string, messageId: number, targetType: "users" | "groups"): Promise<void> {
    const targetLabel = targetType === "users" ? "کاربران" : "گروه‌ها";
    const tableName = targetType;
    const selectField = targetType === "users" ? "chat_id" : "group_id";
    
    log("INFO", `[Broadcast] Starting broadcast to all ${targetLabel}`);
    const { data, error, count } = await supabase.from(tableName).select(selectField, { count: 'exact' });
    
    if (error || !data) {
        log("ERROR", `[Broadcast] Failed to fetch targets`, error);
        await sendMessage(ADMIN_CHAT_ID, `خطا در دریافت لیست ${targetLabel}: ${error?.message}`);
        return;
    }
    
    const targets: string[] = data.map((item: any) => item[selectField]?.toString()).filter(Boolean);
    const totalTargets = count ?? targets.length;
    
    if (totalTargets === 0) {
        await sendMessage(ADMIN_CHAT_ID, `هیچ ${targetLabel} برای ارسال اعلان یافت نشد.`);
        return;
    }
    
    await sendMessage(ADMIN_CHAT_ID, `⏳ شروع ارسال اعلان به ${totalTargets} ${targetLabel}...`);
        
    let successCount = 0;
    let failCount = 0;
    const BATCH_SIZE = 25;
    const DELAY_MS = 1100;
    
    for (let i = 0; i < targets.length; i += BATCH_SIZE) {
        const batch = targets.slice(i, i + BATCH_SIZE);
        const promises = batch.map(targetId =>
            forwardMessage(targetId, fromChatId, messageId)
                .then(res => (res.ok ? successCount++ : failCount++))
                .catch(() => failCount++)
        );
        await Promise.all(promises);
        log("INFO", `[Broadcast] Batch ${i / BATCH_SIZE + 1} sent. Progress: ${successCount + failCount}/${totalTargets}`);
        if (i + BATCH_SIZE < targets.length) {
            await new Promise(resolve => setTimeout(resolve, DELAY_MS));
        }
    }
    
    const report = `📢 گزارش اعلان:\n\n🎯 هدف: ${totalTargets} ${targetLabel}\n✅ موفق: ${successCount}\n❌ ناموفق: ${failCount}`;
    await sendMessage(ADMIN_CHAT_ID, report);
    log("INFO", "[Broadcast] Finished.", { success: successCount, fail: failCount });
}