import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { CheckCircle, Calendar, BookOpen, Code, Activity, Edit2, Trash2, X } from "lucide-react";
import type { Task } from "../lib/contracts";
import { announceDeletedItem, REFRESH_EVENT } from "../lib/uiEvents";

type CompletedTask = Pick<Task, "id" | "text" | "category" | "description" | "created_at" | "target_month">;

export default function Completed() {
  const [tasks, setTasks] = useState<CompletedTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<CompletedTask | null>(null);
  const [editText, setEditText] = useState("");
  const [editCategory, setEditCategory] = useState("Study");
  const [editDescription, setEditDescription] = useState("");
  const [editMonth, setEditMonth] = useState("");
  const [error, setError] = useState("");

  const loadTasks = useCallback(() => {
    api.getCompletedTasks()
      .then(data => setTasks(Array.isArray(data) ? data : []))
      .catch(() => setTasks([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadTasks(); }, [loadTasks]);
  useEffect(() => {
    window.addEventListener(REFRESH_EVENT, loadTasks);
    return () => window.removeEventListener(REFRESH_EVENT, loadTasks);
  }, [loadTasks]);

  const openEdit = (task: CompletedTask) => {
    setEditing(task);
    setEditText(task.text);
    setEditCategory(task.category || "Study");
    setEditDescription(task.description || "");
    setEditMonth(task.target_month?.slice(0, 7) || task.created_at.slice(0, 7));
  };

  const saveEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editing || !editText.trim() || !editMonth) return;
    try {
      await api.updateTask(editing.id, editText.trim(), editCategory, editDescription.trim(), editMonth);
      setEditing(null);
      setError("");
      loadTasks();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update this objective.");
    }
  };

  const deleteObjective = async (task: CompletedTask) => {
    try {
      await api.deleteTask(task.id);
      setTasks(current => current.filter(item => item.id !== task.id));
      announceDeletedItem({ kind: "task", id: task.id, label: task.text });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete this objective.");
    }
  };

  const getCategoryIcon = (cat: string) => {
    if (cat === 'Study') return <BookOpen size={16} className="text-blue-500" />;
    if (cat === 'Project') return <Code size={16} className="text-purple-500" />;
    if (cat === 'Gym') return <Activity size={16} className="text-red-500" />;
    return <CheckCircle size={16} className="text-gray-500" />;
  };

  return (
    <div className="p-4 md:p-10 max-w-4xl mx-auto space-y-6 animate-in">
      <header className="border-b border-gray-200 pb-6 pt-4">
        <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
          <CheckCircle className="text-[#7C3AED]" size={32} /> Achievements
        </h1>
        <p className="text-gray-500 text-sm mt-2 font-medium">A log of everything you've crushed.</p>
      </header>

      {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {loading ? (
        <div className="text-center py-10 text-gray-400 font-bold animate-pulse">Loading...</div>
      ) : tasks.length === 0 ? (
        <div className="bg-white p-10 rounded-3xl border border-gray-100 shadow-sm text-center">
          <CheckCircle size={48} className="text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-800 mb-2">No achievements yet</h2>
          <p className="text-gray-500 text-sm">Complete an objective on the Dashboard to see it here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
            <div key={task.id} className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex items-start gap-4 hover:shadow-md transition-shadow">
              <div className="p-2 bg-green-50 rounded-xl mt-1">
                <CheckCircle className="text-green-500" size={24} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-base font-bold text-gray-900 leading-tight mb-2">{task.text}</p>
                <div className="flex flex-wrap items-center gap-3 text-xs font-bold text-gray-400 uppercase tracking-wide">
                  <span className="flex items-center gap-1"><Calendar size={14} /> {new Date(task.created_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  <span className="flex items-center gap-1 px-2 py-1 bg-gray-50 rounded-md">{getCategoryIcon(task.category || "")} {task.category || "General"}</span>
                  {task.target_month && <span className="rounded-md bg-violet-50 px-2 py-1 text-violet-700">Planned {new Date(`${task.target_month.slice(0, 7)}-01T00:00:00`).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>}
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <button type="button" onClick={() => openEdit(task)} aria-label={`Edit ${task.text}`} className="grid h-10 w-10 place-items-center rounded-full text-gray-500 hover:bg-violet-50 hover:text-[#6C3BC1]"><Edit2 size={16} /></button>
                <button type="button" onClick={() => void deleteObjective(task)} aria-label={`Delete ${task.text}`} className="grid h-10 w-10 place-items-center rounded-full text-gray-500 hover:bg-red-50 hover:text-red-600"><Trash2 size={16} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && <div className="fixed inset-0 z-[60] flex items-end justify-center bg-[#171421]/45 p-0 backdrop-blur-sm md:items-center md:p-4" onMouseDown={event => { if (event.target === event.currentTarget) setEditing(null); }}>
        <form onSubmit={saveEdit} className="w-full max-w-lg space-y-3 rounded-t-[28px] bg-white p-5 pb-safe shadow-2xl md:rounded-[28px] md:p-6">
          <div className="mb-2 flex items-center justify-between"><h2 className="text-lg font-semibold text-[#242132]">Edit objective</h2><button type="button" onClick={() => setEditing(null)} aria-label="Close edit dialog" className="grid h-9 w-9 place-items-center rounded-full text-gray-500 hover:bg-gray-100"><X size={19} /></button></div>
          <label className="sr-only" htmlFor="completed-edit-title">Objective</label><input id="completed-edit-title" value={editText} onChange={event => setEditText(event.target.value)} className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-violet-400" />
          <label className="sr-only" htmlFor="completed-edit-category">Category</label><select id="completed-edit-category" value={editCategory} onChange={event => setEditCategory(event.target.value)} className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm"><option>Study</option><option>Project</option><option>Gym</option><option>Life</option><option>General</option></select>
          <label className="sr-only" htmlFor="completed-edit-month">Objective month</label><input id="completed-edit-month" type="month" value={editMonth} onChange={event => setEditMonth(event.target.value)} required className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm" />
          <label className="sr-only" htmlFor="completed-edit-context">Context</label><textarea id="completed-edit-context" value={editDescription} onChange={event => setEditDescription(event.target.value)} rows={3} placeholder="Add context" className="w-full resize-none rounded-xl border border-gray-200 px-4 py-3 text-sm" />
          <button type="submit" disabled={!editText.trim() || !editMonth} className="w-full rounded-xl bg-[#7C3AED] py-3 text-sm font-semibold text-white disabled:opacity-50">Save objective</button>
        </form>
      </div>}
    </div>
  );
}
