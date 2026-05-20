import Anthropic from "@anthropic-ai/sdk";

const claude = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: process.env.ANTHROPIC_BASE_URL,
});

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";
const MATON_API_KEY = process.env.MATON_API_KEY!;
const TELEGRAM_CONN = process.env.TELEGRAM_CONNECTION_ID!;

// Send message via Maton → Telegram
async function sendTelegramMessage(chatId: number, text: string) {
  await fetch("https://api.maton.ai/telegram/:token/sendMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${MATON_API_KEY}`,
      "Maton-Connection": TELEGRAM_CONN,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
    }),
  });
}

// Show typing indicator
async function sendTyping(chatId: number) {
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

// Per-chat conversation history (in-memory, resets on redeploy)
const sessions = new Map<number, Array<{ role: "user" | "assistant"; content: string }>>();

export async function POST(req: Request) {
  // Verify secret token
  const secret = req.headers.get("x-telegram-bot-api-secret-token");
  if (process.env.WEBHOOK_SECRET && secret !== process.env.WEBHOOK_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = await req.json();
  const message = body?.message;

  if (!message?.text || !message?.chat?.id) {
    return Response.json({ ok: true });
  }

  const chatId: number = message.chat.id;
  const text: string = message.text;
  const firstName: string = message.from?.first_name ?? "朋友";

  // Handle commands
  if (text === "/start") {
    sessions.delete(chatId);
    await sendTelegramMessage(chatId, `👋 你好 ${firstName}！我是 Claude AI 助手，有什么可以帮你的？`);
    return Response.json({ ok: true });
  }

  if (text === "/clear") {
    sessions.delete(chatId);
    await sendTelegramMessage(chatId, "✅ 对话已清除，我们重新开始吧！");
    return Response.json({ ok: true });
  }

  if (text === "/help") {
    await sendTelegramMessage(chatId,
      "🤖 *Claude AI 助手*\n\n" +
      "直接发送消息即可对话\n\n" +
      "命令：\n" +
      "/start \\- 开始新对话\n" +
      "/clear \\- 清除对话记录\n" +
      "/help \\- 查看帮助"
    );
    return Response.json({ ok: true });
  }

  // Show typing
  await sendTyping(chatId);

  // Get or create session
  if (!sessions.has(chatId)) sessions.set(chatId, []);
  const history = sessions.get(chatId)!;
  history.push({ role: "user", content: text });

  // Keep last 20 messages to avoid context overflow
  if (history.length > 20) history.splice(0, history.length - 20);

  try {
    const response = await claude.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: "You are a helpful AI assistant in a Telegram chat. Be concise and friendly. Reply in the same language as the user. Avoid using excessive markdown formatting.",
      messages: history,
    });

    const reply = response.content.find((b) => b.type === "text")?.text ?? "抱歉，我没有理解你的问题。";
    history.push({ role: "assistant", content: reply });

    await sendTelegramMessage(chatId, reply);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    await sendTelegramMessage(chatId, `❌ 出错了：${msg}`);
  }

  return Response.json({ ok: true });
}
