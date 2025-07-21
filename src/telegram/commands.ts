// src/telegram/commands.ts
import { sendMessage, editMessageText, answerCallbackQuery } from "./api.ts";
import { logUsage, addUser, addGroup, getUserSchedule, getBotInfo } from "../supabase/db.ts";
import { getPersianDate, getWeekStatus } from "../utils/date.ts";
import { ADMIN_CHAT_ID, kv, ENGLISH_WEEKDAYS, PERSIAN_WEEKDAYS_FULL, SCHEDULE_TIME_REGEX, supabase } from "../config.ts";
import { log, parseTime } from '../utils/misc.ts';
import type { Message, User, Chat } from "../types.ts";

export async function handleStartCommand(message: Message) {
    const user = message.from!;
    const chat = message.chat;
    await logUsage(user, chat, "/start");
    
    if (chat.type === "private") {
        await addUser(user, chat);
        const welcomeMessage = `سلام ${user.first_name}! 👋\n\nبه ربات مدیریت برنامه هفتگی خوش آمدید.\n\n👇 از دکمه‌های زیر برای شروع استفاده کنید:`;
        const replyMarkup = {
            inline_keyboard: [
                [{ text: "🔄 وضعیت هفته و برنامه امروز", callback_data: "menu:week_status" }],
                [{ text: "📅 مشاهده برنامه کامل", callback_data: "schedule:view:full" }],
                [{ text: "⚙️ تنظیم/ویرایش برنامه", callback_data: "menu:schedule" }],
                [{ text: "📤 دریافت PDF برنامه", callback_data: "pdf:export" }],
                [{ text: "ℹ️ راهنما", callback_data: "menu:help" }]
            ],
        };
        await sendMessage(chat.id, welcomeMessage, replyMarkup);
    } else { // Group or Supergroup
        await addGroup(chat);
        const botInfo = await getBotInfo();
        await sendMessage(chat.id, `سلام! 👋 من ربات وضعیت هفته هستم.\nبرای دیدن وضعیت از /week استفاده کنید. برای مدیریت برنامه شخصی، لطفاً در چت خصوصی با من (@${botInfo.username}) صحبت کنید.`);
    }
}

export async function handleHelpCommand(message: Message, fromCallback = false) {
    const user = message.from!;
    await logUsage(user, message.chat, fromCallback ? "callback:menu:help" : "/help");
    
    const isAdmin = String(user.id) === ADMIN_CHAT_ID;
    let helpText = `*راهنمای ربات برنامه هفتگی* 🔰\n\n` +
                   `*/week*: نمایش زوج/فرد بودن هفته و برنامه امروز شما.\n` +
                   `*/schedule*: مدیریت کامل برنامه هفتگی (افزودن، حذف، مشاهده).\n` +
                   `*/pdf*: دریافت فایل PDF زیبا از برنامه شما.\n` +
                   `*/help*: نمایش همین راهنما.\n\n` +
                   `ساخته شده با ❤️ توسط @alirezamozii`;
        
    if (isAdmin && message.chat.type === 'private') {
        helpText += `\n\n*دستورات ادمین:*\n` +
                    `*/admin*: نمایش پنل مدیریت و آمار.`;
    }
    
    const replyMarkup = {
        inline_keyboard: [
            [{ text: "🔄 وضعیت هفته و برنامه امروز", callback_data: "menu:week_status" }],
            [{ text: "📅 مشاهده برنامه کامل", callback_data: "schedule:view:full" }],
            [{ text: "⚙️ تنظیم/ویرایش برنامه", callback_data: "menu:schedule" }],
            [{ text: "📤 دریافت PDF برنامه", callback_data: "pdf:export" }],
            ...(isAdmin && message.chat.type === 'private' ? [[{ text: "👑 پنل مدیریت", callback_data: "admin:panel" }]] : [])
        ]
    };
    
    if (fromCallback) {
        await editMessageText(message.chat.id, message.message_id, helpText, replyMarkup);
    } else {
        await sendMessage(message.chat.id, helpText, replyMarkup);
    }
}

export async function handleWeekStatusCommand(message: Message, fromCallback = false) {
    const user = message.from!;
    const chat = message.chat;
    await logUsage(user, chat, fromCallback ? "callback:menu:week_status" : "/week");
    
    const currentWeekStatus = getWeekStatus();
    const persianDate = getPersianDate();
    
    let weekMessage = `${persianDate}\n\n`;
    weekMessage += `${currentWeekStatus === "زوج" ? "🟢" : "🟣"} هفته فعلی: *${currentWeekStatus}*\n`;
    weekMessage += `${currentWeekStatus === "زوج" ? "🟣" : "🟢"} هفته بعدی: *${currentWeekStatus === "زوج" ? "فرد" : "زوج"}*\n\n`;
        
    let replyMarkup: any = { inline_keyboard: [[{ text: "🔄 بروزرسانی", callback_data: "menu:week_status" }]] };
    
    if (chat.type === "private") {
        const schedule = await getUserSchedule(user.id);
        const todayLuxon = new Date(); // Simplified for Deno Deploy timezone (UTC)
        const todayDayKey = ENGLISH_WEEKDAYS[(todayLuxon.getUTCDay() + 1) % 7]; // Sat = 0, Sun = 1...
        const todayPersianDay = PERSIAN_WEEKDAYS_FULL[(todayLuxon.getUTCDay() + 1) % 7];
        
        const todaySchedule = (currentWeekStatus === 'زوج' ? schedule.even_week_schedule : schedule.odd_week_schedule)[todayDayKey] || [];
                
        if (todaySchedule.length > 0) {
            weekMessage += `*برنامه امروز (${todayPersianDay}):*\n`;
            todaySchedule.forEach(lesson => {
                weekMessage += `• *${lesson.lesson}* (${lesson.start_time} - ${lesson.end_time}) در *${lesson.location}*\n`;
            });
        } else if (ENGLISH_WEEKDAYS.includes(todayDayKey)) {
            weekMessage += `🗓️ شما برای امروز (${todayPersianDay}) در هفته *${currentWeekStatus}* برنامه‌ای ندارید.`;
        } else {
            weekMessage += `🥳 امروز ${todayPersianDay} است! آخر هفته خوبی داشته باشید.`;
        }
                
        replyMarkup = {
            inline_keyboard: [
                [{ text: "🔄 بروزرسانی", callback_data: "menu:week_status" }],
                [{ text: "📅 مشاهده کامل", callback_data: "schedule:view:full" }, { text: "⚙️ تنظیم برنامه", callback_data: "menu:schedule" }],
                [{ text: "↩️ بازگشت به منو", callback_data: "menu:help" }]
            ]
        };
    }
        
    if (fromCallback) {
        await editMessageText(chat.id, message.message_id, weekMessage, replyMarkup);
    } else {
        await sendMessage(chat.id, weekMessage, replyMarkup);
    }
}

export async function handleScheduleCommand(message: Message, fromCallback = false) {
    const user = message.from!;
    const chat = message.chat;
    await logUsage(user, chat, fromCallback ? "callback:menu:schedule" : "/schedule");
    
    if (chat.type !== "private") {
        const botInfo = await getBotInfo();
        await sendMessage(chat.id, `⚠️ مدیریت برنامه فقط در چت خصوصی با من (@${botInfo.username}) امکان‌پذیر است.`);
        return;
    }
        
    const scheduleMessage = "📅 *مدیریت برنامه هفتگی*\n\nاز دکمه‌های زیر برای مدیریت برنامه خود استفاده کنید:";
    const replyMarkup = {
        inline_keyboard: [
            [{ text: "➕ افزودن درس", callback_data: "schedule:set:select_week" }, { text: "🗑️ حذف درس", callback_data: "schedule:delete:main" }],
            [{ text: "📅 مشاهده برنامه کامل", callback_data: "schedule:view:full" }],
            [{ text: "📤 خروجی PDF", callback_data: "pdf:export" }],
            [{ text: "↩️ بازگشت به منوی اصلی", callback_data: "menu:help" }]
        ],
    };
    
    if (fromCallback) {
        await editMessageText(chat.id, message.message_id, scheduleMessage, replyMarkup);
    } else {
        await sendMessage(chat.id, scheduleMessage, replyMarkup);
    }
}

export async function handleAdminCommand(message: Message, fromCallback = false) {
    const user = message.from!;
    if (String(user.id) !== ADMIN_CHAT_ID || message.chat.type !== 'private') {
        await sendMessage(message.chat.id, "⛔️ این دستور مخصوص ادمین است.");
        return;
    }
    await logUsage(user, message.chat, fromCallback ? "callback:admin:panel" : "/admin");
    
    const [usersRes, groupsRes] = await Promise.all([
        supabase.from("users").select('user_id', { count: 'exact', head: true }),
        supabase.from("groups").select('group_id', { count: 'exact', head: true })
    ]);
    
    const adminText = `👑 *پنل مدیریت*\n\n` +
                      `👤 کاربران شناخته شده: *${usersRes.count ?? 'N/A'}*\n` +
                      `👥 گروه‌های شناخته شده: *${groupsRes.count ?? 'N/A'}*\n\n` +
                      `از طریق دکمه زیر می‌توانید پیام همگانی ارسال کنید.`;
    
    const replyMarkup = {
        inline_keyboard: [
            // ⭐ MODIFIED BUTTON
            [{ text: "📢 ارسال پیام همگانی (Broadcast)", callback_data: "broadcast:menu" }],
            [{ text: "↩️ بازگشت به منوی اصلی", callback_data: "menu:help" }]
        ]
    };
    
    if (fromCallback) {
        await editMessageText(message.chat.id, message.message_id, adminText, replyMarkup);
    } else {
        await sendMessage(message.chat.id, adminText, replyMarkup);
    }
}