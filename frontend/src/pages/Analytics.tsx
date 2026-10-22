import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, ArrowDownRight, ArrowUpRight, Clock3, Wallet } from "lucide-react";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { api } from "../lib/api";
import { REFRESH_EVENT } from "../lib/uiEvents";
import type { AnalyticsResponse, FinanceSummary } from "../lib/contracts";

type Period = "week" | "month";
const EMPTY: AnalyticsResponse = {
  series: [],
  summary: { total_hours: 0, previous_total_hours: 0, change_hours: 0, change_percent: null, hours_by_activity: { Gym: 0, Study: 0, Run: 0 } },
};
const MIX = [
  { key: "Study" as const, label: "Study", color: "#9B7CFF" },
  { key: "Gym" as const, label: "Gym", color: "#35D49A" },
  { key: "Run" as const, label: "Run", color: "#62B8FF" },
];
const money = (amount: number) => `${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })} TND`;

export default function Analytics() {
  const [period, setPeriod] = useState<Period>("week");
  const [analytics, setAnalytics] = useState<AnalyticsResponse>(EMPTY);
  const [finance, setFinance] = useState<FinanceSummary | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [nextAnalytics, nextFinance] = await Promise.all([api.getAnalytics(period), api.getFinance()]);
      setAnalytics(nextAnalytics);
      setFinance(nextFinance);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load your analytics.");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { void Promise.resolve().then(() => refresh()); }, [refresh]);
  useEffect(() => {
    window.addEventListener(REFRESH_EVENT, refresh);
    return () => window.removeEventListener(REFRESH_EVENT, refresh);
  }, [refresh]);

  const series = useMemo(() => {
    return analytics.series.reduce<{ date: string; Gym: number; Study: number; Run: number; invested: number }[]>((rows, row) => {
      const previous = rows.length ? rows[rows.length - 1].invested : 0;
      rows.push({ ...row, invested: Number((previous + row.Gym + row.Study + row.Run).toFixed(1)) });
      return rows;
    }, []);
  }, [analytics.series]);
  const summary = analytics.summary;
  const positive = summary.change_hours >= 0;
  const hasPrevious = summary.previous_total_hours > 0;
  const deltaLabel = hasPrevious
    ? `${positive ? "+" : ""}${summary.change_percent ?? 0}% vs prior ${period}`
    : "Building your baseline";

  return (
    <div className="min-h-full bg-[#F6F4FA] px-4 pb-8 pt-5 text-[#211B2B] sm:px-6 md:px-10 md:pt-9">
      <div className="mx-auto max-w-6xl space-y-5 md:space-y-7">
        <header className="flex items-start justify-between gap-3">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-[#81788D]"><span className="h-2 w-2 rounded-full bg-[#7C3AED] shadow-[0_0_12px_#7C3AED66]" />Personal performance</div>
            <h1 className="text-[27px] font-semibold tracking-[-0.05em] sm:text-4xl">Your time, compounded.</h1>
            <p className="mt-1.5 text-sm text-[#817B8B]">A clear view of where your energy is going.</p>
          </div>
          <div className="flex shrink-0 rounded-xl border border-[#E7E1EF] bg-white p-1 shadow-sm" role="group" aria-label="Analytics period">
            {(["week", "month"] as const).map((value) => <button key={value} type="button" onClick={() => { setLoading(true); setPeriod(value); }} aria-pressed={period === value} className={`min-h-10 rounded-lg px-3 text-xs font-semibold capitalize transition-colors sm:px-4 ${period === value ? "bg-[#7C3AED] text-white shadow-sm" : "text-[#777080] hover:bg-[#F5F0FF] hover:text-[#6C32D5]"}`}>{value === "week" ? "1W" : "1M"}</button>)}
          </div>
        </header>

        {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        <section className="overflow-hidden rounded-[26px] border border-[#E8E3EE] bg-white shadow-[0_18px_55px_rgba(42,25,77,0.07)]" aria-label="Time invested performance">
          <div className="flex flex-wrap items-end justify-between gap-4 px-5 pt-5 sm:px-7 sm:pt-7">
            <div>
              <p className="text-xs font-medium text-[#817B8B]">Hours invested this {period}</p>
              <div className="mt-1 flex items-baseline gap-2.5">
                <span className="text-[42px] font-semibold leading-none tracking-[-0.065em] tabular-nums sm:text-6xl">{summary.total_hours.toFixed(1)}</span>
                <span className="text-sm font-medium text-[#817B8B]">hours</span>
              </div>
              <div className={`mt-2 inline-flex items-center gap-1 text-xs font-semibold ${hasPrevious ? positive ? "text-[#00C805]" : "text-[#FF6B6B]" : "text-[#9BA59F]"}`}>
                {hasPrevious && (positive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />)}
                {hasPrevious ? `${summary.change_hours > 0 ? "+" : ""}${summary.change_hours.toFixed(1)}h · ` : ""}{deltaLabel}
              </div>
            </div>
            <div className="pb-1 text-right text-[11px] leading-5 text-[#8A8492]">Tracked time<br />not a productivity score</div>
          </div>

          <div className="mt-1 h-[230px] w-full px-1 pb-2 sm:h-[320px] sm:px-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 20, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="investedFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#7C3AED" stopOpacity={0.23} /><stop offset="95%" stopColor="#7C3AED" stopOpacity={0.015} /></linearGradient>
                  <filter id="lineGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
                </defs>
                <CartesianGrid vertical={false} stroke="#E9E5EE" strokeDasharray="3 6" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} minTickGap={period === "week" ? 12 : 35} tick={{ fill: "#8C8694", fontSize: 10 }} tickMargin={11} />
                <YAxis axisLine={false} tickLine={false} allowDecimals={false} width={42} tick={{ fill: "#8C8694", fontSize: 10 }} tickFormatter={(value: number) => `${value}h`} />
                <Tooltip contentStyle={{ background: "#FFFFFF", border: "1px solid #E8E3EE", borderRadius: 12, color: "#211B2B", fontSize: 12, boxShadow: "0 8px 24px rgba(42,25,77,.12)" }} labelStyle={{ color: "#817B8B", marginBottom: 4 }} formatter={(value) => [`${Number(value ?? 0).toFixed(1)}h`, "Time invested"]} />
                <Area type="monotone" dataKey="invested" name="Time invested" stroke="#7C3AED" strokeWidth={2.7} fill="url(#investedFill)" dot={false} activeDot={{ r: 5, fill: "#7C3AED", stroke: "#F0E9FF", strokeWidth: 3 }} filter="url(#lineGlow)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center justify-between border-t border-[#F0EDF3] px-5 py-3 text-[10px] text-[#8A8492] sm:px-7"><span>Daily tracked hours, accumulated</span><span>Compared with previous {period}</span></div>
        </section>

        <div className="grid gap-4 md:grid-cols-[1.15fr_0.85fr]">
          <section className="rounded-[22px] border border-[#E8E3EE] bg-white p-5 shadow-[0_12px_35px_rgba(42,25,77,0.05)] sm:p-6" aria-label="Activity breakdown">
            <div className="mb-5 flex items-center gap-2"><Activity size={16} className="text-[#827B8C]" /><h2 className="text-sm font-semibold">Where the hours went</h2></div>
            <div className="space-y-4">
              {MIX.map((item) => {
                const hours = summary.hours_by_activity[item.key] || 0;
                const share = summary.total_hours > 0 ? Math.min(100, (hours / summary.total_hours) * 100) : 0;
                return <div key={item.key}>
                  <div className="mb-2 flex items-center justify-between text-xs"><span className="flex items-center gap-2 text-[#4F4958]"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />{item.label}</span><span className="font-semibold tabular-nums">{hours.toFixed(1)}h <span className="font-normal text-[#8A8492]">· {Math.round(share)}%</span></span></div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-[#F0EDF3]"><div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${share}%`, backgroundColor: item.color }} /></div>
                </div>;
              })}
            </div>
          </section>

          <section className="rounded-[22px] border border-[#E8E3EE] bg-white p-5 shadow-[0_12px_35px_rgba(42,25,77,0.05)] sm:p-6" aria-label="Monthly budget snapshot">
            <div className="mb-5 flex items-center gap-2"><Wallet size={16} className="text-[#827B8C]" /><h2 className="text-sm font-semibold">Money snapshot</h2></div>
            {finance ? <>
              <p className="text-xs text-[#817B8B]">Budget remaining this month</p>
              <p className="mt-1 text-3xl font-semibold tracking-[-0.05em] tabular-nums">{money(finance.remaining)}</p>
              <div className="mt-5 flex items-center justify-between border-t border-[#F0EDF3] pt-4 text-xs"><span className="flex items-center gap-2 text-[#817B8B]"><Clock3 size={14} />Spent so far</span><span className="font-semibold tabular-nums">{money(finance.expenses)}</span></div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#F0EDF3]"><div className="h-full rounded-full bg-[#7C3AED]" style={{ width: `${finance.monthly_balance > 0 ? Math.min(100, (finance.expenses / finance.monthly_balance) * 100) : 0}%` }} /></div>
            </> : <p className="text-sm leading-6 text-[#817B8B]">Set a monthly budget on Home to see your spending pace here.</p>}
          </section>
        </div>
        {!loading && summary.total_hours === 0 && <p className="px-1 text-center text-xs text-[#817B8B]">Your chart will grow as you log study, gym, or run time.</p>}
      </div>
    </div>
  );
}
