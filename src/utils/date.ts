// src/utils/date.ts
import { DateTime } from "https://esm.sh/luxon@3.4.4";
import {
  TEHRAN_TIMEZONE,
  REFERENCE_DATE_GREGORIAN,
  REFERENCE_STATUS,
  MS_PER_DAY,
} from "../config.ts";
import { log } from "./misc.ts";

/**
 * Converts a Jalali (Persian) date to a Gregorian date.
 * @returns An array [year, month, day] or null on error.
 */
export function jalaliToGregorian(jy: number, jm: number, jd: number): [number, number, number] | null {
  try {
    // This is a standard, widely-used algorithm for Jalali to Gregorian conversion.
    let gy = jy <= 979 ? 621 : 1600;
    jy -= jy <= 979 ? 0 : 979;
    let days = 365 * jy + Math.floor(jy / 33) * 8 + Math.floor(((jy % 33) + 3) / 4) + 78 + jd + (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
    gy += 400 * Math.floor(days / 146097);
    days %= 146097;
    if (days > 36524) {
      gy += 100 * Math.floor(--days / 36524);
      days %= 36524;
      if (days >= 365) days++;
    }
    gy += 4 * Math.floor(days / 1461);
    days %= 1461;
    gy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
    let gd = days + 1;
    const sal_a = [0, 31, (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let gm;
    for (gm = 0; gm < 13 && gd > sal_a[gm]; gm++) gd -= sal_a[gm];
    return [gy, gm, gd];
  } catch (e) {
    log("ERROR", `Error in jalaliToGregorian(${jy},${jm},${jd})`, e);
    return null;
  }
}

/**
 * Finds the start of the Persian week (Saturday) for a given UTC date.
 * @param date - The input date (in UTC).
 * @returns A new Date object set to the beginning of that week's Saturday (00:00:00 UTC).
 */
function getStartOfWeekPersian(date: Date): Date {
  const targetDate = new Date(date.getTime());
  const dayOfWeekUTC = targetDate.getUTCDay(); // Sunday = 0, Saturday = 6
  const daysToSubtract = (dayOfWeekUTC + 1) % 7;
  targetDate.setUTCDate(targetDate.getUTCDate() - daysToSubtract);
  targetDate.setUTCHours(0, 0, 0, 0);
  return targetDate;
}

/**
 * Calculates the current week's status (odd/even).
 * @returns "فرد", "زوج", or an error string.
 */
export function getWeekStatus(): string {
  try {
    if (isNaN(REFERENCE_DATE_GREGORIAN.getTime())) {
      return "نامشخص (خطای تنظیمات)";
    }
    
    const now = DateTime.now().setZone(TEHRAN_TIMEZONE);
    const todayTehranAsUTC = new Date(Date.UTC(now.year, now.month - 1, now.day));
    todayTehranAsUTC.setUTCHours(0, 0, 0, 0);
    
    const currentWeekStartDate = getStartOfWeekPersian(todayTehranAsUTC);
    const referenceWeekStartDate = getStartOfWeekPersian(REFERENCE_DATE_GREGORIAN);
    
    const timeDifference = currentWeekStartDate.getTime() - referenceWeekStartDate.getTime();
    const daysDifference = Math.floor(timeDifference / MS_PER_DAY);
    const weeksPassed = Math.floor(daysDifference / 7);
    
    return weeksPassed % 2 === 0 ? REFERENCE_STATUS : (REFERENCE_STATUS === "زوج" ? "فرد" : "زوج");
  } catch (e) {
    log("ERROR", "Error in getWeekStatus", e);
    return "نامشخص (خطا)";
  }
}

/**
 * Gets the current date formatted in Persian.
 * @returns A formatted string like "📅 امروز شنبه ۱ فروردین سال ۱۴۰۳ است".
 */
export function getPersianDate(): string {
  try {
    const now = DateTime.now().setZone(TEHRAN_TIMEZONE);
    const weekday = now.setLocale("fa-IR").toLocaleString({ weekday: "long" });
    const day = now.setLocale("fa-IR-u-nu-latn").toLocaleString({ day: "numeric" });
    const month = now.setLocale("fa-IR").toLocaleString({ month: "long" });
    const year = now.setLocale("fa-IR-u-nu-latn").toLocaleString({ year: "numeric" });
    return `📅 امروز ${weekday} ${day} ${month} سال ${year} است`;
  } catch (e) {
    log("ERROR", "Error generating Persian date string", e);
    return "📅 (خطا در نمایش تاریخ شمسی)";
  }
}

/**
 * Validates a Persian date.
 */
function isValidPersianDate(year: number, month: number, day: number): boolean {
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
    if (year < 1300 || year > 1500 || month < 1 || month > 12 || day < 1) return false;
    if (month <= 6 && day > 31) return false;
    if (month >= 7 && month <= 11 && day > 30) return false;
    if (month === 12) {
        const isLeap = [1, 5, 9, 13, 17, 22, 26, 30].includes(year % 33);
        if (day > (isLeap ? 30 : 29)) return false;
    }
    return true;
}

/**
 * Parses a Persian date string from various formats.
 * @returns An object {year, month, day} or null if invalid.
 */
export function parsePersianDate(dateStr: string): { year: number, month: number, day: number } | null {
    if (!dateStr) return null;
        
    // Normalize digits
    const digitMap: { [key: string]: string } = { '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9', '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9' };
    dateStr = dateStr.replace(/[۰-۹٠-٩]/g, d => digitMap[d]);
    dateStr = dateStr.replace(/[^\d\/\-.]/g, ''); // Sanitize
    
    let parts: string[];
    if (dateStr.includes('/')) parts = dateStr.split('/');
    else if (dateStr.includes('-')) parts = dateStr.split('-');
    else if (dateStr.length === 8 && /^\d{8}$/.test(dateStr)) {
        parts = [dateStr.substring(0, 4), dateStr.substring(4, 6), dateStr.substring(6, 8)];
    } else return null;
    
    if (parts.length !== 3) return null;
    const [p1, p2, p3] = parts.map(p => parseInt(p, 10));
    if (isNaN(p1) || isNaN(p2) || isNaN(p3)) return null;
        
    let year, month, day;
    // YYYY/MM/DD
    if (p1 >= 1300) { year = p1; month = p2; day = p3; }
    // Assume other formats aren't used for simplicity, YYYY/MM/DD is standard.
    else return null;
    
    return isValidPersianDate(year, month, day) ? { year, month, day } : null;
}

export function getPersianMonthName(monthNumber: number): string {
    const persianMonths = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];
    return (monthNumber >= 1 && monthNumber <= 12) ? persianMonths[monthNumber - 1] : "نامعتبر";
}