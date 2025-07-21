// src/telegram/handlers.ts
import { handleStartCommand, handleHelpCommand, handleWeekStatusCommand, handleScheduleCommand, handleAdminCommand } from './commands.ts';
import { handleScheduleCallback, handlePdfCallback } from './callbacks.ts';
import { handleBroadcastMenu, handleBroadcastCallback, handleBroadcastContent } from './broadcast.ts';
import { editMessageText, sendMessage, answerCallbackQuery } from './api.ts';
import { ADMIN_CHAT_ID, kv, SCHEDULE_TIME_REGEX } from "../config.ts";
import { logUsage, saveUserSchedule, addUser, addGroup } from "../supabase/db.ts";
import { getBotInfo } from "./botInfo.ts";
import { log, parseTime } from '../utils/misc.ts';
import type { Update, Message, CallbackQuery, User, UserState, BroadcastState } from "../types.ts";

export async function handleUpdate(update: Update) {
  try {
    if (update.message) {
      await handleMessage(update.message);
    } else if (update.callback_query) {
      await handleCallbackQuery(update.callback_query);
    }
  } catch (e) {
    log("CRITICAL", "Unhandled error in handleUpdate", { update, error: e });
  }
}

async function handleMessage(message: Message) {
  const user = message.from;
  if (!user || user.is_bot) return;

  if (message.chat.type === 'private') {
    await addUser(user, message.chat); // Ensure user is always in DB
  } else {
    await addGroup(message.chat); // Ensure group is always in DB
  }

  const text = message.text || "";
  const stateResult = await kv.get<UserState | BroadcastState>([`state:${user.id}`]);

  if (stateResult.value) {
    const state = stateResult.value;

    if (state.name === 'broadcast_awaiting_content' && String(user.id) === ADMIN_CHAT_ID) {
      await handleBroadcastContent(message, user, state as BroadcastState);
      return;
    }

    if (state.name === 'awaiting_lesson_details') {
      await kv.delete([`state:${user.id}`]);
      const parts = text.split('-').map(p => p.trim());
      if (parts.length !== 4 || !SCHEDULE_TIME_REGEX.test(parts[1]) || !SCHEDULE_TIME_REGEX.test(parts[2])) {
        await sendMessage(user.id, "⚠️ فرمت وارد شده نامعتبر است.");
        return;
      }
      await saveUserSchedule(user.id, (state as UserState).weekType!, (state as UserState).day!, { lesson: parts[0], start_time: parts[1], end_time: parts[2], location: parts[3] });
      await sendMessage(user.id, `✅ درس *${parts[0]}* با موفقیت اضافه شد!`);
      return;
    }
  }



  // Handle commands
  if (text.startsWith("/")) {
    const command = text.split(/[\s@]/)[0].toLowerCase();
    const botInfo = await getBotInfo();
    if (message.chat.type !== 'private' && text.includes("@") && !text.toLowerCase().includes(`@${botInfo.username.toLowerCase()}`)) {
      return; // Command is for another bot
    }

    switch (command) {
      case "/start":
        await handleStartCommand(message);
        break;
      case "/help":
        await handleHelpCommand(message);
        break;
      case "/week":
        await handleWeekStatusCommand(message);
        break;
      case "/schedule":
        await handleScheduleCommand(message);
        break;
      case "/pdf": // shortcut for PDF export
        if (message.chat.type === 'private') {
          await handlePdfCallback({ id: "inline-pdf-req", from: user, message });
        }
        break;
      case "/admin":
        await handleAdminCommand(message);
        break;
      default:
        if (message.chat.type === "private") {
          await sendMessage(message.chat.id, `❓ دستور \`${command}\` را متوجه نشدم.`);
        }
    }
  }
}

async function handleCallbackQuery(query: CallbackQuery) {
  const user = query.from;
  const data = query.data || "";
  if (!query.message) return await answerCallbackQuery(query.id);

  if (query.message.chat.type === 'private') {
    await addUser(user, query.message.chat); // Ensure user is always in DB
  }

  log("INFO", `Callback from ${user.username || user.id}: ${data}`);
  const [main, action, ...params] = data.split(":");

  switch (main) {
    case "menu":
      await answerCallbackQuery(query.id);
      if (action === 'help') await handleHelpCommand(query.message, true);
      if (action === 'week_status') await handleWeekStatusCommand(query.message, true);
      if (action === 'schedule') await handleScheduleCommand(query.message, true);
      break;
    case "schedule":
      await handleScheduleCallback(query, action, params);
      break;
    case "pdf":
      if (action === 'export') await handlePdfCallback(query);
      break;
    case "admin":
      await answerCallbackQuery(query.id);
      if (action === 'panel') {
        await handleAdminCommand(query.message, true);
      }
      break;
    // ⭐ NEW: Route all broadcast callbacks to the new handler
    case "broadcast":
      if (action === 'menu') await handleBroadcastMenu(query);
      else await handleBroadcastCallback(query, action, params);
      break;
    case "cancel_action":
      await answerCallbackQuery(query.id);
      await kv.delete([`state:${user.id}`]);
      await editMessageText(query.message.chat.id, query.message.message_id, "عملیات لغو شد.");
      break;
    default:
      log("WARN", "Unhandled callback query", { data });
      await answerCallbackQuery(query.id);
  }
}