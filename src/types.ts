// src/types.ts

// --- Telegram API Types ---
export interface User {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
}

export interface Chat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
}

export interface Message {
  message_id: number;
  from?: User;
  chat: Chat;
  date: number;
  text?: string;
  reply_to_message?: Message;
  new_chat_members?: User[];
  left_chat_member?: User;
}

export interface CallbackQuery {
  id: string;
  from: User;
  message?: Message;
  data?: string;
}

export interface Update {
  update_id: number;
  message?: Message;
  callback_query?: CallbackQuery;
}

// --- Application Specific Types ---
export interface Lesson {
  lesson: string;
  start_time: string; // "HH:MM"
  end_time: string;   // "HH:MM"
  location: string;
}

export type DayKey = "saturday" | "sunday" | "monday" | "tuesday" | "wednesday";

export type Schedule = {
  [key in DayKey]?: Lesson[];
};

export interface UserSchedule {
  odd_week_schedule: Schedule;
  even_week_schedule: Schedule;
}

export interface UserState {
  name: "awaiting_lesson_details" | "awaiting_teleport_date";
  weekType?: "odd" | "even";
  day?: DayKey;
}

export interface BroadcastState {
  name: "broadcast_started" | "broadcast_method_selected" | "broadcast_awaiting_content" | "broadcast_awaiting_confirmation";
  method?: "copy" | "forward";
  targetType?: "all_users" | "all_groups" | "all_both";
  content_message_id?: number;
  content_chat_id?: number;
}

export interface Broadcast {
  id: number;
  admin_message_id: number;
  admin_chat_id: number;
  method: "copy" | "forward";
  target_description: string;
  status: string;
  final_report_message_id?: number;
  success_count?: number;
  fail_count?: number;
  created_at: string;
}

export interface BotInfo {
  id: string | null;
  username: string;
  first_name: string;
}