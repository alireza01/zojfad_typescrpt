// src/telegram/botInfo.ts
import { kv } from "../config.ts";
import { log } from "../utils/misc.ts";
import { telegramApiCall } from "./api.ts";
import type { BotInfo } from "../types.ts";

/**
 * Fetches the bot's info (ID, username), caching it in Deno KV.
 * @param forceUpdate - If true, bypasses the cache and fetches from the API.
 * @returns The bot's information.
 */
export async function getBotInfo(forceUpdate = false): Promise<BotInfo> {
    let botInfo = (await kv.get<BotInfo>(["botInfo"])).value;

    if (!botInfo || forceUpdate) {
        log("INFO", "Fetching bot info from Telegram API...");
        const responseData = await telegramApiCall("getMe");

        if (responseData.ok && responseData.result) {
            botInfo = {
                id: responseData.result.id.toString(),
                username: responseData.result.username || "UnknownBot",
                first_name: responseData.result.first_name,
            };
            await kv.set(["botInfo"], botInfo);
            log("INFO", `Bot info fetched and saved: ID=${botInfo.id}, Username=${botInfo.username}`);
        } else {
            log("ERROR", "Error fetching bot info", responseData);
            // Fallback to the last known value if the API call fails
            botInfo = (await kv.get<BotInfo>(["botInfo"])).value || { id: null, username: "this_bot", first_name: "Bot" };
        }
    }
    return botInfo;
}