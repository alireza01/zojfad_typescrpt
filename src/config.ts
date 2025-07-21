// src/config.ts

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { log } from "./utils/misc.ts";
import { jalaliToGregorian } from "./utils/date.ts";
import type { DayKey } from "./types.ts";

// --- Environment Variables ---
// Throws an error at startup if any required variable is missing.
function getRequiredEnv(key: string): string {
  const value = Deno.env.get(key);
  if (!value) {
    throw new Error(`CRITICAL ERROR: Required environment variable "${key}" is missing.`);
  }
  return value;
}

export const BOT_TOKEN = getRequiredEnv("BOT_TOKEN");
export const ADMIN_CHAT_ID = getRequiredEnv("ADMIN_CHAT_ID");
export const SUPABASE_URL = getRequiredEnv("SUPABASE_URL");
export const SUPABASE_KEY = getRequiredEnv("SUPABASE_KEY");

// --- Telegram API ---
export const TELEGRAM_URL = `https://api.telegram.org/bot${BOT_TOKEN}`;

// --- Date & Time Configuration ---
export const TEHRAN_TIMEZONE = "Asia/Tehran";
export const MS_PER_DAY = 24 * 60 * 60 * 1000;

// --- Week Calculation Reference ---
// This is the reference point for calculating odd/even weeks.
// Set a date and declare if that date's week is "فرد" (odd) or "زوج" (even).
export const REFERENCE_PERSIAN_YEAR = 1403;
export const REFERENCE_PERSIAN_MONTH = 11; // بهمن
export const REFERENCE_PERSIAN_DAY = 20;
export const REFERENCE_STATUS = "فرد"; // "فرد" (odd) or "زوج" (even)

// --- Constants ---
export const PERSIAN_WEEKDAYS = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه"];
export const PERSIAN_WEEKDAYS_FULL = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنج‌شنبه", "جمعه"];
export const ENGLISH_WEEKDAYS: DayKey[] = ["saturday", "sunday", "monday", "tuesday", "wednesday"];
export const SCHEDULE_TIME_REGEX = /^(?:[01]\d|2[0-3]|[89]):[0-5]\d$/; // HH:MM or H:MM
export const LUNCH_START_MINUTES = 12 * 60;
export const LUNCH_END_MINUTES = 13 * 60;

// --- Supabase Client ---
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  }
});

// --- Deno KV Store ---
export const kv = await Deno.openKv();

// --- Pre-calculated Gregorian Reference Date ---
// This is calculated once at startup for efficiency.
function calculateGregorianReference(): Date {
  try {
    const refGregorianArray = jalaliToGregorian(REFERENCE_PERSIAN_YEAR, REFERENCE_PERSIAN_MONTH, REFERENCE_PERSIAN_DAY);
    if (!refGregorianArray || refGregorianArray.length !== 3) {
      throw new Error("jalaliToGregorian returned invalid data.");
    }
    const gregorianDate = new Date(Date.UTC(refGregorianArray[0], refGregorianArray[1] - 1, refGregorianArray[2]));
    gregorianDate.setUTCHours(0, 0, 0, 0);
    if (isNaN(gregorianDate.getTime())) {
      throw new Error("Calculated Gregorian reference date is invalid.");
    }
    log("INFO", `Reference Gregorian Date (UTC): ${gregorianDate.toISOString()} for Persian ${REFERENCE_PERSIAN_YEAR}/${REFERENCE_PERSIAN_MONTH}/${REFERENCE_PERSIAN_DAY} (${REFERENCE_STATUS})`);
    return gregorianDate;
  } catch (e) {
    log("CRITICAL", "Failed to calculate reference Gregorian date. Bot cannot function correctly.", e);
    throw new Error(`Failed to initialize reference date. Error: ${e.message}`);
  }
}

export const REFERENCE_DATE_GREGORIAN = calculateGregorianReference();