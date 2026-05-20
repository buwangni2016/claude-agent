import Anthropic from "@anthropic-ai/sdk";

const claude = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: process.env.ANTHROPIC_BASE_URL,
});

const MODEL        = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";
const MATON_KEY    = process.env.MATON_API_KEY!;
const TELEGRAM_CONN = process.env.TELEGRAM_CONNECTION_ID!;
const BOT_TOKEN    = process.env.TELEGRAM_BOT_TOKEN; // optional, enables image support

const SYSTEM_PROMPT =
  "You are a helpful AI assistant in a Telegram chat. Be concise and friendly. " +
  "Reply in the same language as the user.";

// ── Keyboard ──────────────────────────────────────────────────────────────
const MAIN_KB = {
  keyboard: [
    [{ text: "🔍 搜索" }, { text: "🌐 翻译" }],
    [{ text: "📋 清空记录" }, { text: "❓ 帮助" }],
  ],
  resize_keyboard: true,
};

// ── Telegram API (via Maton or direct) ────────────────────────────────────
async function tg(method: string, body?: object): Promise<any> {
  const url = BOT_TOKEN
    ? `https://api.telegram.org/bot${BOT_TOKEN}/${method}`
    : `https://api.maton.ai/telegram/:token/${method}`;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (!BOT_TOKEN) {
    headers["Authorization"]    = `Bearer ${MATON_KEY}`;
    headers["Maton-Connection"] = TELEGRAM_CONN;
  }

  const res = await fetch(url, {
    method: body ? "POST" : "GET",
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return res.json();
}

async function send(chatId: number, text: string, extra?: object): Promise<void> {
  const res = await tg("sendMessage", { chat_id: chatId, text, ...extra });
  if (!res.ok) console.error("[send]", JSON.stringify(res).slice(0, 200));
}

async function typing(chatId: number): Promise<void> {
  await tg("sendChatAction", { chat_id: chatId, action: "typing" });
}

// ── Download Telegram file (requires BOT_TOKEN) ───────────────────────────
async function downloadFile(fileId: string): Promise<{ base64: string; mime: string } | null> {
  if (!BOT_TOKEN) return null;
  try {
    const info = await tg(`getFile?file_id=${fileId}`);
    const filePath: string = info.result?.file_path;
    if (!filePath) return null;

    const ext  = filePath.split(".").pop()?.toLowerCase() ?? "";
    const mime: Record<string, string> = {
      jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
      gif: "image/gif",  webp: "image/webp", pdf: "application/pdf",
    };

    const dlRes = await fetch(
      `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`
    );
    if (!dlRes.ok) return null;

    const buf    = await dlRes.arrayBuffer();
    const base64 = Buffer.from(buf).toString("base64");
    return { base64, mime: mime[ext] ?? "image/jpeg" };
  } catch (e) {
    console.error("[downloadFile]", e);
    return null;
  }
}

// ── DuckDuckGo search (free, no key) ─────────────────────────────────────
async function ddgSearch(query: string): Promise<string> {
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const res  = await fetch(url, { headers: { "User-Agent": "claude-telegram-bot/1.0" } });
    const data = await res.json() as any;

    const parts: string[] = [];
    if (data.AbstractText)   parts.push(data.AbstractText);
    if (data.Answer)         parts.push(`答案: ${data.Answer}`);
    if (data.Definition)     parts.push(`定义: ${data.Definition}`);

    const topics = (data.RelatedTopics ?? [])
      .slice(0, 3)
      .map((t: any) => t.Text)
      .filter(Boolean);
    if (topics.length) parts.push("相关:\n" + topics.join("\n"));

    return parts.join("\n\n") || "未找到相关结果，请尝试其他关键词。";
  } catch {
    return "搜索服务暂时不可用。";
  }
}

// ── Conversation sessions ────────────────────────────────────────────────
const sessions = new Map<number, Array<{ role: "user" | "assistant"; content: any }>>();

function getHistory(chatId: number) {
  if (!sessions.has(chatId)) sessions.set(chatId, []);
  return sessions.get(chatId)!;
}

// ── Claude chat ──────────────────────────────────────────────────────────
async function chat(chatId: number, userContent: any): Promise<string> {
  const history = getHistory(chatId);
  history.push({ role: "user", content: userContent });
  if (history.length > 20) history.splice(0, history.length - 20);

  const response = await claude.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: history,
  });

  const reply =
    response.content.find((b) => b.type === "text")?.text ?? "抱歉，没有理解你的问题。";
  history.push({ role: "assistant", content: reply });
  return reply;
}

// ── Webhook handler ──────────────────────────────────────────────────────
export async function POST(req: Request) {
  try {
    const body    = await req.json();
    const message = body?.message;
    if (!message?.chat?.id) return Response.json({ ok: true });

    const chatId    = message.chat.id as number;
    const firstName = message.from?.first_name ?? "朋友";
    const text      = (message.text ?? "") as string;

    console.log(`[tg] chat=${chatId} type=${message.photo ? "photo" : message.document ? "doc" : message.voice ? "voice" : "text"} text="${text.slice(0, 40)}"`);

    // ── System commands ──────────────────────────────────────────────────
    if (text === "/start") {
      sessions.delete(chatId);
      await send(chatId,
        `👋 你好 ${firstName}！我是 Claude AI 助手\n\n` +
        `💬 直接发消息聊天\n🔍 /search <关键词> 联网搜索\n🌐 /translate <文字> 翻译\n` +
        `${BOT_TOKEN ? "📷 发图片/文件可分析内容\n" : ""}` +
        `📋 /clear 清空记录  ❓ /help 帮助`,
        { reply_markup: MAIN_KB }
      );
      return Response.json({ ok: true });
    }

    if (text === "/clear" || text === "📋 清空记录") {
      sessions.delete(chatId);
      await send(chatId, "✅ 对话记录已清空！", { reply_markup: MAIN_KB });
      return Response.json({ ok: true });
    }

    if (text === "/help" || text === "❓ 帮助") {
      await send(chatId,
        "🤖 Claude AI 助手 使用说明\n\n" +
        "💬 直接发消息 → AI 对话\n" +
        "🔍 /search <词> → 联网搜索\n" +
        "🌐 /translate <文字> → 翻译\n" +
        `${BOT_TOKEN ? "📷 发图片 → 图片识别分析\n📄 发文件 → 文档内容分析\n" : ""}` +
        "🎤 语音消息 → 暂不支持\n" +
        "📋 /clear → 清空对话记录\n\n" +
        "支持连续多轮对话，记住最近 20 条消息",
        { reply_markup: MAIN_KB }
      );
      return Response.json({ ok: true });
    }

    // ── 🔍 Search command ─────────────────────────────────────────────────
    if (text.startsWith("/search ") || text === "🔍 搜索") {
      const query = text.startsWith("/search ") ? text.slice(8).trim() : "";
      if (!query) {
        await send(chatId, "🔍 请输入搜索关键词：\n示例：/search 今日新闻", { reply_markup: MAIN_KB });
        return Response.json({ ok: true });
      }
      await typing(chatId);
      const results = await ddgSearch(query);
      await typing(chatId);
      const summary = await chat(chatId,
        `用户搜索了"${query}"，搜索结果如下，请根据结果用中文简洁回答：\n\n${results}`
      );
      await send(chatId, summary, { reply_markup: MAIN_KB });
      return Response.json({ ok: true });
    }

    // ── 🌐 Translate command ──────────────────────────────────────────────
    if (text.startsWith("/translate ") || text === "🌐 翻译") {
      const content = text.startsWith("/translate ") ? text.slice(11).trim() : "";
      if (!content) {
        await send(chatId, "🌐 请输入要翻译的内容：\n示例：/translate Hello world\n或直接说：帮我翻译这句话", { reply_markup: MAIN_KB });
        return Response.json({ ok: true });
      }
      await typing(chatId);
      const reply = await chat(chatId, `请将以下内容翻译成中英双语（先中文后英文）：\n${content}`);
      await send(chatId, reply, { reply_markup: MAIN_KB });
      return Response.json({ ok: true });
    }

    // ── 📷 Photo ──────────────────────────────────────────────────────────
    if (message.photo) {
      await typing(chatId);
      const largest = message.photo[message.photo.length - 1];
      const caption = message.caption ?? "请描述这张图片的内容";
      const file    = await downloadFile(largest.file_id);

      if (!file) {
        await send(chatId,
          BOT_TOKEN
            ? "❌ 图片下载失败，请重试"
            : "📷 图片分析需要配置 TELEGRAM_BOT_TOKEN\n\n" +
              "请在 Vercel 环境变量中添加：\nTELEGRAM_BOT_TOKEN = 你的 Bot Token\n\n" +
              "（去 @BotFather 获取）",
          { reply_markup: MAIN_KB }
        );
        return Response.json({ ok: true });
      }

      const reply = await chat(chatId, [
        { type: "image", source: { type: "base64", media_type: file.mime, data: file.base64 } },
        { type: "text", text: caption },
      ]);
      await send(chatId, reply, { reply_markup: MAIN_KB });
      return Response.json({ ok: true });
    }

    // ── 📄 Document ───────────────────────────────────────────────────────
    if (message.document) {
      await typing(chatId);
      const doc     = message.document;
      const caption = message.caption ?? "请分析这个文件的内容";
      const isPdf   = doc.mime_type === "application/pdf";
      const isText  = doc.mime_type?.startsWith("text/");
      const file    = (isPdf || isText) ? await downloadFile(doc.file_id) : null;

      if (!file) {
        const reason = !BOT_TOKEN
          ? "📄 文件分析需要配置 TELEGRAM_BOT_TOKEN\n\n请在 Vercel 环境变量添加：\nTELEGRAM_BOT_TOKEN = 你的 Bot Token"
          : !isPdf && !isText
          ? `❌ 暂不支持 ${doc.mime_type} 格式\n支持：PDF、文本文件`
          : "❌ 文件下载失败，请重试";
        await send(chatId, reason, { reply_markup: MAIN_KB });
        return Response.json({ ok: true });
      }

      const userContent = isPdf
        ? [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: file.base64 } },
            { type: "text", text: caption },
          ]
        : caption + "\n\n文件内容：\n" + Buffer.from(file.base64, "base64").toString("utf-8").slice(0, 3000);

      const reply = await chat(chatId, userContent);
      await send(chatId, reply, { reply_markup: MAIN_KB });
      return Response.json({ ok: true });
    }

    // ── 🎤 Voice ──────────────────────────────────────────────────────────
    if (message.voice || message.audio) {
      await send(chatId,
        "🎤 暂不支持语音消息\n\n请将语音转换为文字后发送",
        { reply_markup: MAIN_KB }
      );
      return Response.json({ ok: true });
    }

    // ── 💬 Regular text chat ──────────────────────────────────────────────
    if (!text) return Response.json({ ok: true });

    await typing(chatId);
    const reply = await chat(chatId, text);
    await send(chatId, reply, { reply_markup: MAIN_KB });

  } catch (err) {
    console.error("[telegram] error:", err);
  }

  return Response.json({ ok: true });
}
