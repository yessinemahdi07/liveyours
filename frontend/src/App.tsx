import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/layout/Layout";
import { lazy, Suspense } from "react";
import { useEffect, useState } from "react";
import SignIn from "./pages/SignIn";
import { api, AUTH_EXPIRED_EVENT } from "./lib/api";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const AIChat = lazy(() => import("./pages/AIChat"));
const Library = lazy(() => import("./pages/Library"));
const MobileLogger = lazy(() => import("./pages/MobileLogger"));
const Analytics = lazy(() => import("./pages/Analytics"));
const History = lazy(() => import("./pages/History"));
const Completed = lazy(() => import("./pages/Completed"));

function App() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [signInBusy, setSignInBusy] = useState(false);
  const [signInError, setSignInError] = useState("");
  useEffect(() => {
    let active = true;
    api.getAuthSession().then((session) => {
      if (active) setAuthenticated(session.authenticated);
    }).catch(() => {
      if (active) setAuthenticated(false);
    });
    const onExpired = () => setAuthenticated(false);
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => {
      active = false;
      window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
    };
  }, []);
  if (authenticated === null) return <div className="min-h-screen bg-white" aria-label="Loading LiveYours" />;
  if (!authenticated) return <SignIn busy={signInBusy} error={signInError} onSubmit={async (username, password) => {
    setSignInBusy(true);
    setSignInError("");
    try {
      await api.login(username, password);
      setAuthenticated(true);
    } catch {
      setSignInError("That username and password didn’t match. Try again.");
    } finally {
      setSignInBusy(false);
    }
  }} />;
  return (
    <BrowserRouter>
      <Layout onSignOut={async () => { await api.logout(); setAuthenticated(false); }}>
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
