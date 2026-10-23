import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Activity, Check, CheckSquare, Edit2, Heart, LoaderCircle, Moon,
  Plane, Plus, RefreshCw, Sparkles, Square, Trash2, Wallet, X,
} from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api } from "../lib/api";
import { monthKey } from "../lib/month";
import { announceDeletedItem, REFRESH_EVENT } from "../lib/uiEvents";
import type { ActivityLog, FinanceBreakdownItem, FinanceSummary, SleepLog, Task, Transaction, TripPlanResponse } from "../lib/contracts";

const COLORS = ["#7C3AED", "#138A72", "#E19A45", "#6376D8", "#D77691"];
const emptyFinance: FinanceSummary = { monthly_balance: 0, expenses: 0, remaining: 0 };

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Try again.";
}

function standupLines(value: string) {
  return value.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
    const bullet = /^[-*•]\s+/.test(line);
    const content = line.replace(/^[-*•]\s+/, "").replace(/\*\*/g, "");
    return { bullet, content };
  });
}

function currentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function taskMonth(task: Task) {
  return monthKey(task.target_month) || monthKey(task.created_at) || currentMonthValue();
}

function formatMonth(month: string) {
  const [year, value] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(new Date(year, value - 1, 1));
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [standup, setStandup] = useState("");
  const [finance, setFinance] = useState(emptyFinance);
  const [breakdown, setBreakdown] = useState<FinanceBreakdownItem[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [sleep, setSleep] = useState<SleepLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pageError, setPageError] = useState("");
  const [actionError, setActionError] = useState("");
  const [balanceInput, setBalanceInput] = useState("");
  const [newTask, setNewTask] = useState("");
  const [newTaskMonth, setNewTaskMonth] = useState(currentMonthValue);
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [destination, setDestination] = useState("Bizerte");
  const [trip, setTrip] = useState("");
  const [tripEstimate, setTripEstimate] = useState<TripPlanResponse | null>(null);
  const [showTrip, setShowTrip] = useState(false);
  const [tripLoading, setTripLoading] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editText, setEditText] = useState("");
  const [editCategory, setEditCategory] = useState("Study");
  const [editDescription, setEditDescription] = useState("");
  const [editMonth, setEditMonth] = useState(currentMonthValue);

  const loadData = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setPageError("");

    const results = await Promise.allSettled([
      api.getStandup(), api.getFinance(), api.getFinanceBreakdown(),
      api.getTransactions(), api.getTasks(), api.getRecentActivities(), api.getSleep(),
    ]);
    const [briefing, financeResult, breakdownResult, transactionsResult, tasksResult, activitiesResult, sleepResult] = results;

    if (briefing.status === "fulfilled") setStandup(briefing.value.standup || "Your check-in is ready.");
    else setStandup(`AI check-in unavailable: ${errorMessage(briefing.reason)} Your logs are still saved.`);
    if (financeResult.status === "fulfilled") setFinance(financeResult.value);
    if (breakdownResult.status === "fulfilled") setBreakdown(Array.isArray(breakdownResult.value) ? breakdownResult.value : []);
    if (transactionsResult.status === "fulfilled") setTransactions(Array.isArray(transactionsResult.value) ? transactionsResult.value : []);
    if (tasksResult.status === "fulfilled") setTasks(Array.isArray(tasksResult.value) ? tasksResult.value : []);
    if (activitiesResult.status === "fulfilled") setActivities(Array.isArray(activitiesResult.value) ? activitiesResult.value : []);
    if (sleepResult.status === "fulfilled") setSleep(sleepResult.value?.hours == null ? null : sleepResult.value);

    const hasCoreData = financeResult.status === "fulfilled" || tasksResult.status === "fulfilled";
    if (!hasCoreData) setPageError("LiveYours couldn’t load your dashboard. Check your connection and try again.");
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { void Promise.resolve().then(() => loadData()); }, [loadData]);
  useEffect(() => {
    const refresh = () => { void loadData(true); };
    window.addEventListener(REFRESH_EVENT, refresh);
    return () => window.removeEventListener(REFRESH_EVENT, refresh);
  }, [loadData]);

  const pendingTasks = useMemo(() => tasks.filter((task) => !task.done), [tasks]);
  const monthlyObjectives = useMemo(() => {
    const groups = new Map<string, Task[]>();
    pendingTasks.forEach((task) => {
      const month = taskMonth(task);
      groups.set(month, [...(groups.get(month) || []), task]);
    });
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [pendingTasks]);
  const completedTasks = useMemo(() => tasks.filter((task) => task.done), [tasks]);
  const todayActivities = useMemo(() => {
    const today = new Date().toDateString();
    return activities.filter((item) => item.created_at && new Date(item.created_at).toDateString() === today);
  }, [activities]);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  }, []);
  const dateLabel = new Intl.DateTimeFormat("en-GB", { weekday: "long", month: "long", day: "numeric" }).format(new Date());
  const budgetProgress = finance.monthly_balance > 0
    ? Math.min(100, Math.max(0, (finance.expenses / finance.monthly_balance) * 100))
    : 0;

  const addTask = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newTask.trim() || isAddingTask) return;
    setActionError("");
    setIsAddingTask(true);
    try {
      await api.addTask(newTask.trim(), "Study", "", newTaskMonth);
      setNewTask("");
      await loadData(true);
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setIsAddingTask(false);
    }
  };

  const toggleTask = async (id: number) => {
    const before = tasks;
    setTasks((current) => current.map((task) => task.id === id ? { ...task, done: !task.done } : task));
    try {
      await api.toggleTask(id);
      setActionError("");
    } catch (error) {
      setTasks(before);
      setActionError(errorMessage(error));
    }
  };

  const deleteTask = async (id: number) => {
    const task = tasks.find((item) => item.id === id);
    try {
      await api.deleteTask(id);
      setTasks((current) => current.filter((task) => task.id !== id));
      if (task) announceDeletedItem({ kind: "task", id, label: task.text });
    } catch (error) {
      setActionError(errorMessage(error));
    }
  };

  const deleteTransaction = async (id: number) => {
    const transaction = transactions.find((item) => item.id === id);
    try {
      await api.deleteTransaction(id);
      setTransactions((current) => current.filter((item) => item.id !== id));
      if (transaction) announceDeletedItem({ kind: "transaction", id, label: `${transaction.category || "Expense"} expense` });
      void loadData(true);
    } catch (error) {
      setActionError(errorMessage(error));
    }
  };

  const openEdit = (task: Task) => {
    setEditingTask(task);
    setEditText(task.text);
    setEditCategory(task.category || "Study");
    setEditDescription(task.description || "");
    setEditMonth(taskMonth(task));
  };

  const getTaskHelp = (task: Task) => {
    const prompt = [
      "Help me make progress on this priority. Break it into 3–5 concrete steps, then identify the smallest first step I can finish in 15 minutes. Ask one clarifying question if needed.",
      `Priority: ${task.text}`,
      task.description ? `Context: ${task.description}` : "",
    ].filter(Boolean).join("\n");
    const mode = task.category === "Study" ? "study" : task.category === "Project" ? "projects" : "quick";
    navigate("/chat", { state: { draftPrompt: prompt, draftMode: mode } });
  };

  const saveTaskEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingTask || !editText.trim()) return;
    try {
      await api.updateTask(editingTask.id, editText.trim(), editCategory, editDescription.trim(), editMonth);
      setEditingTask(null);
      await loadData(true);
    } catch (error) {
      setActionError(errorMessage(error));
    }
  };

  const setBudget = async (event: React.FormEvent) => {
    event.preventDefault();
    const amount = Number(balanceInput);
    if (!Number.isFinite(amount) || amount < 0) return;
    try {
      await api.setBalance(amount);
      setBalanceInput("");
      await loadData(true);
    } catch (error) {
      setActionError(errorMessage(error));
    }
  };

  const planTrip = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!destination.trim()) return;
    setShowTrip(true);
    setTripLoading(true);
    setTrip("");
    setTripEstimate(null);
    try {
      const result = await api.planTrip(destination.trim(), 100);
      setTrip(result.trip_plan || "No itinerary came back. Try another destination.");
      setTripEstimate(result);
    } catch (error) {
      setTrip(errorMessage(error));
    } finally {
      setTripLoading(false);
    }
  };

  const formatMoney = (value: number) => `${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} TND`;

  return (
    <div className="dashboard-page mx-auto max-w-7xl space-y-5 px-4 pb-8 pt-5 md:space-y-7 md:px-10 md:pt-9">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-[#777387]">{dateLabel}</p>
          <h1 className="mt-1 text-[28px] font-semibold leading-tight tracking-[-0.04em] text-[#242132] md:text-4xl">{greeting}.</h1>
          <p className="mt-2 text-sm text-[#777387]">
            {pendingTasks.length ? `${pendingTasks.length} open ${pendingTasks.length === 1 ? "priority" : "priorities"} to move forward.` : "A clear page. Choose what deserves your attention."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadData(true)}
          disabled={refreshing}
          aria-label="Refresh dashboard"
          className="mt-1 grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#E8E5EF] bg-white text-[#625D70] transition hover:border-[#CBB8F8] hover:text-[#7C3AED] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED] disabled:opacity-60"
        >
          <RefreshCw size={17} className={refreshing ? "animate-spin" : ""} />
        </button>
      </header>

      <section aria-label="Daily check-in" className="relative overflow-hidden rounded-[28px] bg-[#242132] p-5 text-white md:p-7">
        <div className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full border border-white/10" />
        <div className="pointer-events-none absolute -right-2 -top-8 h-40 w-40 rounded-full border border-white/10" />
        <div className="relative max-w-3xl">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-[#D7C7FF]"><Sparkles size={16} /> Your daily read</div>
          {loading ? (
            <div className="h-20 animate-pulse rounded-2xl bg-white/10" aria-label="Loading daily check-in" />
          ) : (
            <ul className="space-y-2 text-[15px] leading-7 text-white/90 md:text-base">
              {(standupLines(standup || "Your daily check-in is ready when you are.")).map((line, index) => (
                <li key={index} className={line.bullet ? "flex gap-2" : ""}>
                  {line.bullet && <span aria-hidden="true" className="mt-0.5 text-[#C5A8FF]">•</span>}
                  <span>{line.content}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-5 flex flex-wrap gap-2">
            <Link to="/chat" className="inline-flex min-h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-[#34224E] transition hover:bg-[#F0E9FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
              <Heart size={15} /> Talk it through
            </Link>
            <Link to="/log" className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/25 px-4 text-sm font-semibold text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
              <Activity size={15} /> Log a moment
            </Link>
          </div>
        </div>
      </section>

      {pageError && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#F2C7C7] bg-[#FFF4F2] px-4 py-3 text-sm text-[#8B3535]">
          <span>{pageError}</span>
          <button type="button" onClick={() => void loadData(true)} className="font-semibold underline underline-offset-2">Try again</button>
        </div>
      )}
      {actionError && <p role="alert" className="rounded-xl bg-[#FFF4F2] px-4 py-3 text-sm text-[#8B3535]">{actionError}</p>}

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.85fr)] lg:gap-6">
        <section className="rounded-[26px] border border-[#E9E6EF] bg-white p-5 md:p-6" aria-labelledby="priorities-title">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 id="priorities-title" className="text-lg font-semibold tracking-tight text-[#242132]">Monthly objectives</h2>
              <p className="mt-1 text-sm text-[#858092]">Plan by month. Edit or move anything as plans change.</p>
            </div>
            <span className="rounded-full bg-[#F2EDFF] px-3 py-1 text-xs font-semibold text-[#6C3BC1]">{pendingTasks.length} open</span>
          </div>

          <form onSubmit={addTask} className="mb-4 flex flex-col gap-2 sm:flex-row">
            <label className="sr-only" htmlFor="new-task">New objective</label>
            <input id="new-task" value={newTask} onChange={(event) => setNewTask(event.target.value)} placeholder="What do you want to achieve?" className="min-w-0 flex-1 rounded-xl border border-[#E9E6EF] bg-[#FAF9FC] px-4 py-3 text-sm text-[#242132] outline-none transition placeholder:text-[#9B97A7] focus:border-[#9A75E8] focus:ring-2 focus:ring-[#7C3AED]/15" />
            <label className="sr-only" htmlFor="new-objective-month">Objective month</label>
            <input id="new-objective-month" type="month" value={newTaskMonth} onChange={(event) => setNewTaskMonth(event.target.value)} required aria-label="Objective month" className="rounded-xl border border-[#E9E6EF] bg-[#FAF9FC] px-3 py-3 text-sm text-[#514B5E] outline-none focus:border-[#9A75E8] focus:ring-2 focus:ring-[#7C3AED]/15" />
            <button type="submit" disabled={!newTask.trim() || !newTaskMonth || isAddingTask} aria-label="Add objective" className="grid h-11 w-full shrink-0 place-items-center rounded-xl bg-[#7C3AED] text-white transition hover:bg-[#6D28D9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45 sm:w-11">
              {isAddingTask ? <LoaderCircle size={18} className="animate-spin" /> : <Plus size={19} />}
            </button>
          </form>

          {loading ? (
            <div className="space-y-3" aria-label="Loading priorities"><div className="h-14 animate-pulse rounded-xl bg-[#F5F3F8]" /><div className="h-14 animate-pulse rounded-xl bg-[#F5F3F8]" /></div>
          ) : pendingTasks.length ? (
            <div className="space-y-4">
              {monthlyObjectives.map(([month, objectives]) => (
                <section key={month} aria-labelledby={`objectives-${month}`} className="rounded-2xl bg-[#FAF9FC] px-3.5 py-2.5">
                  <div className="flex items-center justify-between gap-3 pb-1 pt-1">
                    <h3 id={`objectives-${month}`} className="text-sm font-semibold text-[#514B5E]">{formatMonth(month)}</h3>
                    <span className="text-xs text-[#898596]">{objectives.length} open</span>
                  </div>
                  <div className="divide-y divide-[#F0EDF4]">
              {objectives.map((task) => (
                <div key={task.id} className="group flex items-center gap-2 py-3 first:pt-2">
                  <button type="button" onClick={() => void toggleTask(task.id)} aria-label={`Complete ${task.text}`} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[#A39EAF] transition hover:bg-[#F3EEFF] hover:text-[#7C3AED] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]">
                    <Square size={19} />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[#302C3D]">{task.text}</p>
                    {task.description && <p className="mt-0.5 truncate text-xs text-[#8A8698]">{task.description}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button type="button" onClick={() => getTaskHelp(task)} aria-label={`Get help with ${task.text}`} className="grid h-9 w-9 place-items-center rounded-full text-[#8A8698] transition hover:bg-[#F3EEFF] hover:text-[#6C3BC1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]"><Sparkles size={15} /></button>
                    <button type="button" onClick={() => openEdit(task)} aria-label={`Edit ${task.text}`} className="grid h-9 w-9 place-items-center rounded-full text-[#8A8698] transition hover:bg-[#F3EEFF] hover:text-[#6C3BC1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]"><Edit2 size={15} /></button>
                    <button type="button" onClick={() => void deleteTask(task.id)} aria-label={`Delete ${task.text}`} className="grid h-9 w-9 place-items-center rounded-full text-[#8A8698] transition hover:bg-[#FFF0EE] hover:text-[#B94A46] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C45A57]"><Trash2 size={15} /></button>
                  </div>
                </div>
              ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl bg-[#F8F6FC] px-4 py-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#393447]"><Check size={16} className="text-[#138A72]" /> Nothing outstanding</div>
              <p className="mt-1.5 text-sm text-[#777387]">Add a priority when something new needs your attention.</p>
            </div>
          )}

          {completedTasks.length > 0 && (
            <Link to="/completed" className="mt-3 inline-flex items-center gap-2 rounded-full py-2 text-sm font-medium text-[#6C3BC1] hover:text-[#4F2D8B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]">
              <CheckSquare size={15} /> {completedTasks.length} completed <span aria-hidden="true">·</span> Review history
            </Link>
          )}
        </section>

        <div className="space-y-5">
          <section aria-labelledby="pulse-title">
            <div className="mb-3 flex items-center justify-between">
              <h2 id="pulse-title" className="text-lg font-semibold tracking-tight text-[#242132]">Today, at a glance</h2>
              <Link to="/analytics" className="text-sm font-medium text-[#6C3BC1] hover:underline">View trends</Link>
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              <div className="rounded-2xl bg-white p-3.5 ring-1 ring-[#E9E6EF]">
                <p className="text-xs font-medium leading-4 text-[#858092]">Priorities</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-[#302C3D]">{loading ? "—" : pendingTasks.length}</p>
                <p className="mt-0.5 text-[11px] text-[#858092]">open</p>
              </div>
              <div className="rounded-2xl bg-white p-3.5 ring-1 ring-[#E9E6EF]">
                <p className="text-xs font-medium leading-4 text-[#858092]">Sleep</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-[#302C3D]">{loading ? "—" : sleep ? `${Number(sleep.hours).toFixed(1)}h` : "—"}</p>
                <p className="mt-0.5 text-[11px] text-[#858092]">{sleep ? `quality ${sleep.quality}/10` : "not logged"}</p>
              </div>
              <div className="rounded-2xl bg-white p-3.5 ring-1 ring-[#E9E6EF]">
                <p className="text-xs font-medium leading-4 text-[#858092]">Movement</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-[#302C3D]">{loading ? "—" : todayActivities.length}</p>
                <p className="mt-0.5 text-[11px] text-[#858092]">{todayActivities.length === 1 ? "log today" : "logs today"}</p>
              </div>
            </div>
          </section>

          <section className="rounded-[26px] border border-[#E9E6EF] bg-white p-5" aria-labelledby="finance-title">
            <div className="flex items-center justify-between gap-3">
              <h2 id="finance-title" className="flex items-center gap-2 text-base font-semibold text-[#302C3D]"><Wallet size={17} className="text-[#138A72]" /> Money this month</h2>
              <span className="text-xs text-[#898596]">30 days</span>
            </div>
            <div className="mt-4 flex items-end justify-between gap-3">
              <div><p className="text-xs text-[#858092]">Available</p><p className="mt-1 text-2xl font-semibold tracking-tight text-[#242132]">{loading ? "—" : formatMoney(finance.remaining)}</p></div>
              <div className="text-right"><p className="text-xs text-[#858092]">Spent</p><p className="mt-1 text-sm font-semibold text-[#514B5E]">{loading ? "—" : formatMoney(finance.expenses)}</p></div>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#F0EDF4]" role="progressbar" aria-label="Monthly budget spent" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(budgetProgress)}>
              <div className="h-full rounded-full bg-[#7C3AED] transition-[width] duration-500" style={{ width: `${budgetProgress}%` }} />
            </div>
            <form onSubmit={setBudget} className="mt-4 flex gap-2">
              <label className="sr-only" htmlFor="monthly-budget">Monthly budget in TND</label>
              <input id="monthly-budget" type="number" min="0" step="1" value={balanceInput} onChange={(event) => setBalanceInput(event.target.value)} placeholder={`Budget · ${formatMoney(finance.monthly_balance)}`} className="min-w-0 flex-1 rounded-xl border border-[#E9E6EF] bg-[#FAF9FC] px-3 py-2.5 text-sm outline-none focus:border-[#9A75E8] focus:ring-2 focus:ring-[#7C3AED]/15" />
              <button type="submit" disabled={!balanceInput} className="rounded-xl bg-[#F2EDFF] px-3.5 text-sm font-semibold text-[#6C3BC1] transition hover:bg-[#E9DFFF] disabled:opacity-45">Set</button>
            </form>
            {transactions.length > 0 && <div className="mt-4 divide-y divide-[#F0EDF4]">
              {transactions.slice(0, 3).map((transaction) => (
                <div key={transaction.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0"><p className="truncate font-medium text-[#393447]">{transaction.category}</p><p className="text-xs text-[#898596]">{transaction.description || "Expense"}</p></div>
                  <div className="flex shrink-0 items-center gap-2"><span className="font-semibold text-[#514B5E]">{formatMoney(transaction.amount)}</span><button type="button" aria-label={`Delete ${transaction.category} transaction`} onClick={() => void deleteTransaction(transaction.id)} className="grid h-8 w-8 place-items-center rounded-full text-[#9691A0] hover:bg-[#FFF0EE] hover:text-[#B94A46] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C45A57]"><Trash2 size={14} /></button></div>
                </div>
              ))}
            </div>}
            {breakdown.length > 0 && (
              <div className="mt-3 flex items-center gap-3 border-t border-[#F0EDF4] pt-3">
                <div className="h-20 w-20 shrink-0"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={breakdown} dataKey="value" nameKey="category" innerRadius={22} outerRadius={36} paddingAngle={3}>{breakdown.map((item, index) => <Cell key={item.category || index} fill={COLORS[index % COLORS.length]} />)}</Pie><Tooltip formatter={(value) => `${value} TND`} /></PieChart></ResponsiveContainer></div>
                <div className="min-w-0 space-y-1.5">{breakdown.slice(0, 3).map((item, index) => <p key={item.category} className="flex items-center gap-2 truncate text-xs text-[#6E697B]"><span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />{item.category}<span className="ml-auto pl-2 font-medium text-[#393447]">{formatMoney(item.value)}</span></p>)}</div>
              </div>
            )}
          </section>
        </div>
      </div>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2" aria-label="Quick plans">
        <form onSubmit={planTrip} className="flex items-center gap-3 rounded-[22px] border border-[#E9E6EF] bg-white p-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#F4EFFD] text-[#7C3AED]"><Plane size={19} /></span>
          <label className="sr-only" htmlFor="trip-destination">Trip destination</label>
          <input id="trip-destination" value={destination} onChange={(event) => setDestination(event.target.value)} placeholder="Where to?" className="min-w-0 flex-1 bg-transparent text-sm font-medium text-[#302C3D] outline-none placeholder:text-[#9B97A7]" />
          <button type="submit" disabled={tripLoading || !destination.trim()} className="rounded-full px-3 py-2 text-sm font-semibold text-[#6C3BC1] hover:bg-[#F4EFFD] disabled:opacity-50">Plan</button>
        </form>
        <Link to="/chat" className="flex items-center gap-3 rounded-[22px] border border-[#E9E6EF] bg-white p-4 transition hover:border-[#D0C1EC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#EEF7F3] text-[#138A72]"><Moon size={19} /></span>
          <span className="min-w-0"><span className="block text-sm font-semibold text-[#302C3D]">Check in with yourself</span><span className="mt-0.5 block text-xs text-[#858092]">Talk through sleep, stress, or momentum.</span></span>
          <Heart size={17} className="ml-auto shrink-0 text-[#138A72]" />
        </Link>
      </section>

      {editingTask && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-[#171421]/45 p-0 backdrop-blur-sm md:items-center md:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditingTask(null); }}>
          <form onSubmit={saveTaskEdit} className="w-full max-w-lg rounded-t-[28px] bg-white p-5 pb-safe shadow-2xl md:rounded-[28px] md:p-6">
            <div className="mb-5 flex items-center justify-between"><h2 className="text-lg font-semibold text-[#242132]">Edit objective</h2><button type="button" onClick={() => setEditingTask(null)} aria-label="Close edit dialog" className="grid h-9 w-9 place-items-center rounded-full text-[#777387] hover:bg-[#F4F2F7]"><X size={19} /></button></div>
            <div className="space-y-3">
              <label className="sr-only" htmlFor="edit-task-title">Objective</label><input id="edit-task-title" autoFocus value={editText} onChange={(event) => setEditText(event.target.value)} className="w-full rounded-xl border border-[#E9E6EF] px-4 py-3 text-sm outline-none focus:border-[#9A75E8] focus:ring-2 focus:ring-[#7C3AED]/15" />
              <label className="sr-only" htmlFor="edit-task-category">Category</label><select id="edit-task-category" value={editCategory} onChange={(event) => setEditCategory(event.target.value)} className="w-full rounded-xl border border-[#E9E6EF] bg-white px-4 py-3 text-sm outline-none focus:border-[#9A75E8]"><option>Study</option><option>Project</option><option>Gym</option><option>Life</option></select>
              <label className="sr-only" htmlFor="edit-objective-month">Objective month</label><input id="edit-objective-month" type="month" value={editMonth} onChange={(event) => setEditMonth(event.target.value)} required className="w-full rounded-xl border border-[#E9E6EF] bg-white px-4 py-3 text-sm outline-none focus:border-[#9A75E8]" />
              <label className="sr-only" htmlFor="edit-task-context">Context</label><textarea id="edit-task-context" value={editDescription} onChange={(event) => setEditDescription(event.target.value)} placeholder="Add context that will help you start" rows={3} className="w-full resize-none rounded-xl border border-[#E9E6EF] px-4 py-3 text-sm outline-none focus:border-[#9A75E8]" />
              <button type="submit" disabled={!editText.trim() || !editMonth} className="w-full rounded-xl bg-[#7C3AED] py-3 text-sm font-semibold text-white hover:bg-[#6D28D9] disabled:opacity-50">Save objective</button>
            </div>
          </form>
        </div>
      )}

      {showTrip && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-[#171421]/45 p-0 backdrop-blur-sm md:items-center md:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowTrip(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="trip-title" className="max-h-[min(85dvh,48rem)] w-full max-w-2xl overflow-y-auto overscroll-contain rounded-t-[28px] bg-white p-5 pb-safe shadow-2xl md:rounded-[28px] md:p-7">
            <div className="mb-4 flex items-center justify-between"><div className="flex items-center gap-2"><Plane size={18} className="text-[#7C3AED]" /><h2 id="trip-title" className="font-semibold text-[#242132]">Trip to {destination}</h2></div><button type="button" onClick={() => setShowTrip(false)} aria-label="Close trip plan" className="grid h-9 w-9 place-items-center rounded-full text-[#777387] hover:bg-[#F4F2F7]"><X size={19} /></button></div>
            {tripLoading ? <div className="flex items-center gap-2 py-8 text-sm text-[#777387]"><LoaderCircle size={17} className="animate-spin" /> Working out a route and budget…</div> : <>
              {tripEstimate && <div className="mb-4 grid grid-cols-3 gap-2 rounded-2xl bg-[#F6F3FA] p-3 text-center"><div><p className="text-[10px] font-medium text-[#858092]">Round trip</p><p className="mt-1 text-sm font-semibold text-[#302C3D]">{tripEstimate.distance_km} km</p></div><div><p className="text-[10px] font-medium text-[#858092]">Fuel</p><p className="mt-1 text-sm font-semibold text-[#302C3D]">{tripEstimate.fuel_liters} L</p></div><div><p className="text-[10px] font-medium text-[#858092]">Fuel cost</p><p className="mt-1 text-sm font-semibold text-[#302C3D]">{formatMoney(tripEstimate.fuel_cost_tnd)}</p></div></div>}
              {tripEstimate?.notice && <p role="status" className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">{tripEstimate.notice}</p>}
              <div className="min-w-0 break-words text-sm leading-6 text-[#514B5E] [&_h1]:mb-2 [&_h1]:mt-4 [&_h1]:text-lg [&_h1]:font-bold [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-bold [&_h3]:mb-1.5 [&_h3]:mt-3 [&_h3]:font-semibold [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5 [&_li]:pl-0.5 [&_strong]:font-semibold [&_hr]:my-3 [&_hr]:border-[#EAE6F0] [&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-violet-300 [&_blockquote]:pl-3 [&_blockquote]:text-[#777387] [&_table]:w-full [&_th]:border-b [&_th]:border-[#EAE6F0] [&_th]:px-2 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_td]:border-b [&_td]:border-[#F1EEF5] [&_td]:px-2 [&_td]:py-2">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                  table: ({ children }) => <div className="my-3 max-w-full overflow-x-auto rounded-xl border border-[#EAE6F0]"><table className="min-w-[28rem] text-xs leading-5">{children}</table></div>,
                }}>{trip}</ReactMarkdown>
              </div>
              <p className="mt-4 text-xs text-[#898596]">Route and fuel figures are estimates. Configure your home city and fuel price to personalize them.</p>
            </>}
          </section>
        </div>
      )}
    </div>
  );
}
