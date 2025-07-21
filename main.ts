// main.ts
import { startBot } from "./src/bot.ts";
import { log } from "./src/utils/misc.ts";

/**
 * Main application entry point.
 * This file is responsible for initiating the bot startup sequence.
 */
async function main() {
  log("INFO", "--- Bot Initializing ---");
  try {
    await startBot();
  } catch (error) {
    log("CRITICAL", "A critical error occurred during bot startup. The application will exit.", error);
    // In a real production environment, you might want to alert an admin here.
    Deno.exit(1);
  }
}

// Run the main function.
main();