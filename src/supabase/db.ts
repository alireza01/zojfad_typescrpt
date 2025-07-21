// src/supabase/db.ts
import { supabase, kv, ENGLISH_WEEKDAYS } from '../config.ts';
import { log, parseTime } from '../utils/misc.ts'; // CORRECTED THIS LINE
import type { User, Chat, UserSchedule, DayKey, Lesson, BotInfo, Broadcast, Schedule } from '../types.ts';

// --- Logging ---
export async function logUsage(user: User, chat: Chat, command: string): Promise<void> {
  try {
    const payload = {
      user_id: user.id,
      first_name: user.first_name?.substring(0, 255),
      last_name: user.last_name?.substring(0, 255),
      username: user.username?.substring(0, 255),
      command: command?.substring(0, 255) || "unknown_action",
      chat_type: chat.type?.substring(0, 50),
      chat_id: chat.id,
      chat_title: (chat.title || "").substring(0, 255),
    };
    supabase.from("bot_usage").insert(payload).then(({ error }) => {
      if (error) log("ERROR", `Supabase usage log error for user ${user.id}: ${error.message}`, payload);
    });
  } catch (e) {
    log("ERROR", "Exception preparing usage log", e);
  }
}

// --- User and Group Management ---
export async function addUser(user: User, chat: Chat): Promise<{ success: boolean; error?: string }> {
  try {
    const fullName = `${user.first_name || ""} ${user.last_name || ""}`.trim() || "کاربر تلگرام";
    const { error } = await supabase.from("users").upsert({
      user_id: user.id,
      chat_id: chat.id,
      full_name: fullName.substring(0, 255),
      username: user.username?.substring(0, 255),
      last_seen_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    
    if (error) {
      log("ERROR", `Error upserting user ${user.id}`, error);
      return { success: false, error: error.message };
    }
    log("INFO", `User ${user.id} (${fullName}) added/updated.`);
    return { success: true };
  } catch (e) {
    log("ERROR", `Exception in addUser for ${user.id}`, e);
    return { success: false, error: e.message };
  }
}

export async function addGroup(chat: Chat): Promise<void> {
  if (chat.type !== "group" && chat.type !== "supergroup") return;
  try {
    const { error } = await supabase.from("groups").upsert({
      group_id: chat.id,
      group_name: (chat.title || `گروه ${chat.id}`).substring(0, 255),
      last_seen_at: new Date().toISOString(),
    }, { onConflict: "group_id" });
    
    if (error) {
      log("ERROR", `Error upserting group ${chat.id}`, error);
    } else {
      log("INFO", `Group ${chat.title || chat.id} added/updated.`);
    }
  } catch (e) {
    log("ERROR", `Exception in addGroup for ${chat.id}`, e);
  }
}

// --- Schedule Management ---
export async function getUserSchedule(userId: number): Promise<UserSchedule> {
    try {
        const { data, error } = await supabase
            .from("user_schedules")
            .select("odd_week_schedule, even_week_schedule")
            .eq("user_id", userId)
            .maybeSingle();
        
        if (error) throw error;
        
        const cleanSchedule = (schedule: any): Schedule => {
            const cleaned: Schedule = {};
            for (const day of ENGLISH_WEEKDAYS) {
                if (Array.isArray(schedule?.[day])) {
                    cleaned[day] = schedule[day]
                        .filter((lesson: any) =>
                            lesson &&
                            typeof lesson.lesson === 'string' &&
                            typeof lesson.start_time === 'string' &&
                            typeof lesson.end_time === 'string' &&
                            typeof lesson.location === 'string'
                        )
                        .sort((a, b) => (parseTime(a.start_time) ?? 9999) - (parseTime(b.start_time) ?? 9999));
                } else {
                    cleaned[day] = [];
                }
            }
            return cleaned;
        };
        
        return {
            odd_week_schedule: cleanSchedule(data?.odd_week_schedule),
            even_week_schedule: cleanSchedule(data?.even_week_schedule)
        };
    } catch (e) {
        log("ERROR", `Error fetching schedule for user ${userId}`, e);
        return { odd_week_schedule: {}, even_week_schedule: {} };
    }
}

export async function saveUserSchedule(userId: number, weekType: 'odd' | 'even', day: DayKey, lesson: Lesson): Promise<void> {
    try {
        const currentSchedules = await getUserSchedule(userId);
        const scheduleField = weekType === "odd" ? "odd_week_schedule" : "even_week_schedule";
        const daySchedule = currentSchedules[scheduleField]?.[day] || [];
                
        const updatedDaySchedule = [...daySchedule, lesson];
        updatedDaySchedule.sort((a, b) => (parseTime(a.start_time) ?? 9999) - (parseTime(b.start_time) ?? 9999));
        
        const finalWeekSchedule = {
            ...(currentSchedules[scheduleField] || {}),
            [day]: updatedDaySchedule
        };
                
        const updatePayload = {
            user_id: userId,
            [scheduleField]: finalWeekSchedule,
            updated_at: new Date().toISOString(),
        };
        
        const { error } = await supabase
            .from("user_schedules")
            .upsert(updatePayload, { onConflict: "user_id" });
        
        if (error) throw error;
        log("INFO", `Saved lesson for user ${userId}, week ${weekType}, day ${day}`);
        
    } catch (e) {
        log("ERROR", `Error saving schedule for user ${userId}`, e);
        throw e;
    }
}

export async function deleteUserScheduleLesson(userId: number, weekType: 'odd' | 'even', day: DayKey, lessonIndex: number): Promise<boolean> {
    try {
        const currentSchedules = await getUserSchedule(userId);
        const scheduleField = weekType === "odd" ? "odd_week_schedule" : "even_week_schedule";
        
        if (!currentSchedules[scheduleField]?.[day]?.[lessonIndex]) {
            log("WARN", `Lesson index ${lessonIndex} not found for deletion`, { userId, weekType, day });
            return false;
        }
        
        const updatedDaySchedule = [...currentSchedules[scheduleField][day]!];
        const deletedLesson = updatedDaySchedule.splice(lessonIndex, 1)[0];
        
        const finalWeekSchedule = { ...currentSchedules[scheduleField] };
        if (updatedDaySchedule.length === 0) {
            delete finalWeekSchedule[day];
        } else {
            finalWeekSchedule[day] = updatedDaySchedule;
        }
        
        const { error } = await supabase
            .from("user_schedules")
            .update({
                [scheduleField]: finalWeekSchedule,
                updated_at: new Date().toISOString(),
            })
            .eq("user_id", userId);
        
        if (error) throw error;
        log("INFO", `Lesson '${deletedLesson.lesson}' deleted for user ${userId}`);
        return true;
        
    } catch (e) {
        log("ERROR", `Error deleting schedule lesson for user ${userId}`, e);
        throw e;
    }
}

export async function deleteUserScheduleDay(userId: number, weekType: 'odd' | 'even', day: DayKey): Promise<boolean> {
    try {
        const currentSchedules = await getUserSchedule(userId);
        const scheduleField = weekType === "odd" ? "odd_week_schedule" : "even_week_schedule";
        
        if (!currentSchedules[scheduleField]?.[day]) {
            log("INFO", `No lessons found to delete for user ${userId}`, { weekType, day });
            return false;
        }
        
        const finalWeekSchedule = { ...currentSchedules[scheduleField] };
        delete finalWeekSchedule[day];
        
        const { error } = await supabase
            .from("user_schedules")
            .update({
                [scheduleField]: finalWeekSchedule,
                updated_at: new Date().toISOString(),
            })
            .eq("user_id", userId);
        
        if (error) throw error;
        log("INFO", `All lessons deleted for user ${userId}, week ${weekType}, day ${day}`);
        return true;
        
    } catch (e) {
        log("ERROR", `Error deleting schedule day for user ${userId}`, e);
        throw e;
    }
}

export async function deleteEntireWeekSchedule(userId: number, weekType: 'odd' | 'even'): Promise<boolean> {
    try {
        const scheduleField = weekType === "odd" ? "odd_week_schedule" : "even_week_schedule";
        const { error } = await supabase
            .from("user_schedules")
            .update({
                [scheduleField]: {},
                updated_at: new Date().toISOString(),
            })
            .eq("user_id", userId);
        
        if (error) throw error;
        log("INFO", `Entire ${weekType} week schedule deleted for user ${userId}`);
        return true;
        
    } catch (e) {
        log("ERROR", `Error deleting entire ${weekType} schedule`, e);
        throw e;
    }
}



// --- Broadcast DB Functions ---

/**
 * Creates a new entry for a broadcast campaign in the database.
 * @returns The newly created broadcast record.
 */
export async function createBroadcast(
  admin_message_id: number,
  admin_chat_id: number,
  method: 'copy' | 'forward',
  target_description: string
): Promise<Broadcast | null> {
  try {
    const { data, error } = await supabase
      .from('broadcasts')
      .insert({ admin_message_id, admin_chat_id, method, target_description, status: 'pending' })
      .select()
      .single();
    
    if (error) throw error;
    return data as Broadcast;
  } catch (e) {
    log("ERROR", "Failed to create broadcast entry in DB", e);
    return null;
  }
}

/**
 * Logs the result of sending a single message in a broadcast.
 */
export async function logBroadcastMessage(
  broadcast_id: number,
  recipient_chat_id: number,
  sent_message_id: number | null,
  status: 'sent' | 'failed',
  failure_reason: string | null = null
): Promise<void> {
  const { error } = await supabase.from('broadcast_messages').insert({
    broadcast_id,
    recipient_chat_id,
    sent_message_id,
    status,
    failure_reason,
  });
  if (error) log("ERROR", "Failed to log broadcast message", { broadcast_id, recipient_chat_id, error });
}

/**
 * Updates the status and stats of a broadcast campaign.
 */
export async function updateBroadcast(
  broadcast_id: number,
  updates: {
    status?: string;
    final_report_message_id?: number;
    success_count?: number;
    fail_count?: number;
  }
): Promise<void> {
  const { error } = await supabase.from('broadcasts').update(updates).eq('id', broadcast_id);
  if (error) log("ERROR", `Failed to update broadcast ${broadcast_id}`, error);
}

/**
 * Fetches all users or groups for target selection.
 * @returns An array of chat_ids.
 */
export async function getTargetIds(type: 'users' | 'groups'): Promise<number[]> {
    const tableName = type;
    const selectField = type === 'users' ? 'chat_id' : 'group_id';
        
    const { data, error } = await supabase.from(tableName).select(selectField);
    
    if (error) {
        log("ERROR", `Failed to fetch all ${type}`, error);
        return [];
    }
    
    return data.map((item: any) => item[selectField]).filter(Boolean);
}