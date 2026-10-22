import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Activity, Plus, Search, Sparkles, X } from "lucide-react";
import { api } from "../../lib/api";
import { announceDataRefresh, CAPTURE_EVENT, DELETE_EVENT, PALETTE_EVENT, type DeletedItemNotice } from "../../lib/uiEvents";
import type { ActivityType } from "../../lib/contracts";

type CaptureKind = "task" | "activity" | "expense";
type LauncherAction = { title: string; detail: string; path?: string; capture?: true; key?: string };

const launcherActions: LauncherAction[] = [
  { title: "Quick capture", detail: "Save a priority, activity, or expense", capture: true, key: "C" },
  { title: "Home", detail: "Today’s overview", path: "/" },
  { title: "Talk to L.Y", detail: "Open your private AI workspace", path: "/chat" },
  { title: "Log a moment", detail: "Gym, run, study, sleep, or spending", path: "/log" },
  { title: "View trends", detail: "Your activity and sleep analytics", path: "/analytics" },
  { title: "Study library", detail: "Documents and flashcards", path: "/library" },
  { title: "Conversations", detail: "Return to a saved chat", path: "/history" },
  { title: "Achievements", detail: "Completed priorities", path: "/completed" },
];

export default function GlobalActions() {
  const navigate = useNavigate();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [captureKind, setCaptureKind] = useState<CaptureKind>("task");
  const [activityType, setActivityType] = useState<ActivityType>("Gym");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Food");
  const [amount, setAmount] = useState("");
  const [minutes, setMinutes] = useState("");
  const [distance, setDistance] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<DeletedItemNotice | null>(null);
  const [noticeText, setNoticeText] = useState("");
  const [undoing, setUndoing] = useState(false);
  const [privacyMode, setPrivacyMode] = useState<"local-only" | "cloud-fallback" | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const noticeTimer = useRef<number | undefined>(undefined);

  const filteredActions = useMemo(() => launcherActions.filter((action) =>
    `${action.title} ${action.detail}`.toLowerCase().includes(query.trim().toLowerCase())
  ), [query]);

  const showNotice = useCallback((message: string, item: DeletedItemNotice | null = null) => {
    window.clearTimeout(noticeTimer.current);
    setNotice(item);
    setNoticeText(message);
    noticeTimer.current = window.setTimeout(() => {
      setNotice(null);
      setNoticeText("");
    }, item ? 8_000 : 3_500);
  }, []);

  useEffect(() => {
    void api.getPrivacy().then((settings) => setPrivacyMode(settings.ai_mode)).catch(() => setPrivacyMode(null));
    const onDeleted = (event: Event) => {
      const detail = (event as CustomEvent<DeletedItemNotice>).detail;
      if (detail) showNotice(`${detail.label} deleted`, detail);
    };
    const openPalette = () => { setPaletteOpen(true); setCaptureOpen(false); setQuery(""); };
    const openCapture = () => { setCaptureOpen(true); setPaletteOpen(false); setError(""); };
    window.addEventListener(DELETE_EVENT, onDeleted);
    window.addEventListener(PALETTE_EVENT, openPalette);
    window.addEventListener(CAPTURE_EVENT, openCapture);
    return () => {
      window.removeEventListener(DELETE_EVENT, onDeleted);
      window.removeEventListener(PALETTE_EVENT, openPalette);
      window.removeEventListener(CAPTURE_EVENT, openCapture);
      window.clearTimeout(noticeTimer.current);
    };
  }, [showNotice]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const shortcut = event.metaKey || event.ctrlKey;
      if (shortcut && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
        setCaptureOpen(false);
        setQuery("");
      } else if (shortcut && event.shiftKey && event.code === "Space") {
        event.preventDefault();
        setCaptureOpen(true);
        setPaletteOpen(false);
      } else if (event.key === "Escape") {
        setPaletteOpen(false);
        setCaptureOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (paletteOpen) window.setTimeout(() => searchRef.current?.focus(), 20);
  }, [paletteOpen]);

  const runAction = (action: LauncherAction) => {
    setPaletteOpen(false);
    if (action.capture) {
      setCaptureOpen(true);
      setError("");
      return;
    }
    if (action.path) navigate(action.path);
  };

  const submitCapture = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      if (captureKind === "task") {
        if (!title.trim()) throw new Error("Write a short priority first.");
        await api.addTask(title.trim(), "Life", description.trim());
        showNotice("Priority captured");
      } else if (captureKind === "activity") {
        const duration = Number(minutes || 0);
        const km = Number(distance || 0);
        if (duration < 0 || duration > 1440 || km < 0) throw new Error("Use a positive duration and distance.");
        await api.logActivity(activityType, km, duration, description.trim());
        showNotice(`${activityType} logged`);
      } else {
        const value = Number(amount);
        if (!Number.isFinite(value) || value <= 0) throw new Error("Enter an expense greater than zero.");
        await api.addTransaction(value, "expense", category, description.trim());
        showNotice("Expense saved");
      }
      announceDataRefresh();
      setCaptureOpen(false);
      setTitle(""); setAmount(""); setMinutes(""); setDistance(""); setDescription("");
    } catch (captureError) {
      setError(captureError instanceof Error ? captureError.message : "Could not save that. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const undoDelete = async () => {
    if (!notice || undoing) return;
    setUndoing(true);
    try {
      await api.restoreDeleted(notice.kind, notice.id);
      announceDataRefresh();
      showNotice(`${notice.label} restored`);
    } catch (restoreError) {
      showNotice(restoreError instanceof Error ? restoreError.message : "Could not restore this item.");
    } finally {
      setUndoing(false);
    }
  };

  const closeDialogs = () => { setPaletteOpen(false); setCaptureOpen(false); };

  return <>
    {paletteOpen && <div className="fixed inset-0 z-[80] flex items-start justify-center bg-[#171421]/45 px-3 pt-[12vh] backdrop-blur-sm md:pt-[16vh]" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialogs(); }}>
      <section role="dialog" aria-modal="true" aria-label="Command palette" className="w-full max-w-xl overflow-hidden rounded-[24px] border border-white/70 bg-white shadow-2xl">
        <div className="flex items-center gap-3 border-b border-[#F0EDF4] px-4 py-4 md:px-5">
          <Search size={19} className="shrink-0 text-[#8A8497]" />
          <input ref={searchRef} value={query} onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }} onKeyDown={(event) => {
            if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex((index) => Math.min(index + 1, filteredActions.length - 1)); }
            if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((index) => Math.max(0, index - 1)); }
            if (event.key === "Enter" && filteredActions[activeIndex]) { event.preventDefault(); runAction(filteredActions[activeIndex]); }
          }} placeholder="Where do you want to go?" aria-label="Search commands and destinations" className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-[#A19BAC]" />
          <kbd className="hidden rounded-md bg-[#F4F1F8] px-2 py-1 text-[10px] text-[#777387] sm:inline">ESC</kbd>
          <button type="button" onClick={closeDialogs} aria-label="Close command palette" className="grid h-9 w-9 place-items-center rounded-full text-[#8A8497] hover:bg-[#F4F1F8]"><X size={17} /></button>
        </div>
        <div className="max-h-[56vh] overflow-y-auto p-2" role="listbox" aria-label="Commands">
          {filteredActions.length ? filteredActions.map((action, index) => <button type="button" role="option" aria-selected={index === activeIndex} key={action.title} onMouseEnter={() => setActiveIndex(index)} onClick={() => runAction(action)} className={`flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 text-left transition ${index === activeIndex ? "bg-[#F3EEFF] text-[#392951]" : "text-[#504B5C] hover:bg-[#FAF9FC]"}`}>
            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${action.capture ? "bg-[#7C3AED] text-white" : "bg-white text-[#777387] ring-1 ring-[#EAE6F0]"}`}>{action.capture ? <Plus size={18} /> : <Activity size={17} />}</span>
            <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{action.title}</span><span className="mt-0.5 block truncate text-xs text-[#898596]">{action.detail}</span></span>
            {action.key && <kbd className="rounded-md bg-white px-2 py-1 text-[10px] text-[#777387] shadow-sm">{action.key}</kbd>}
          </button>) : <p className="px-4 py-8 text-center text-sm text-[#898596]">No matches. Try a page name or “capture”.</p>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#F0EDF4] px-4 py-3 text-[11px] text-[#898596]">
          <span>{privacyMode === "local-only" ? <><Sparkles size={12} className="mr-1 inline text-[#138A72]" />AI set to local-only</> : privacyMode === "cloud-fallback" ? "Cloud AI fallback is enabled" : "Private daily workspace"}</span>
          <span><kbd>↑</kbd> <kbd>↓</kbd> move <kbd className="ml-2">↵</kbd> open</span>
        </div>
      </section>
    </div>}

    {captureOpen && <div className="fixed inset-0 z-[80] flex items-end justify-center bg-[#171421]/45 p-0 backdrop-blur-sm md:items-center md:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialogs(); }}>
      <form role="dialog" aria-modal="true" aria-labelledby="capture-title" onSubmit={submitCapture} className="w-full max-w-lg rounded-t-[28px] bg-white p-5 pb-safe shadow-2xl md:rounded-[28px] md:p-6">
        <div className="mb-5 flex items-center justify-between"><div><h2 id="capture-title" className="text-lg font-semibold text-[#242132]">Catch it while it’s fresh</h2><p className="mt-1 text-sm text-[#858092]">One small capture, ready for later.</p></div><button type="button" onClick={closeDialogs} aria-label="Close quick capture" className="grid h-9 w-9 place-items-center rounded-full text-[#777387] hover:bg-[#F4F2F7]"><X size={18} /></button></div>
        <label htmlFor="capture-kind" className="mb-1.5 block text-xs font-semibold text-[#625D70]">Capture type</label>
        <select id="capture-kind" value={captureKind} onChange={(event) => setCaptureKind(event.target.value as CaptureKind)} className="mb-4 min-h-12 w-full rounded-xl border border-[#E9E6EF] bg-white px-4 text-sm font-medium text-[#302C3D] outline-none focus:border-[#9A75E8] focus:ring-2 focus:ring-[#7C3AED]/15"><option value="task">Priority</option><option value="activity">Activity</option><option value="expense">Expense</option></select>
        {captureKind === "task" && <><label htmlFor="capture-title-field" className="mb-1.5 block text-xs font-semibold text-[#625D70]">What needs your attention?</label><input id="capture-title-field" autoFocus maxLength={500} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Write one clear next step" className="mb-3 min-h-12 w-full rounded-xl border border-[#E9E6EF] bg-[#FAF9FC] px-4 text-sm outline-none focus:border-[#9A75E8]" /></>}
        {captureKind === "activity" && <div className="mb-3 grid grid-cols-2 gap-2">
          <label className="col-span-2 text-xs font-semibold text-[#625D70]">What did you do?<select value={activityType} onChange={(event) => setActivityType(event.target.value as ActivityType)} className="mt-1.5 min-h-12 w-full rounded-xl border border-[#E9E6EF] bg-white px-3 text-sm"><option>Gym</option><option>Run</option><option>Study</option></select></label>
          <label className="text-xs font-semibold text-[#625D70]">Minutes<input type="number" min="0" max="1440" value={minutes} onChange={(event) => setMinutes(event.target.value)} className="mt-1.5 min-h-12 w-full rounded-xl border border-[#E9E6EF] px-3 text-sm" /></label>
          {activityType === "Run" && <label className="text-xs font-semibold text-[#625D70]">Kilometres<input type="number" min="0" step="0.1" value={distance} onChange={(event) => setDistance(event.target.value)} className="mt-1.5 min-h-12 w-full rounded-xl border border-[#E9E6EF] px-3 text-sm" /></label>}
        </div>}
        {captureKind === "expense" && <div className="mb-3 grid grid-cols-2 gap-2">
          <label className="text-xs font-semibold text-[#625D70]">Amount · TND<input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} className="mt-1.5 min-h-12 w-full rounded-xl border border-[#E9E6EF] px-3 text-sm" /></label>
          <label className="text-xs font-semibold text-[#625D70]">Category<select value={category} onChange={(event) => setCategory(event.target.value)} className="mt-1.5 min-h-12 w-full rounded-xl border border-[#E9E6EF] bg-white px-3 text-sm"><option>Food</option><option>Transport</option><option>Study</option><option>Date Night</option><option>Other</option></select></label>
        </div>}
        {captureKind !== "expense" && <><label htmlFor="capture-description" className="mb-1.5 block text-xs font-semibold text-[#625D70]">A note, if useful</label><textarea id="capture-description" rows={2} maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Add a little context" className="mb-3 w-full resize-none rounded-xl border border-[#E9E6EF] px-4 py-3 text-sm outline-none focus:border-[#9A75E8]" /></>}
        {error && <p role="alert" className="mb-3 rounded-xl bg-[#FFF4F2] px-3 py-2 text-sm text-[#8B3535]">{error}</p>}
        <button type="submit" disabled={saving} className="min-h-12 w-full rounded-xl bg-[#7C3AED] text-sm font-semibold text-white transition hover:bg-[#6C2FD2] disabled:opacity-60">{saving ? "Saving…" : "Save capture"}</button>
      </form>
    </div>}

    {noticeText && <div aria-live="polite" className="fixed bottom-[calc(6.1rem+env(safe-area-inset-bottom))] left-4 right-4 z-[90] mx-auto flex max-w-lg items-center justify-between gap-3 rounded-2xl bg-[#242132] px-4 py-3 text-sm text-white shadow-xl md:bottom-6">
      <span className="truncate">{noticeText}</span>{notice && <button type="button" onClick={() => void undoDelete()} disabled={undoing} className="shrink-0 rounded-lg bg-white/15 px-3 py-2 font-semibold text-white transition hover:bg-white/25 disabled:opacity-60">{undoing ? "Restoring…" : "Undo"}</button>}
    </div>}
  </>;
}
