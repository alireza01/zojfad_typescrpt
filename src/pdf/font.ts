// src/pdf/font.ts
import { log } from "../utils/misc.ts";
import { sendMessage } from "../telegram/api.ts";
import { ADMIN_CHAT_ID } from "../config.ts";

let vazirFontArrayBuffer: ArrayBuffer | null = null;
const FONT_URL = "https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/fonts/ttf/Vazirmatn-Regular.ttf";

/**
 * Fetches the Vazirmatn font and caches it in memory.
 * This is crucial for PDF generation with Persian characters.
 * @returns The font data as an ArrayBuffer, or null on failure.
 */
export async function getVazirFont(): Promise<ArrayBuffer | null> {
  if (vazirFontArrayBuffer) {
    return vazirFontArrayBuffer;
  }
  try {
    log("INFO", "[PDF] Fetching Vazir font...");
    const response = await fetch(FONT_URL);
    if (!response.ok) {
      throw new Error(`Failed to fetch font (${response.status}): ${await response.text()}`);
    }
    const buffer = await response.arrayBuffer();
    if (!buffer || buffer.byteLength === 0) {
      throw new Error("Received empty font data.");
    }
    vazirFontArrayBuffer = buffer;
    log("INFO", `[PDF] Vazir font fetched and cached successfully (${(buffer.byteLength / 1024).toFixed(1)} KB)`);
    return vazirFontArrayBuffer;
  } catch (e) {
    log("CRITICAL", "[PDF] Could not fetch Vazir font. PDF generation will fail.", e);
    await sendMessage(ADMIN_CHAT_ID, `⚠️ Critical Error: Failed to fetch Vazir font for PDF generation. PDFs will fail. Error: ${e.message}`);
    return null;
  }
}