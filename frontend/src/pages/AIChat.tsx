import { useState, useRef, useEffect } from "react";
import { Send, Paperclip } from "lucide-react";
import { ApiError, api } from "../lib/api";
import ReactMarkdown from "react-markdown";
import { useLocation, useParams, useNavigate } from "react-router-dom";
import type { ChatMessage, ChatMode, PrivacySettings } from "../lib/contracts";

export default function AIChat() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<ChatMode>("quick");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [privacySettings, setPrivacySettings] = useState<PrivacySettings | null>(null);
  const [conversationId, setConversationId] = useState<number | null>(id ? parseInt(id) : null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(async () => {
      const parsedId = id ? Number.parseInt(id, 10) : null;
      if (active) setConversationId(parsedId);
      const privacyRequest = api.getPrivacy().then((settings) => { if (active) setPrivacySettings(settings); }).catch(() => { if (active) setPrivacySettings(null); });
      if (parsedId && Number.isFinite(parsedId)) {
        try {
          const history = await api.getConversationMessages(parsedId);
          if (active) setMessages(history);
        } catch {
          if (active) setMessages([{ role: "assistant", content: "I couldn't load this conversation. Check your connection and try again." }]);
        }
      } else if (active) {
        setMessages([{ role: "assistant", content: "L.Y AI ready. How can I help?" }]);
      }
      await privacyRequest;
    });
    return () => { active = false; };
  }, [id]);

  useEffect(() => {
    const state = location.state as { draftPrompt?: unknown; draftMode?: unknown } | null;
    if (typeof state?.draftPrompt === "string") setInput(state.draftPrompt);
    if (state?.draftMode === "quick" || state?.draftMode === "study" || state?.draftMode === "projects" || state?.draftMode === "therapist") {
      setMode(state.draftMode);
    }
  }, [location.key, location.state]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const handleSend = async () => {
    if ((!input.trim() && selectedFiles.length === 0) || isLoading) return;
    const userMsg = input.trim() || "Analyze attachments.";
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: userMsg }]);
    const filesToSend = [...selectedFiles];
    setSelectedFiles([]);
    setIsLoading(true);

    try {
      const res = await api.chat(userMsg, mode, conversationId, filesToSend);
      setMessages(prev => [...prev, { role: "assistant", content: res.reply }]);
      if (res.attachment_notice) setMessages(prev => [...prev, { role: "assistant", content: `ℹ️ ${res.attachment_notice}` }]);
      if (!conversationId && res.conversation_id) {
        setConversationId(res.conversation_id);
        navigate(`/chat/${res.conversation_id}`, { replace: true });
      }
    } catch (error) {
      if (error instanceof ApiError && typeof error.payload === "object" && error.payload !== null && "conversation_id" in error.payload) {
        const failedConversationId = error.payload.conversation_id;
        if (typeof failedConversationId === "number" && Number.isFinite(failedConversationId)) {
          setConversationId(failedConversationId);
          navigate(`/chat/${failedConversationId}`, { replace: true });
        }
      }
      setMessages(prev => [...prev, {
        role: "assistant",
        content: error instanceof Error ? `⚠️ ${error.message}` : "⚠️ Connection failed. Check that LiveYours and an AI provider are online.",
      }]);
    } finally { setIsLoading(false); }
  };

  const handleFilesSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const incoming = Array.from(event.target.files || []);
    const combined = [...selectedFiles, ...incoming];
    if (combined.length > 5) {
      setMessages(prev => [...prev, { role: "assistant", content: "You can attach up to five documents per message." }]);
    } else if (combined.reduce((sum, file) => sum + file.size, 0) > 20 * 1024 * 1024) {
      setMessages(prev => [...prev, { role: "assistant", content: "Keep the total attachment size under 20 MB per message." }]);
    } else {
      setSelectedFiles(combined);
    }
    event.target.value = "";
  };

  return (
    <div className="mobile-chat-height flex min-h-0 min-w-0 flex-col overflow-hidden bg-white md:m-6 md:h-full md:rounded-3xl md:border md:shadow-sm">
      {/* Mode Switcher */}
      <div className="bg-white border-b border-gray-100 p-2 sticky top-0 z-10">
        {privacySettings && <p role="status" className={`mb-2 rounded-xl px-3 py-2 text-[11px] leading-4 ${privacySettings.cloud_ai_fallback ? "bg-amber-50 text-amber-800" : "bg-violet-50 text-emerald-800"}`}>
          {privacySettings.cloud_ai_fallback ? "Cloud fallback enabled: messages and therapist context may be sent to external AI providers when local AI is unavailable." : "Local-only AI: messages and personal context stay with your configured local model."}
        </p>}
        <div className="flex bg-[#F2F2F7] p-1 rounded-2xl gap-0.5">
          {(["quick", "study", "projects", "therapist"] as ChatMode[]).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={`flex-1 py-2 rounded-xl text-xs font-bold capitalize transition-all ${mode === m ? "bg-white text-[#7C3AED] shadow-sm" : "text-gray-500"}`}>{m}</button>
          ))}
        </div>
        <p className="px-1 pt-2 text-[11px] leading-4 text-gray-500">Choose a mode for your next reply. Switch anytime; the conversation stays in this thread.</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto ios-scroll p-4 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-3xl px-4 py-3 ${msg.role === "user" ? "bg-[#7C3AED] text-white rounded-br-sm" : "bg-[#F2F2F7] text-gray-900 rounded-bl-sm"}`}>
              <div className="prose prose-sm max-w-none prose-p:my-1"><ReactMarkdown>{msg.content}</ReactMarkdown></div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-[#F2F2F7] px-4 py-3 rounded-3xl rounded-bl-sm flex gap-1 items-center">
              <div className="w-2 h-2 bg-[#7C3AED] rounded-full animate-bounce"></div>
              <div className="w-2 h-2 bg-[#7C3AED] rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
              <div className="w-2 h-2 bg-[#7C3AED] rounded-full animate-bounce" style={{animationDelay: '0.4s'}}></div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Selected Files Preview */}
      {selectedFiles.length > 0 && (
        <div className="px-3 pb-2 flex gap-2 flex-wrap">
          {selectedFiles.map((f, i) => (
            <div key={`${f.name}-${i}`} className="max-w-full bg-gray-100 pl-3 pr-1 py-1 rounded-full text-xs font-bold flex items-center gap-2">
              <span className="max-w-[200px] truncate">{f.name}</span> <button aria-label={`Remove ${f.name}`} onClick={() => setSelectedFiles(prev => prev.filter((_, idx) => idx !== i))} className="flex min-h-10 min-w-10 shrink-0 items-center justify-center text-gray-500">✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="p-3 bg-white border-t border-gray-100 pb-safe">
        <div className="flex items-center gap-2">
          <input type="file" accept=".pdf,.png,.jpg,.jpeg,.csv,.xlsx,.xls,application/pdf,image/png,image/jpeg,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" multiple id="chat-file" onChange={handleFilesSelected} className="sr-only" />
          <label aria-label="Attach up to five PDF, image, CSV, or Excel files" htmlFor="chat-file" className="flex min-h-11 min-w-11 items-center justify-center text-gray-600 bg-[#F2F2F7] rounded-full cursor-pointer tap"><Paperclip size={20} /></label>
          <input type="text" enterKeyHint="send" autoComplete="off" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSend()} placeholder="Message…" className="min-w-0 flex-1 bg-[#F2F2F7] rounded-full px-4 md:px-5 py-3 outline-none" />
          <button aria-label="Send message" onClick={handleSend} disabled={isLoading} className="flex min-h-11 min-w-11 items-center justify-center bg-[#7C3AED] text-white rounded-full disabled:opacity-50 tap"><Send size={18} /></button>
        </div>
      </div>
    </div>
  );
}
