// Client-safe market helpers shared by the live-prices API and the app shell.

export interface LiveQuote {
  price: number;
  prevClose: number | null;
  changePct: number | null;
  time: number; // epoch ms of the last trade
}

/** True during NSE's regular session (Mon–Fri, 09:15–15:30 IST). Holidays aren't modelled. */
export function isIndianMarketOpen(now: Date = new Date()): boolean {
  const ist = new Date(now.getTime() + (5.5 * 60 + now.getTimezoneOffset()) * 60000);
  const day = ist.getDay();
  if (day === 0 || day === 6) return false;
  const mins = ist.getHours() * 60 + ist.getMinutes();
  return mins >= 9 * 60 + 15 && mins <= 15 * 60 + 30;
}
