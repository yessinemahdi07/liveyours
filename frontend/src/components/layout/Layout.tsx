import { Home, MessageSquare, Library, Activity, BarChart2, Clock, CheckCircle, LogOut } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useState } from "react";
import GlobalActions from "./GlobalActions";
import { CAPTURE_EVENT, PALETTE_EVENT } from "../../lib/uiEvents";
import { Command } from "lucide-react";
import { Plus } from "lucide-react";
import { MoreHorizontal } from "lucide-react";

const Logo = () => <img src="/favicon.svg" alt="" aria-hidden="true" className="h-9 w-9 rounded-xl" />;

export default function Layout({ children, onSignOut }: { children: React.ReactNode; onSignOut: () => void | Promise<void> }) {
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const navItems = [
    { name: "Home", path: "/", icon: <Home size={20} /> },
    { name: "Chat", path: "/chat", icon: <MessageSquare size={20} /> },
    { name: "History", path: "/history", icon: <Clock size={20} /> },
    { name: "Done", path: "/completed", icon: <CheckCircle size={20} /> },
    { name: "Stats", path: "/analytics", icon: <BarChart2 size={20} /> },
    { name: "Library", path: "/library", icon: <Library size={20} /> },
    { name: "Log", path: "/log", icon: <Activity size={20} /> },
  ];

  return (
    <div className="flex h-[100dvh] min-h-0 min-w-0 overflow-hidden bg-white text-[#1D1D1F]">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-white border-r border-gray-200 z-20">
        <div className="p-6 flex items-center gap-3">
          <Logo />
          <div>
            <h1 className="text-xl font-black tracking-tight leading-none">L.Y</h1>
            <p className="text-[10px] font-bold text-gray-400 mt-1 uppercase tracking-widest">LiveYours</p>
          </div>
        </div>
        <button type="button" onClick={() => window.dispatchEvent(new Event(PALETTE_EVENT))} className="mx-3 mb-4 flex min-h-11 items-center gap-2 rounded-xl border border-[#E9E6EF] px-3 text-sm font-medium text-[#6E697B] transition hover:border-[#CBB8F8] hover:bg-[#FAF8FD] hover:text-[#6C3BC1]">
          <Command size={16} /><span>Find anything</span><kbd className="ml-auto rounded-md bg-[#F4F1F8] px-1.5 py-0.5 text-[10px]">⌘ K</kbd>
        </button>
        <button type="button" onClick={() => window.dispatchEvent(new Event(CAPTURE_EVENT))} className="mx-3 mb-4 flex min-h-11 items-center gap-2 rounded-xl bg-[#F2EDFF] px-3 text-sm font-semibold text-[#6C3BC1] transition hover:bg-[#E9DFFF]">
          <Plus size={16} /> Quick capture
        </button>
        <nav className="flex-1 px-3 space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
            return (
              <Link key={item.name} to={item.path} className={`flex items-center gap-3 px-4 py-3 rounded-2xl transition-all font-semibold text-sm ${isActive ? "bg-[#7C3AED] text-white shadow-lg shadow-violet-500/30" : "text-gray-500 hover:bg-gray-50"}`}>
                {item.icon} <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>
        <button type="button" onClick={() => void onSignOut()} className="m-3 flex min-h-11 items-center gap-3 rounded-xl px-4 text-sm font-semibold text-gray-500 transition hover:bg-gray-50 hover:text-gray-900"><LogOut size={18} />Sign out</button>
      </aside>

      {/* Main Content */}
      <main className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto ios-scroll pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0">
          {children}
        </div>
      </main>

      {/* Mobile navigation keeps the four daily actions visible and tucks away secondary destinations. */}
      {moreOpen && <button aria-label="Close navigation menu" className="md:hidden fixed inset-0 z-40 bg-black/20" onClick={() => setMoreOpen(false)} />}
      {moreOpen && <div role="menu" aria-label="More destinations" className="md:hidden fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-3 z-50 w-48 rounded-2xl border border-gray-100 bg-white p-2 shadow-xl">
        <button role="menuitem" type="button" onClick={() => { setMoreOpen(false); window.dispatchEvent(new Event(CAPTURE_EVENT)); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold text-[#6C3BC1] hover:bg-violet-50"><Plus size={20} />Quick capture</button>
        {navItems.filter((item) => ["History", "Done", "Library"].includes(item.name)).map((item) => (
          <Link role="menuitem" key={item.name} to={item.path} onClick={() => setMoreOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-gray-600 hover:bg-violet-50 hover:text-violet-700">{item.icon}{item.name}</Link>
        ))}
        <button role="menuitem" type="button" onClick={() => { setMoreOpen(false); void onSignOut(); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold text-gray-600 hover:bg-violet-50"><LogOut size={20} />Sign out</button>
      </div>}
      <nav aria-label="Main navigation" className="md:hidden fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-t border-gray-200 z-50 pb-safe">
        <div className="grid grid-cols-5 items-center px-1">
          {navItems.filter((item) => ["Home", "Chat", "Log", "Stats"].includes(item.name)).map((item) => {
            const isActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
            return <Link key={item.name} to={item.path} aria-current={isActive ? "page" : undefined} className={`flex min-h-12 flex-col items-center justify-center px-1 py-1.5 ${isActive ? "text-[#7C3AED]" : "text-gray-400"}`}>
              <div className={`${isActive ? 'scale-110' : ''} transition-transform`}>{item.icon}</div><span className="text-[9px] font-bold mt-0.5">{item.name}</span>
            </Link>;
          })}
          <button type="button" aria-haspopup="menu" aria-expanded={moreOpen} onClick={() => setMoreOpen((open) => !open)} className={`flex min-h-12 flex-col items-center justify-center px-1 py-1.5 ${moreOpen || ["/history", "/completed", "/library"].some((path) => location.pathname.startsWith(path)) ? "text-[#7C3AED]" : "text-gray-400"}`}>
            <MoreHorizontal size={20} /><span className="text-[9px] font-bold mt-0.5">More</span>
          </button>
        </div>
      </nav>
      <GlobalActions />
    </div>
  );
}
