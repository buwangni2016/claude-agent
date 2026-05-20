"""
Telegram Bot — calls Claude API directly.
Runs as a persistent process (polling), deploy on Railway / Render / VPS.

Differences from the Vercel project:
  - No web UI, pure Telegram bot
  - Long polling (no webhook needed)
  - No serverless time limits
  - Persistent in-memory session across messages
"""

import os
import logging
import requests
from telegram import Update
from telegram.ext import (
    Application,
    CommandHandler,
    MessageHandler,
    ContextTypes,
    filters,
)

logging.basicConfig(
    format="%(asctime)s [%(levelname)s] %(message)s", level=logging.INFO
)
logger = logging.getLogger(__name__)

# ── Config ─────────────────────────────────────────────────────────────────
TELEGRAM_TOKEN  = os.environ["TELEGRAM_BOT_TOKEN"]
ANTHROPIC_KEY   = os.environ["ANTHROPIC_API_KEY"]
BASE_URL        = os.environ.get("ANTHROPIC_BASE_URL", "https://api.anthropic.com")
MODEL           = os.environ.get("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001")
MAX_HISTORY     = int(os.environ.get("MAX_HISTORY", "20"))

SYSTEM_PROMPT = (
    "You are a helpful AI assistant in a Telegram chat. "
    "Be concise, friendly, and reply in the same language as the user."
)

# ── Per-chat conversation history ──────────────────────────────────────────
sessions: dict[int, list[dict]] = {}


def call_claude(chat_id: int, user_text: str) -> str:
    history = sessions.setdefault(chat_id, [])
    history.append({"role": "user", "content": user_text})
    if len(history) > MAX_HISTORY:
        history[:] = history[-MAX_HISTORY:]

    resp = requests.post(
        f"{BASE_URL.rstrip('/')}/v1/messages",
        json={
            "model": MODEL,
            "max_tokens": 1024,
            "system": SYSTEM_PROMPT,
            "messages": history,
        },
        headers={
            "x-api-key": ANTHROPIC_KEY,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        },
        timeout=60,
    )
    resp.raise_for_status()
    data = resp.json()

    reply = next(
        (b["text"] for b in data.get("content", []) if b.get("type") == "text"),
        "Sorry, no response.",
    )
    history.append({"role": "assistant", "content": reply})
    return reply


# ── Handlers ───────────────────────────────────────────────────────────────
async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    sessions.pop(update.effective_chat.id, None)
    name = update.effective_user.first_name or "there"
    await update.message.reply_text(
        f"👋 Hi {name}! I'm Claude AI assistant.\n\n"
        "/clear — clear conversation\n"
        "/help  — show help"
    )


async def cmd_clear(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    sessions.pop(update.effective_chat.id, None)
    await update.message.reply_text("✅ Conversation cleared!")


async def cmd_help(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(
        "🤖 Claude AI Bot\n\nJust send a message to start chatting.\n\n"
        "/start — new conversation\n"
        "/clear — clear history\n"
        "/help  — this message"
    )


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    chat_id = update.effective_chat.id
    await context.bot.send_chat_action(chat_id=chat_id, action="typing")
    try:
        reply = call_claude(chat_id, update.message.text)
        await update.message.reply_text(reply)
    except Exception as e:
        logger.error("Error: %s", e)
        await update.message.reply_text(f"❌ Error: {e}")


# ── Entry point ────────────────────────────────────────────────────────────
def main() -> None:
    app = Application.builder().token(TELEGRAM_TOKEN).build()
    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("clear", cmd_clear))
    app.add_handler(CommandHandler("help", cmd_help))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    logger.info("Bot polling started...")
    app.run_polling(allowed_updates=["message"])


if __name__ == "__main__":
    main()
