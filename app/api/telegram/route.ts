import Anthropic from "@anthropic-ai/sdk";

const claude = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: process.env.ANTHROPIC_BASE_URL,
});

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";
const MATON_API_KEY = process.env.MATON_API_KEY!;
const TELEGRAM_CONN = process.env.TELEGRAM_CONNECTION_ID!;

async function sendTelegramMessage(chatId: number, text: string): Promise<void> {
  const res = await fetch("https://api.maton.ai/telegram/:token/sendMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${MATON_API_KEY}`,
      "Maton-Connection": TELEGRAM_CONN,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error(`[sendMessage] failed ${res.status}: ${err}`);
  }
}

async function sendTyping(chatId: number): Promise<void> {
  await fetch("https://api.maton.ai/telegram/:token/sendChatAction", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${MATON_API_KEY}`,
      "Maton-Connection": TELEGRAM_CONN,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ chat_id: chatId, action: "typing" }),
  });
}

const sessions = new Map<number, Array<{ role: "user" | "assistant"; content: string }>>();

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const message = body?.message;

    if (!message?.text || !message?.chat?.id) {
      return Response.json({ ok: true });
    }

    const chatId: number = message.chat.id;
    const text: string = message.text;
    const firstName: string = message.from?.first_name ?? "朋友";

    console.log(`[telegram] chat_id=${chatId} text="${text.slice(0,50)}"`);

    if (text === "/start") {
      sessions.delete(chatId);
      await sendTelegramMessage(chatId, `👋 你好 ${firstName}！我是 Claude AI 助手，有什么可以帮你的？\n\n/help 查看帮助`);
      return Response.json({ ok: true });
    }
    if (text === "/clear") {
      sessions.delete(chatId);
      await sendTelegramMessage(chatId, "✅ 对话已清除！");
      return Response.json({ ok: true });
    }
    if (text === "/help") {
      await sendTelegramMessage(chatId, "🤖 Claude AI 助手\n\n直接发消息即可对话\n\n/start - 开始新对话\n/clear - 清除记录\n/help - 帮助");
      return Response.json({ ok: true });
    }

    await sendTyping(chatId);

    if (!sessions.has(chatId)) sessions.set(chatId, []);
    const history = sessions.get(chatId)!;
    history.push({ role: "user", content: text });
    if (history.length > 20) history.splice(0, history.length - 20);

    const response = await claude.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: "You are a helpful AI assistant in a Telegram chat. Be concise and friendly. Reply in the same language as the user.",
      messages: history,
    });

    const reply = response.content.find((b) => b.type === "text")?.text ?? "抱歉，没有理解你的问题。";
    history.push({ role: "assistant", content: reply });

    console.log(`[telegram] reply="${reply.slice(0,80)}"`);
    await sendTelegramMessage(chatId, reply);

    return Response.json({ ok: true });
  } catch (err) {
    console.error("[telegram] error:", err);
    return Response.json({ ok: true }); // always 200 to Telegram
  }
}
