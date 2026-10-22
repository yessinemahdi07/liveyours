/** Normalize ISO and legacy Flask date strings to the YYYY-MM form used by month inputs. */
export function monthKey(value?: string | null): string | null {
  if (!value) return null;

  const text = value.trim();
  const isoMonth = /^(\d{4})-(\d{1,2})(?:-|$)/.exec(text);
  if (isoMonth) {
    const month = Number(isoMonth[2]);
    return month >= 1 && month <= 12
      ? `${isoMonth[1]}-${String(month).padStart(2, "0")}`
      : null;
  }

  // Flask's default JSON provider can serialize a date as an RFC 822 string.
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function formatMonthLabel(value?: string | null): string | null {
  const month = monthKey(value);
  if (!month) return null;
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en", { month: "short", year: "numeric" })
    .format(new Date(year, monthNumber - 1, 1));
}
