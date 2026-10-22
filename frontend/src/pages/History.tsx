import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { MessageSquare, Trash2, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { announceDeletedItem, REFRESH_EVENT } from "../lib/uiEvents";
import type { Conversation } from "../lib/contracts";

export default function History() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const load = () => api.getConversations().then(setConversations).catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Could not load conversations."));
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    const refresh = () => { void load(); };
    window.addEventListener(REFRESH_EVENT, refresh);
    return () => window.removeEventListener(REFRESH_EVENT, refresh);
  }, []);

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const conversation = conversations.find((item) => item.id === id);
    try {
      await api.deleteConversation(id);
      setConversations((current) => current.filter((item) => item.id !== id));
      if (conversation) announceDeletedItem({ kind: "conversation", id, label: conversation.title || "Conversation" });
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete this conversation.");
    }
  };

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto space-y-6">
      <header className="border-b pb-6 flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight">Conversations</h1>
        <button onClick={() => navigate("/chat")} className="bg-[#7C3AED] text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-violet-700">
          <Plus size={16} /> New Chat
        </button>
      </header>

      {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <div className="space-y-3">
        {conversations.map((conv) => (
          <div key={conv.id} onClick={() => navigate(`/chat/${conv.id}`)} className="group bg-white border rounded-2xl p-5 shadow-sm hover:border-[#7C3AED] transition-all cursor-pointer flex justify-between items-center">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-[#7C3AED]/10 text-[#7C3AED] rounded-xl"><MessageSquare size={20} /></div>
              <div>
                <p className="font-bold text-gray-900">{conv.title}</p>
                <p className="text-xs text-gray-400">{new Date(conv.created_at).toLocaleString()}</p>
              </div>
            </div>
            <button onClick={(e) => handleDelete(conv.id, e)} className="p-2 text-gray-300 hover:text-red-500 rounded-xl"><Trash2 size={20} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
