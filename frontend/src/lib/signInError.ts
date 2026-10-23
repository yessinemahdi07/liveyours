/** Explain whether sign-in failed because of credentials, throttling, or connectivity. */
export function signInErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "status" in error) {
    const status = error.status;
    if (status === 401) return "That username and password didn’t match. Try again.";
    if (status === 429) return "Too many sign-in attempts. Wait five minutes, then try again.";
    if (typeof status === "number" && status >= 500) {
      return "LiveYours couldn’t sign in right now. Check your connection and try again.";
    }
  }
  return "LiveYours couldn’t reach the sign-in service. Check your connection and try again.";
}
