// src/config.ts

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { log } from "./utils/misc.ts";
import { jalaliToGregorian } from "./utils/date.ts";
import type { DayKey } from "./types.ts";

// ======================================================================
//      HARDCODED SECRETS - USE YOUR **NEW** KEYS HERE
// ======================================================================
// The getRequiredEnv function has been removed.
// We are now putting your keys directly into the code.

export const BOT_TOKEN = "PASTE_YOUR_NEW_BOT_TOKEN_HERE";
export const SUPABASE_URL = "https://spxabyjgizixrgrkpuol.supabase.co";
export const SUPABASE_KEY = "PASTE_YOUR_NEW_SUPABASE_KEY_HERE";
export const ADMIN_CHAT_ID = "129265741"; // Your Admin ID is permanent here.

// ======================================================================

// --- Telegram API ---
export const TELEGRAM_URL = `https://api.telegram.org/bot${BOT_TOKEN}`;

// --- Date & Time Configuration ---
export const TEHRAN_TIMEZONE = "Asia/Tehran";
export const MS_PER_DAY = 24 * 60 * 60 * 1000;

// --- Week Calculation Reference ---
export const REFERENCE_PERSIAN_YEAR = 1403;
export const REFERENCE_PERSIAN_MONTH = 11; // ????
export const REFERENCE_PERSIAN_DAY = 20;
export const REFERENCE_STATUS = "???"; // "???" (odd) or "???" (even)

// --- Constants ---
export const PERSIAN_WEEKDAYS = ["????", "??????", "??????", "???????", "????????"];
export const PERSIAN_WEEKDAYS_FULL = ["????", "??????", "??????", "???????", "????????", "????????", "????"];
export const ENGLISH_WEEKDAYS: DayKey[] = ["saturday", "sunday", "monday", "tuesday", "wednesday"];
export const SCHEDULE_TIME_REGEX = /^(?:[01]\d|2[0-3]|[89]):[0-5]\d$/; // HH:MM or H:MM
export const LUNCH_START_MINUTES = 12 * 60;
export const LUNCH_END_MINUTES = 13 * 60;

// --- Supabase Client ---
// It will now use the hardcoded values from above
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