"use client";

import { useState, useRef, useEffect } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const MODELS = [
  { id: "claude-haiku-4-5-20251001",   label: "Claude Haiku 4.5",   available: true },
  { id: "claude-3-5-haiku-20241022",    label: "Claude Haiku 3.5",   available: false },
  { id: "claude-sonnet-4-5-20250929",   label: "Claude Sonnet 4.5",  available: false },
  { id: "claude-sonnet-4-20250514",     label: "Claude Sonnet 4",    available: false },
  { id: "claude-3-7-sonnet-20250219",   label: "Claude Sonnet 3.7",  available: false },
  { id: "claude-opus-4-5-20251101",     label: "Claude Opus 4.5",    available: false },
  { id: "claude-opus-4-7",              label: "Claude Opus 4.7",    available: false },
];

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [model, setModel] = useState(MODELS[0].id);
  const [showModels, setShowModels] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (modelRef.current && !modelRef.current.contains(e.target as Node)) {
        setShowModels(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const currentModel = MODELS.find((m) => m.id === model) ?? MODELS[0];

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMessage: Message = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    setMessages([...newMessages, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages, model }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(err.error ?? "Request failed");
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += decoder.decode(value, { stream: true });
        setMessages([...newMessages, { role: "assistant", content: fullText }]);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setMessages([...newMessages, { role: "assistant", content: `❌ 错误：${msg}` }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center">
            <span className="text-white text-sm font-bold">C</span>
          </div>
          <h1 className="text-base font-semibold text-gray-900">Claude AI Agent</h1>
        </div>

        {/* Model Selector */}
        <div className="relative" ref={modelRef}>
          <button
            onClick={() => setShowModels(!showModels)}
            className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 transition-colors"
          >
            <span className={`w-2 h-2 rounded-full ${currentModel.available ? "bg-green-500" : "bg-gray-400"}`} />
            <span className="font-medium">{currentModel.label}</span>
            <svg className={`w-4 h-4 transition-transform ${showModels ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showModels && (
            <div className="absolute right-0 top-full mt-1 w-64 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden z-50">
              <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
                <p className="text-xs text-gray-500 font-medium">选择模型</p>
              </div>
              {MODELS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => { setModel(m.id); setShowModels(false); }}
                  disabled={!m.available}
                  className={`w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors ${
                    m.id === model
                      ? "bg-blue-50 text-blue-700"
                      : m.available
                      ? "hover:bg-gray-50 text-gray-700"
                      : "text-gray-400 cursor-not-allowed"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${m.available ? "bg-green-500" : "bg-gray-300"}`} />
                    <span className="text-sm font-medium">{m.label}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {m.id === model && (
                      <svg className="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                    {!m.available && <span className="text-xs text-gray-400">暂不可用</span>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {messages.length === 0 && (
            <div className="text-center py-20">
              <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">🤖</span>
              </div>
              <h2 className="text-xl font-semibold text-gray-700 mb-2">今天有什么我可以帮你的？</h2>
              <p className="text-gray-500 text-sm">当前模型：<span className="font-medium text-gray-700">{currentModel.label}</span></p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "assistant" && (
                <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                  <span className="text-white text-xs font-bold">C</span>
                </div>
              )}
              <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === "user"
                  ? "bg-blue-600 text-white rounded-br-sm"
                  : "bg-white border border-gray-200 text-gray-800 rounded-bl-sm shadow-sm"
              }`}>
                {msg.content || (msg.role === "assistant" && loading && i === messages.length - 1
                  ? <span className="inline-flex gap-1 py-1">
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{animationDelay:"0ms"}} />
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{animationDelay:"150ms"}} />
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{animationDelay:"300ms"}} />
                    </span>
                  : null
                )}
              </div>
              {msg.role === "user" && (
                <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                  <span className="text-white text-xs font-bold">U</span>
                </div>
              )}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </main>

      {/* Input */}
      <footer className="bg-white border-t border-gray-200 px-4 py-4">
        <div className="max-w-3xl mx-auto flex gap-3 items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入消息... (Enter 发送，Shift+Enter 换行)"
            rows={1}
            className="flex-1 resize-none rounded-xl border border-gray-300 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent max-h-40 overflow-y-auto"
            style={{minHeight:"48px"}}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || loading}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-xl px-5 py-3 text-sm font-medium transition-colors flex-shrink-0"
          >
            {loading ? "..." : "发送"}
          </button>
        </div>
      </footer>
    </div>
  );
}
