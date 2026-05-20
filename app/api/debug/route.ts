// Temporary debug endpoint — DELETE after testing
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const chatId = searchParams.get("chat_id");
  const token  = process.env.TELEGRAM_BOT_TOKEN;
  const matonKey  = process.env.MATON_API_KEY;
  const matonConn = process.env.TELEGRAM_CONNECTION_ID;

  const result: Record<string, any> = {
    has_token:   !!token,
    has_maton:   !!matonKey,
    has_conn:    !!matonConn,
    token_prefix: token?.slice(0, 10) + "...",
  };

  if (chatId && token) {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: Number(chatId), text: "✅ Bot 测试消息：发送正常！" }),
    });
    const data = await res.json();
    result.send_result = data;
  }

  return Response.json(result);
}
