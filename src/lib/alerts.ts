import type { Notification } from "./types";

/**
 * Delivers alerts outside the app. Telegram works today if TELEGRAM_BOT_TOKEN and
 * TELEGRAM_CHAT_ID are set; email (Resend) is wired in Phase 2.
 */
export async function deliver(n: Notification): Promise<Notification["channel"]> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (token && chatId) {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: n.message }),
    });
    if (res.ok) return "telegram";
  }
  return "in_app";
}
