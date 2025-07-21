// src/utils/misc.ts
import { SCHEDULE_TIME_REGEX } from "../config.ts";

/**
 * A standardized logger for consistent console output.
 * @param level - The log level (e.g., INFO, WARN, ERROR, CRITICAL).
 * @param message - The main log message.
 * @param data - Optional data to log as a JSON string.
 */
export function log(level: "INFO" | "WARN" | "ERROR" | "CRITICAL", message: string, data?: any): void {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level}] ${message}`;
  
  if (data) {
    console.log(logMessage, JSON.stringify(data, null, 2));
  } else {
    console.log(logMessage);
  }
  
  if (level === "ERROR" || level === "CRITICAL") {
    if (data instanceof Error) {
        console.error(data.stack);
    } else if (typeof data === 'object') {
        console.error(new Error(JSON.stringify(data)).stack);
    }
  }
}

/**
 * Parses a time string (HH:MM) into total minutes from midnight.
 * @param timeStr - The time string to parse.
 * @returns Total minutes from midnight, or null if invalid.
 */
export function parseTime(timeStr: string): number | null {
  if (!timeStr || !SCHEDULE_TIME_REGEX.test(timeStr)) {
    return null;
  }
  try {
    const [hours, minutes] = timeStr.split(":").map(Number);
    if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      return null;
    }
    return hours * 60 + minutes;
  } catch (e) {
    log("ERROR", `Error parsing time string ${timeStr}`, e);
    return null;
  }
}

/**
 * Formats a duration in minutes into a human-readable Persian string.
 * @param totalMinutes - The duration in minutes.
 * @returns A formatted string like "1 ساعت و 30 دقیقه".
 */
export function formatDuration(totalMinutes: number): string {
  if (totalMinutes <= 0) return "-";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const result: string[] = [];
  if (hours > 0) result.push(`${hours} ساعت`);
  if (minutes > 0) result.push(`${minutes} دقیقه`);
  return result.join(" و ") || "-";
}