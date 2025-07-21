// src/bot.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { BOT_TOKEN, ADMIN_CHAT_ID } from "./config.ts";
import { getBotInfo } from "./telegram/botInfo.ts";
import { getVazirFont } from "./pdf/font.ts";
import { handleUpdate } from "./telegram/handlers.ts";
import { setWebhook, sendMessage } from "./telegram/api.ts";
import { log } from "./utils/misc.ts";
import type { Update } from "./types.ts";

/**
 * Handles incoming webhook requests from Telegram.
 * @param request - The incoming HTTP request.
 * @returns An HTTP Response.
 */
async function handleRequest(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }
  try {
    const update: Update = await request.json();
    // Asynchronously process the update to respond to Telegram quickly.
    handleUpdate(update).catch(e => log("CRITICAL", "Error in async update handler", e));
    return new Response("OK", { status: 200 });
  } catch (e) {
    log("ERROR", "Failed to parse incoming update", e);
    return new Response("Bad Request", { status: 400 });
  }
}

/**
 * Initializes and starts the bot.
 */
export async function startBot() {
  // Pre-fetch critical resources at startup
  await getVazirFont();
  const botInfo = await getBotInfo();
  
  // Deno Deploy provides the port via an environment variable
  const port = Deno.env.get("PORT") ? parseInt(Deno.env.get("PORT")!) : 8000;
  
  serve(handleRequest, {
    port,
    onListen: async ({ hostname, port }) => {
      log("INFO", `✅ Server listening on http://${hostname}:${port}`);
      
      // Only send startup notification if NOTIFY_ON_STARTUP is set to "yes"
      const notifyOnStartup = Deno.env.get("NOTIFY_ON_STARTUP") || "no";
      
      if (notifyOnStartup.toLowerCase() === "yes") {
        // We escape the username to prevent Markdown parsing errors
        const escapedUsername = botInfo.username.replace(/_/g, '\\_');
        const startupMessage = `✅ *Bot Started!*\nID: \`${botInfo.id}\`\nUsername: @${escapedUsername}\nMode: Deno Deploy`;
        
        // Notify admin on startup
        await sendMessage(
          ADMIN_CHAT_ID,
          startupMessage
        );
      }
      
      // Always log this info to the console
      log("INFO", `Bot is running. ID: ${botInfo.id}, Username: @${botInfo.username}`);
      log("INFO", "Make sure the webhook is set in Telegram.");
    },
    onError: (error) => {
      log("CRITICAL", "Server listening error", error);
      return new Response("Server Error", { status: 500 });
    }
  });
}