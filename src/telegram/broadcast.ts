// src/telegram/broadcast.ts
import { kv, ADMIN_CHAT_ID } from "../config.ts";
import { log } from "../utils/misc.ts";
import { sendMessage, editMessageText, answerCallbackQuery, copyMessage, forwardMessage } from "./api.ts";
import { createBroadcast, getTargetIds, logBroadcastMessage, updateBroadcast } from "../supabase/db.ts";
import type { CallbackQuery, Message, User, BroadcastState } from "../types.ts";

const BROADCAST_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

// Entry point for the broadcast menu from the admin panel
export async function handleBroadcastMenu(query: CallbackQuery) {
    await answerCallbackQuery(query.id);
    const text = "📢 *منوی ارسال پیام همگانی*\n\nلطفا یکی از گزینه‌های زیر را انتخاب کنید:";
    const ikm = {
        inline_keyboard: [
            [{ text: "➕ ایجاد پیام جدید", callback_data: "broadcast:start" }],
            // [{ text: "📂 مشاهده تاریخچه", callback_data: "broadcast:history:0" }], // Placeholder for future history feature
            [{ text: "↩️ بازگشت به پنل ادمین", callback_data: "admin:panel" }]
        ]
    };
    await editMessageText(query.message!.chat.id, query.message!.message_id, text, ikm);
}

// Main router for all broadcast-related button presses
export async function handleBroadcastCallback(query: CallbackQuery, action: string, params: string[]) {
    await answerCallbackQuery(query.id);
    const userId = query.from.id;
    const chatId = query.message!.chat.id;
    const messageId = query.message!.message_id;

    if (action === 'start') {
        await kv.set([`state:${userId}`], { name: 'broadcast_started' }, { expireIn: BROADCAST_TIMEOUT_MS });
        const text = "⚙️ *مرحله ۱: نوع ارسال*\n\nمی‌خواهید پیام شما چگونه ارسال شود؟";
        const ikm = {
            inline_keyboard: [
                [{ text: "✨ ارسال به عنوان کپی (از طرف ربات)", callback_data: "broadcast:setMethod:copy" }],
                [{ text: "↪️ فوروارد از طرف شما", callback_data: "broadcast:setMethod:forward" }],
                [{ text: "❌ لغو", callback_data: "broadcast:cancel" }]
            ]
        };
        await editMessageText(chatId, messageId, text, ikm);
    }

    if (action === 'cancel') {
        await kv.delete([`state:${userId}`]);
        await editMessageText(chatId, messageId, "عملیات ارسال همگانی لغو شد.", {
            inline_keyboard: [[{ text: "↩️ بازگشت به پنل ادمین", callback_data: "admin:panel" }]]
        });
    }

    if (action === 'setMethod') {
        const stateResult = await kv.get<BroadcastState>([`state:${userId}`]);
        if (!stateResult.value || stateResult.value.name !== 'broadcast_started') return;
        const state: BroadcastState = { ...stateResult.value, name: 'broadcast_method_selected', method: params[0] as 'copy' | 'forward' };
        await kv.set([`state:${userId}`], state, { expireIn: BROADCAST_TIMEOUT_MS });

        const text = "🎯 *مرحله ۲: انتخاب گیرندگان*\n\nپیام به کدام گروه از مخاطبین ارسال شود؟";
        const ikm = {
            inline_keyboard: [
                [{ text: "👤 فقط کاربران", callback_data: "broadcast:setTarget:all_users" }],
                [{ text: "👥 فقط گروه‌ها", callback_data: "broadcast:setTarget:all_groups" }],
                [{ text: "👤+👥 کاربران و گروه‌ها", callback_data: "broadcast:setTarget:all_both" }],
                [{ text: "❌ لغو", callback_data: "broadcast:cancel" }]
            ]
        };
        await editMessageText(chatId, messageId, text, ikm);
    }
        
    if (action === 'setTarget') {
        const stateResult = await kv.get<BroadcastState>([`state:${userId}`]);
        if (!stateResult.value || stateResult.value.name !== 'broadcast_method_selected') return;

        const target = params[0] as 'all_users' | 'all_groups' | 'all_both';
        const state: BroadcastState = { ...stateResult.value, name: 'broadcast_awaiting_content', targetType: target };
        await kv.set([`state:${userId}`], state, { expireIn: BROADCAST_TIMEOUT_MS });
                
        const methodText = state.method === 'copy' ? 'کپی (از طرف ربات)' : 'فوروارد';
        const targetText = {
            'all_users': 'همه کاربران',
            'all_groups': 'همه گروه‌ها',
            'all_both': 'همه کاربران و گروه‌ها'
        }[target];

        const text = `✅ *مرحله ۳: ارسال محتوا*\n\nشما در حال ارسال پیام به صورت *${methodText}* به *${targetText}* هستید.\n\nاکنون، لطفا پیامی که می‌خواهید ارسال شود را بفرستید (متن، عکس، ویدیو، فایل و...).`;
        await editMessageText(chatId, messageId, text, {
            inline_keyboard: [[{ text: "❌ لغو", callback_data: "broadcast:cancel" }]]
        });
    }

    if (action === 'confirm_send') {
        const stateResult = await kv.get<BroadcastState>([`state:${userId}`]);
        if (!stateResult.value || stateResult.value.name !== 'broadcast_awaiting_confirmation') return;
        const state = stateResult.value;
        await kv.delete([`state:${userId}`]);

        await editMessageText(chatId, messageId, "✅ تایید شد! فرایند ارسال در پس‌زمینه آغاز می‌شود...");
        executeBroadcast(state, query.from); // Fire and forget
    }
}

// Handles the message content sent by the admin
export async function handleBroadcastContent(message: Message, user: User, state: BroadcastState) {
    const newState: BroadcastState = { ...state, name: 'broadcast_awaiting_confirmation', content_message_id: message.message_id, content_chat_id: message.chat.id };
    await kv.set([`state:${user.id}`], newState, { expireIn: BROADCAST_TIMEOUT_MS });
        
    const targetDesc = {
        'all_users': 'همه کاربران',
        'all_groups': 'همه گروه‌ها',
        'all_both': 'همه کاربران و گروه‌ها'
    }[state.targetType!];

    const text = `🔍 *پیش‌نمایش و تایید نهایی*\n\nشما در حال ارسال پیام بالا به صورت *${state.method === 'copy' ? 'کپی' : 'فوروارد'}* به *${targetDesc}* هستید.\n\n*آیا برای ارسال نهایی تایید می‌کنید؟*`;
        
    await sendMessage(user.id, text, {
        reply_to_message_id: message.message_id,
        inline_keyboard: [
            [{ text: "✅ تایید و ارسال", callback_data: "broadcast:confirm_send" }],
            [{ text: "❌ لغو", callback_data: "broadcast:cancel" }]
        ]
    });
}

// The core function that performs the broadcast
async function executeBroadcast(state: BroadcastState, admin: User) {
    log("INFO", "Executing broadcast", state);
    const { method, targetType, content_message_id, content_chat_id } = state;

    let targets: number[] = [];
    if (targetType === 'all_users' || targetType === 'all_both') {
        targets.push(...await getTargetIds('users'));
    }
    if (targetType === 'all_groups' || targetType === 'all_both') {
        targets.push(...await getTargetIds('groups'));
    }
    targets = [...new Set(targets)]; // Ensure no duplicate IDs

    if (targets.length === 0) {
        await sendMessage(admin.id, "⚠️ هیچ گیرنده‌ای برای ارسال یافت نشد. عملیات لغو شد.");
        return;
    }
        
    const targetDesc = { 'all_users': 'همه کاربران', 'all_groups': 'همه گروه‌ها', 'all_both': 'همه کاربران و گروه‌ها' }[targetType!];
    const broadcast = await createBroadcast(content_message_id!, content_chat_id!, method!, targetDesc);
    if (!broadcast) {
        await sendMessage(admin.id, "❌ خطای سیستمی: امکان ثبت عملیات در دیتابیس وجود ندارد.");
        return;
    }

    const reportMsg = await sendMessage(admin.id, `🚀 در حال ارسال پیام به ${targets.length} گیرنده... (۰٪)`);
    await updateBroadcast(broadcast.id, { final_report_message_id: reportMsg.result.message_id, status: 'sending' });

    let success = 0, fail = 0;
    const BATCH_SIZE = 25, DELAY_MS = 1100;

    for (let i = 0; i < targets.length; i++) {
        const targetId = targets[i];
        try {
            const res = method === 'copy'
                ? await copyMessage(targetId, content_chat_id!, content_message_id!)
                : await forwardMessage(String(targetId), String(content_chat_id!), content_message_id!);

            if (res.ok) {
                success++;
                await logBroadcastMessage(broadcast.id, targetId, res.result.message_id, 'sent');
            } else {
                throw new Error(res.description);
            }
        } catch (e) {
            fail++;
            await logBroadcastMessage(broadcast.id, targetId, null, 'failed', e.message);
        }

        if ((i + 1) % BATCH_SIZE === 0 || i + 1 === targets.length) {
            const progress = Math.round(((i + 1) / targets.length) * 100);
            const reportText = `🚀 در حال ارسال... (${progress}٪)\n\n✅ موفق: ${success}\n❌ ناموفق: ${fail}`;
            await editMessageText(admin.id, reportMsg.result.message_id, reportText).catch(e => log("WARN", "Could not edit progress message", e));
            if (i + 1 < targets.length) await new Promise(resolve => setTimeout(resolve, DELAY_MS));
        }
    }
        
    const finalStatus = fail === 0 ? 'completed' : 'completed_with_errors';
    await updateBroadcast(broadcast.id, { status: finalStatus, success_count: success, fail_count: fail });
        
    const finalReportText = `🏁 *گزارش نهایی ارسال همگانی #${broadcast.id}*\n\n` +
                            `🎯 کل گیرندگان: ${targets.length}\n` +
                            `✅ ارسال موفق: ${success}\n` +
                            `❌ ارسال ناموفق: ${fail}`;
    await editMessageText(admin.id, reportMsg.result.message_id, finalReportText);
}