import { useState, type FormEvent } from "react";
import { Eye, EyeOff, LockKeyhole } from "lucide-react";

interface SignInProps {
  busy: boolean;
  error: string;
  onSubmit: (username: string, password: string) => Promise<void>;
}

export default function SignIn({ busy, error, onSubmit }: SignInProps) {
  const [username, setUsername] = useState("liveyours");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void onSubmit(username, password);
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#F7F5FC] px-5 py-8 pt-[calc(2rem+env(safe-area-inset-top))] pb-[calc(2rem+env(safe-area-inset-bottom))] text-[#211D2B]">
      <section className="w-full max-w-[420px] rounded-[28px] border border-[#EAE5F2] bg-white p-6 shadow-[0_24px_80px_rgba(48,34,75,0.08)] sm:p-10">
        <header className="mb-10 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#F1EBFF] text-[#7C3AED]" aria-hidden="true">
            <svg width="25" height="25" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M20 20 L40 80 L50 50 L60 80 L80 20" stroke="currentColor" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M35 20 L50 50 L65 20" stroke="currentColor" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <p className="text-[17px] font-bold tracking-[-0.03em]">LiveYours</p>
            <p className="text-xs font-medium text-[#777181]">Your personal workspace</p>
          </div>
        </header>

        <div className="mb-8">
          <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-[#F7F4FC] px-3 py-1.5 text-xs font-semibold text-[#6C3BC1]">
            <LockKeyhole size={13} aria-hidden="true" /> Private to you
          </p>
          <h1 className="text-[2.35rem] font-semibold leading-[1.05] tracking-[-0.055em]">Make space for what matters.</h1>
          <p className="mt-3 text-[15px] leading-6 text-[#6F6A79]">Sign in to pick up where you left off.</p>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="username" className="mb-2 block text-sm font-semibold text-[#383341]">Username</label>
            <input id="username" name="username" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} required value={username} onChange={(event) => setUsername(event.target.value)} className="min-h-12 w-full rounded-xl border border-[#DCD6E7] bg-white px-4 text-base text-[#211D2B] outline-none transition placeholder:text-[#9A95A3] focus:border-[#8B5CF6] focus:ring-4 focus:ring-violet-100" />
          </div>
          <div>
            <label htmlFor="password" className="mb-2 block text-sm font-semibold text-[#383341]">Password</label>
            <div className="relative">
              <input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} className="min-h-12 w-full rounded-xl border border-[#DCD6E7] bg-white px-4 pr-12 text-base text-[#211D2B] outline-none transition placeholder:text-[#9A95A3] focus:border-[#8B5CF6] focus:ring-4 focus:ring-violet-100" />
              <button type="button" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword((visible) => !visible)} className="absolute inset-y-0 right-1 flex w-10 items-center justify-center rounded-lg text-[#777181] hover:bg-[#F7F4FC] hover:text-[#6C3BC1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500">
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          {error && <p role="alert" className="rounded-xl border border-[#F4C7C7] bg-[#FFF7F7] px-4 py-3 text-sm leading-5 text-[#A12C35]">{error}</p>}
          <button type="submit" disabled={busy || !username.trim() || !password} className="min-h-12 w-full rounded-xl bg-[#7C3AED] px-5 text-[15px] font-semibold text-white shadow-[0_8px_20px_rgba(124,58,237,0.2)] transition hover:bg-[#6D28D9] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-200 disabled:cursor-wait disabled:opacity-60">
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="mt-6 text-center text-xs leading-5 text-[#8A8493]">Your workspace is protected. Your password is never saved in this browser app.</p>
      </section>
    </main>
  );
}
