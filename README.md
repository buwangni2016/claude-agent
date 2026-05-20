# Claude Agent

Two independent projects in one repo:

## Project 1 — Vercel Claude Bot (root)

Next.js web chat app + Telegram webhook.  
**Deploy: Vercel**

```
app/
├── api/chat/route.ts      # Streaming chat API
├── api/telegram/route.ts  # Telegram webhook → Claude
└── page.tsx               # Web chat UI with model selector
```

**Environment variables:**
```
ANTHROPIC_API_KEY=...
ANTHROPIC_BASE_URL=...
ANTHROPIC_MODEL=claude-haiku-4-5-20251001
MATON_API_KEY=...
TELEGRAM_CONNECTION_ID=...
```

---

## Project 2 — Telegram Claude Bot (telegram-claude-bot/)

Full-featured Telegram bot powered by Claude CLI.  
**Deploy: Railway / Render / VPS**

Three versions, pick one:

| Version | Features |
|---------|----------|
| v1-simple | AI chat + /cmd terminal |
| v2-secure | v1 + auth + system monitor |
| v3-full   | v2 + games + tools + UI |

**Quick start:**
```bash
cd telegram-claude-bot
bash setup.sh <YOUR_BOT_TOKEN>
```

**Requires:** Python 3, claude CLI (`npm i -g @anthropic-ai/claude-code`)
