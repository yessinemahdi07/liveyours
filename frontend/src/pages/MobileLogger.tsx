import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { Dumbbell, Footprints, BookOpen, Moon, Wallet, Trash2, Smartphone } from "lucide-react";
import { announceDeletedItem, REFRESH_EVENT } from "../lib/uiEvents";
import type { ActivityLog, ActivityType } from "../lib/contracts";

type LoggerTab = ActivityType | "Sleep" | "Finance";

export default function MobileLogger() {
  const [activeTab, setActiveTab] = useState<LoggerTab>(() => new URLSearchParams(window.location.search).get("capture") === "screen-time" ? "Screen Time" : "Gym");
  const [hrs, setHrs] = useState(""); const [mins, setMins] = useState("");
  const [km, setKm] = useState(""); const [desc, setDesc] = useState("");
  const [sleepHrs, setSleepHrs] = useState(""); const [sleepQual, setSleepQual] = useState("5");
  const [amount, setAmount] = useState(""); const [category, setCategory] = useState("Food");

  const [recentActs, setRecentActs] = useState<ActivityLog[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadActs = () => api.getRecentActivities().then(data => setRecentActs(Array.isArray(data) ? data : [])).catch(() => {});
  useEffect(() => { loadActs(); }, []);
  useEffect(() => {
    const refresh = () => { void loadActs(); };
    window.addEventListener(REFRESH_EVENT, refresh);
    return () => window.removeEventListener(REFRESH_EVENT, refresh);
  }, []);

  const handleLog = async () => {
    if (saving) return;
    setSaving(true); setError("");
    try {
      if (activeTab === "Sleep") {
        const hours = Number(sleepHrs);
        const quality = Number(sleepQual);
        if (!(hours > 0 && hours <= 24) || !(quality >= 1 && quality <= 10)) throw new Error("Enter sleep between 0 and 24 hours and quality from 1 to 10.");
        await api.logSleep(hours, quality);
      } else if (activeTab === "Finance") {
        const value = Number(amount);
        if (!(value > 0)) throw new Error("Enter an expense greater than zero.");
        await api.addTransaction(value, "expense", category, desc);
      } else {
        const totalMins = (Number(hrs) || 0) * 60 + (Number(mins) || 0);
        const runKm = Number(km) || 0;
        if (!(totalMins > 0 && totalMins <= 1440) || (activeTab === "Run" && !(runKm > 0))) throw new Error("Add a duration, and add distance for a run.");
        await api.logActivity(activeTab, runKm, totalMins, desc);
      }
      setHrs(""); setMins(""); setKm(""); setDesc(""); setSleepHrs(""); setAmount("");
      await loadActs();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save this log.");
    } finally {
      setSaving(false);
    }
  };

  const deleteAct = async (id: number) => {
    const activity = recentActs.find((item) => item.id === id);
    try {
      await api.deleteActivity(id);
      setRecentActs((current) => current.filter((item) => item.id !== id));
      if (activity) announceDeletedItem({ kind: "activity", id, label: `${activity.type} log` });
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete this log.");
    }
  };

  const tabs: { id: LoggerTab; icon: React.ReactNode }[] = [
    { id: "Gym", icon: <Dumbbell size={18}/> }, { id: "Run", icon: <Footprints size={18}/> },
    { id: "Study", icon: <BookOpen size={18}/> }, { id: "Sleep", icon: <Moon size={18}/> }, { id: "Finance", icon: <Wallet size={18}/> },
    { id: "Screen Time", icon: <Smartphone size={18}/> },
  ];

  return (
    <div className="p-4 max-w-md mx-auto space-y-4 pb-6 animate-in">
      <h1 className="text-2xl font-black tracking-tight pt-2">Log Activity</h1>

      <div className="flex bg-[#E3E3E8] p-1 rounded-2xl gap-0.5 overflow-x-auto">
        {tabs.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex-1 min-w-[60px] flex flex-col items-center justify-center py-2 rounded-xl transition-all ${activeTab === tab.id ? "bg-white text-[#7C3AED] shadow-sm" : "text-gray-500"}`}>
            {tab.icon}<span className="text-[10px] font-bold mt-0.5">{tab.id}</span>
          </button>
        ))}
      </div>

      <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
        {activeTab === 'Run' && <input type="number" placeholder="Distance (KM)" value={km} onChange={e=>setKm(e.target.value)} className="w-full bg-gray-50 border p-4 rounded-2xl text-lg font-bold outline-none mb-4 focus:border-[#7C3AED]" />}

        {activeTab === 'Finance' && (
          <div className="space-y-3 mb-4">
            <input type="number" placeholder="Amount Spent (TND)" value={amount} onChange={e=>setAmount(e.target.value)} className="w-full bg-red-50 border p-4 rounded-2xl text-lg font-bold text-red-600 outline-none focus:border-red-400" />
            <select value={category} onChange={e=>setCategory(e.target.value)} className="w-full bg-gray-50 border p-4 rounded-2xl outline-none focus:border-[#7C3AED]">
              <option>Food</option><option>Date Night</option><option>Transport</option><option>Study</option><option>Other</option>
            </select>
          </div>
        )}

        {activeTab === 'Sleep' && (
          <div className="space-y-4 mb-4">
            <input type="number" placeholder="Hours Slept" value={sleepHrs} onChange={e=>setSleepHrs(e.target.value)} className="w-full bg-gray-50 border p-4 rounded-2xl text-lg font-bold outline-none focus:border-[#7C3AED]" />
            <div>
              {/* SLEEP QUALITY 1-10 */}
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Quality: {sleepQual}/10</label>
              <input type="range" min="1" max="10" value={sleepQual} onChange={e=>setSleepQual(e.target.value)} className="w-full accent-[#7C3AED]" />
            </div>
          </div>
        )}

        {(activeTab === 'Gym' || activeTab === 'Study' || activeTab === 'Run' || activeTab === 'Screen Time') && (
          <div className="flex gap-3 mb-4">
            <input type="number" placeholder="Hours" value={hrs} onChange={e=>setHrs(e.target.value)} className="w-1/2 bg-gray-50 border p-4 rounded-2xl text-lg font-bold text-center outline-none focus:border-[#7C3AED]" />
            <input type="number" placeholder="Mins" value={mins} onChange={e=>setMins(e.target.value)} className="w-1/2 bg-gray-50 border p-4 rounded-2xl text-lg font-bold text-center outline-none focus:border-[#7C3AED]" />
          </div>
        )}

        {activeTab === "Screen Time" && <p className="-mt-2 mb-4 text-xs leading-5 text-gray-500">Enter today’s total from iPhone Settings → Screen Time. iOS does not let a website or Shortcut read this total automatically.</p>}

        <textarea placeholder="Notes (optional)..." value={desc} onChange={e=>setDesc(e.target.value)} rows={2} className="w-full bg-gray-50 border p-4 rounded-2xl mb-4 outline-none focus:border-[#7C3AED] resize-none" />

        {error && <p role="alert" className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button onClick={() => void handleLog()} disabled={saving} className="w-full min-h-12 bg-[#7C3AED] text-white font-bold py-3 rounded-2xl shadow-lg shadow-violet-500/30 disabled:opacity-60">{saving ? "Saving…" : `Save ${activeTab}`}</button>
      </div>

      <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
        <h3 className="text-xs font-bold text-gray-400 uppercase mb-3">Recent Logs</h3>
        <div className="space-y-2">
          {recentActs.length === 0 ? <p className="text-xs text-gray-400">No recent logs.</p> : recentActs.map(act => (
            <div key={act.id} className="flex justify-between items-center bg-gray-50 p-3 rounded-xl">
              <div>
                <span className="font-bold text-sm">{act.type}</span>
                <span className="text-xs text-gray-500 ml-2">{act.duration_minutes} mins</span>
              </div>
              <button aria-label={`Delete ${act.type} log`} onClick={() => void deleteAct(act.id)} className="text-gray-400 hover:text-red-500"><Trash2 size={16}/></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
