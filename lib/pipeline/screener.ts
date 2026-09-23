// Reads a company's Screener.in page for its identifiers and last price.
// Used to resolve pasted Screener links, and as a price fallback for stocks
// Yahoo doesn't carry (many BSE SME listings).

export interface ScreenerCompany {
  code: string;               // the code in the Screener URL (NSE symbol or BSE scrip code)
  companyName: string | null;
  nseSymbol: string | null;
  bseCode: string | null;
  price: number | null;
}

/** The company code in a screener.in/company/<code>/ link, or null. */
export function screenerCodeFromUrl(raw: string): string | null {
  const m = raw.match(/screener\.in\/company\/([^/?#\s]+)/i);
  return m ? decodeURIComponent(m[1]).trim().toUpperCase() : null;
}

export async function fetchScreenerCompany(code: string): Promise<ScreenerCompany | null> {
  if (!/^[A-Z0-9&.-]{1,30}$/i.test(code)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`https://www.screener.in/company/${encodeURIComponent(code)}/`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36' },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const html = await res.text();

    const title = html.match(/<title>\s*([^<]*?)\s+share price/i);
    const nse = html.match(/nseindia\.com\/get-quotes\/equity\?symbol=([^"&]+)/i);
    const bse = html.match(/bseindia\.com\/stock-share-price\/[^/"]+\/[^/"]+\/(\d+)\//i);
    const priceMatch = html.match(/Current Price[\s\S]{0,300}?<span class="number">([\d,.]+)<\/span>/i);
    const price = priceMatch ? parseFloat(priceMatch[1].replace(/,/g, '')) : NaN;

    const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
    return {
      code: code.toUpperCase(),
      companyName: title ? decode(title[1]) : null,
      nseSymbol: nse ? decodeURIComponent(nse[1]).toUpperCase() : null,
      bseCode: bse ? bse[1] : null,
      price: Number.isFinite(price) && price > 0 ? price : null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
