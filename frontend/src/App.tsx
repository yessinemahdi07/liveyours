import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/layout/Layout";
import { lazy, Suspense } from "react";
import { useEffect, useState } from "react";
import SignIn from "./pages/SignIn";
import { api, AUTH_EXPIRED_EVENT } from "./lib/api";
import { signInErrorMessage } from "./lib/signInError";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const AIChat = lazy(() => import("./pages/AIChat"));
const Library = lazy(() => import("./pages/Library"));
const MobileLogger = lazy(() => import("./pages/MobileLogger"));
const Analytics = lazy(() => import("./pages/Analytics"));
const History = lazy(() => import("./pages/History"));
const Completed = lazy(() => import("./pages/Completed"));

type AuthState = "checking" | "authenticated" | "unauthenticated" | "unavailable";

function SessionStatus({ unavailable = false, onRetry }: { unavailable?: boolean; onRetry?: () => void }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#F7F5FC] px-5 py-8 pt-[calc(2rem+env(safe-area-inset-top))] pb-[calc(2rem+env(safe-area-inset-bottom))] text-[#211D2B]">
      <section className="w-full max-w-sm rounded-[28px] border border-[#EAE5F2] bg-white p-7 text-center shadow-[0_24px_80px_rgba(48,34,75,0.08)]" aria-live="polite" role="status">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F1EBFF] text-[#7C3AED]" aria-hidden="true">
          {unavailable ? <span className="text-xl font-semibold">L.Y</span> : <span className="h-6 w-6 animate-spin rounded-full border-2 border-violet-100 border-t-[#7C3AED] motion-reduce:animate-none" />}
        </div>
        <h1 className="text-lg font-semibold tracking-tight">{unavailable ? "LiveYours is offline" : "Opening your workspace"}</h1>
        <p className="mt-2 text-sm leading-6 text-[#777181]">
          {unavailable ? "LiveYours couldn’t reach its server. Check your connection, then try again." : "Checking your secure session…"}
        </p>
        {unavailable && onRetry && (
          <button type="button" onClick={onRetry} className="mt-5 min-h-11 w-full rounded-xl bg-[#7C3AED] px-4 text-sm font-semibold text-white transition hover:bg-[#6D28D9] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-200">
            Try again
          </button>
        )}
      </section>
    </main>
  );
}

function App() {
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [sessionAttempt, setSessionAttempt] = useState(0);
  const [signInBusy, setSignInBusy] = useState(false);
  const [signInError, setSignInError] = useState("");
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    api.getAuthSession(controller.signal).then((session) => {
      if (active) setAuthState(session.authenticated ? "authenticated" : "unauthenticated");
    }).catch(() => {
      if (active) setAuthState("unavailable");
    }).finally(() => window.clearTimeout(timeout));
    const onExpired = () => setAuthState("unauthenticated");
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timeout);
      window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
    };
  }, [sessionAttempt]);
  if (authState === "checking") return <SessionStatus />;
  if (authState === "unavailable") return <SessionStatus unavailable onRetry={() => {
    setAuthState("checking");
    setSessionAttempt((attempt) => attempt + 1);
  }} />;
  if (authState === "unauthenticated") return <SignIn busy={signInBusy} error={signInError} onSubmit={async (username, password) => {
    setSignInBusy(true);
    setSignInError("");
    try {
      await api.login(username, password);
      setAuthState("authenticated");
    } catch (error) {
      setSignInError(signInErrorMessage(error));
    } finally {
      setSignInBusy(false);
    }
  }} />;
  return (
    <BrowserRouter>
      <Layout onSignOut={async () => { await api.logout(); setAuthState("unauthenticated"); }}>
        <Suspense fallback={<div className="p-6 text-sm font-semibold text-gray-500">Loading…</div>}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/chat" element={<AIChat />} />
            <Route path="/chat/:id" element={<AIChat />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/library" element={<Library />} />
            <Route path="/log" element={<MobileLogger />} />
            <Route path="/history" element={<History />} />
            <Route path="/completed" element={<Completed />} />
          </Routes>
        </Suspense>
      </Layout>
    </BrowserRouter>
  );
}
export default App;
