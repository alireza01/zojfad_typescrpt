// src/telegram/callbacks.ts
import { editMessageText, answerCallbackQuery, sendMessage, sendDocument } from "./api.ts";
import { getUserSchedule, saveUserSchedule, deleteEntireWeekSchedule, deleteUserScheduleDay, deleteUserScheduleLesson } from "../supabase/db.ts";
import { generateSchedulePDF } from "../pdf/generator.ts";
import { kv, ENGLISH_WEEKDAYS, PERSIAN_WEEKDAYS, SCHEDULE_TIME_REGEX } from "../config.ts";
import { log } from '../utils/misc.ts';
import type { CallbackQuery, User, DayKey, Lesson } from "../types.ts";

export async function handleScheduleCallback(query: CallbackQuery, action: string, params: string[]) {
    const user = query.from;
    const message = query.message!;
    const chatId = message.chat.id;
    const messageId = message.message_id;
    
    const [weekType, day, lessonIndexStr] = params;
    
    // --- VIEW ---
    if (action === 'view' && params[0] === 'full') {
        const schedule = await getUserSchedule(user.id);
        let scheduleText = "*برنامه کامل هفتگی شما* 📅\n\n";
        let hasContent = false;
                
        const formatWeek = (type: 'odd' | 'even', data: any) => {
            let weekText = `*--- هفته ${type === 'odd' ? 'فرد 🟣' : 'زوج 🟢'} ---*\n`;
            let hasWeekContent = false;
            ENGLISH_WEEKDAYS.forEach((dayKey, index) => {
                const lessons = data[dayKey] || [];
                if (lessons.length > 0) {
                    hasWeekContent = true;
                    hasContent = true;
                    weekText += `\n*${PERSIAN_WEEKDAYS[index]}:*\n`;
                    lessons.forEach((l: Lesson) => weekText += ` • *${l.lesson}* (${l.start_time}-${l.end_time}) در *${l.location}*\n`);
                }
            });
            if (!hasWeekContent) weekText += "_برنامه‌ای برای این هفته تنظیم نشده است._\n";
            return weekText + "\n";
        };
        scheduleText += formatWeek('odd', schedule.odd_week_schedule);
        scheduleText += formatWeek('even', schedule.even_week_schedule);
        if (!hasContent) scheduleText = "شما هنوز هیچ برنامه‌ای تنظیم نکرده‌اید.";
                
        const replyMarkup = { inline_keyboard: [[{ text: "↩️ بازگشت", callback_data: "menu:schedule" }]] };
        await editMessageText(chatId, messageId, scheduleText, replyMarkup);
    }
    // --- SET ---
    else if (action === 'set') {
        if (params[0] === 'select_week') {
            const text = "برنامه کدام هفته را می‌خواهید تنظیم کنید؟";
            const ikm = { inline_keyboard: [
                [{ text: "هفته فرد 🟣", callback_data: "schedule:set:select_day:odd" }, { text: "هفته زوج 🟢", callback_data: "schedule:set:select_day:even" }],
                [{ text: "↩️ بازگشت", callback_data: "menu:schedule" }]
            ]};
            await editMessageText(chatId, messageId, text, ikm);
        } else if (params[0] === 'select_day') {
            const text = `کدام روز از هفته *${weekType === 'odd' ? 'فرد' : 'زوج'}*؟`;
            const buttons = ENGLISH_WEEKDAYS.map((dayKey, index) => ({ text: PERSIAN_WEEKDAYS[index], callback_data: `schedule:set:ask_details:${weekType}:${dayKey}`}));
            const ikm = { inline_keyboard: [
                buttons.slice(0, 3), buttons.slice(3, 5),
                [{ text: "↩️ بازگشت", callback_data: "schedule:set:select_week" }]
            ]};
            await editMessageText(chatId, messageId, text, ikm);
        } else if (params[0] === 'ask_details') {
            await kv.set([`state:${user.id}`], { name: "awaiting_lesson_details", weekType, day });
            const dayLabel = PERSIAN_WEEKDAYS[ENGLISH_WEEKDAYS.indexOf(day as DayKey)];
            const text = `➕ *افزودن درس به ${dayLabel} (هفته ${weekType === 'odd' ? 'فرد' : 'زوج'})*\n\n` +
                         "اطلاعات درس را در یک پیام با فرمت زیر ارسال کنید:\n" +
                         "`نام درس - ساعت شروع - ساعت پایان - محل برگزاری`\n\n" +
                         "*مثال:*\n`ریاضی مهندسی - 08:00 - 10:00 - کلاس ۱۰۱`";
            const ikm = { inline_keyboard: [[{ text: "❌ لغو", callback_data: "cancel_action" }]] };
            await editMessageText(chatId, messageId, text, ikm);
        }
    }
    // --- DELETE ---
    else if (action === 'delete') {
        if (params[0] === 'main') {
            const text = "کدام بخش از برنامه را می‌خواهید حذف کنید؟";
            const ikm = { inline_keyboard: [
                [{ text: "🗑️ حذف یک درس خاص", callback_data: "schedule:delete:select_week:lesson" }],
                [{ text: "🗑️ حذف کل یک روز", callback_data: "schedule:delete:select_week:day" }],
                [{ text: "🗑️ حذف کل یک هفته", callback_data: "schedule:delete:select_week:week" }],
                [{ text: "↩️ بازگشت", callback_data: "menu:schedule" }]
            ]};
            await editMessageText(chatId, messageId, text, ikm);
        } else if (params[0] === 'select_week') {
            const type = params[1]; // lesson, day, or week
            const text = `حذف *${type === 'lesson' ? 'درس' : type === 'day' ? 'روز' : 'هفته'}* از کدام هفته؟`;
            const cb_prefix = `schedule:delete:${type === 'week' ? 'confirm_week' : 'select_day'}:${type}`;
            const ikm = { inline_keyboard: [
                [{ text: "هفته فرد 🟣", callback_data: `${cb_prefix}:odd` }, { text: "هفته زوج 🟢", callback_data: `${cb_prefix}:even` }],
                [{ text: "↩️ بازگشت", callback_data: "schedule:delete:main" }]
            ]};
            await editMessageText(chatId, messageId, text, ikm);
        } else if (params[0] === 'confirm_week') {
            const weekLabel = weekType === 'odd' ? 'فرد' : 'زوج';
            const text = `❓ آیا از حذف *تمام برنامه* هفته *${weekLabel}* مطمئن هستید؟`;
            const ikm = { inline_keyboard: [
                [{ text: `✅ بله، حذف کن`, callback_data: `schedule:delete:execute_week:${weekType}` }],
                [{ text: "❌ نه، بازگشت", callback_data: `schedule:delete:main` }]
            ]};
            await editMessageText(chatId, messageId, text, ikm);
        } else if (params[0] === 'execute_week') {
            await deleteEntireWeekSchedule(user.id, weekType as 'odd'|'even');
            await editMessageText(chatId, messageId, `✅ برنامه هفته *${weekType === 'odd' ? 'فرد' : 'زوج'}* با موفقیت حذف شد.`, { inline_keyboard: [[{ text: "↩️ بازگشت", callback_data: "schedule:delete:main" }]]});
        }
        // ... other delete handlers (day, lesson) would follow a similar pattern ...
    }
    await answerCallbackQuery(query.id);
}

export async function handlePdfCallback(query: CallbackQuery) {
    await answerCallbackQuery(query.id, "⏳ در حال آماده‌سازی PDF...", false);
    const user = query.from;
    const chatId = query.message!.chat.id;
    try {
        const fullName = `${user.first_name || ""} ${user.last_name || ""}`.trim() || `User ${user.id}`;
        const pdfBuffer = await generateSchedulePDF(user.id, fullName);
        const fileName = `schedule_${user.username || user.id}.pdf`;
                
        await sendDocument(chatId, pdfBuffer, fileName, `📅 برنامه هفتگی شما - ${fullName}`, {
            inline_keyboard: [[{ text: "↩️ بازگشت به منو", callback_data: "menu:schedule" }]]
        });
    } catch (e) {
        log("ERROR", `[PDF] Failed to generate or send PDF for user ${user.id}`, e);
        await sendMessage(chatId, "⚠️ متاسفانه در تولید PDF خطایی رخ داد. لطفاً مطمئن شوید فونت در دسترس است و دوباره تلاش کنید.");
    }
}

export async function handleAdminCallback(query: CallbackQuery, action: string, params: string[]) {
    const user = query.from;
    const message = query.message!;
    const chatId = message.chat.id;
    
    if (action === 'confirm_broadcast') {
        const targetType = params[0] as "users" | "groups";
        const messageToForwardId = parseInt(params[1]);
        
        // Remove the confirmation message
        await editMessageText(chatId, message.message_id, `✅ بسیار خب! در حال ارسال پیام به تمام *${targetType === 'users' ? 'کاربران' : 'گروه‌ها'}*...`);
                
        // This is now fire-and-forget
        import('../telegram/api.ts').then(api => {
            api.broadcastMessage(String(chatId), messageToForwardId, targetType);
        });
        
    } else if (action === 'cancel_broadcast') {
        await editMessageText(chatId, message.message_id, "ارسال پیام همگانی لغو شد.");
    }
    await answerCallbackQuery(query.id);
}