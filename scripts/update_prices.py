#!/usr/bin/env python3
"""
Nightly price updater — fetches previous-day close prices via yfinance
and upserts them into the price_cache table.

Run: python scripts/update_prices.py
Cron: 0 7 * * * /path/to/venv/bin/python /path/to/scripts/update_prices.py
"""

import os
import re
import sys
import logging
import urllib.parse
import urllib.request
from datetime import date

import psycopg2
import yfinance as yf

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    log.error("DATABASE_URL environment variable not set")
    sys.exit(1)


def get_tickers(conn) -> list[str]:
    with conn.cursor() as cur:
        cur.execute("SELECT DISTINCT ticker FROM pipeline_ideas")
        pipeline = [r[0] for r in cur.fetchall()]
    return list(set(pipeline))


# Tried in order; each pass only retries tickers the earlier ones missed.
# Matches the suffix order in pages/api/pipeline/refresh-prices.ts.
EXCHANGE_SUFFIXES = [(".NS", "NSE"), (".BO", "BSE"), ("-SM.NS", "NSE SME"), ("-SM.BO", "BSE SME")]


def fetch_prices(tickers: list[str]) -> dict[str, tuple[float, date]]:
    results: dict[str, tuple[float, date]] = {}

    for suffix, label in EXCHANGE_SUFFIXES:
        missing = [t for t in tickers if t not in results]
        if not missing:
            break
        log.info(f"Fetching {len(missing)} tickers from yfinance ({label}, {suffix})")
        symbols = [f"{t}{suffix}" for t in missing]
        try:
            data = yf.download(symbols, period="2d", auto_adjust=True, progress=False)
            close = data["Close"] if "Close" in data.columns else data.get("close")
            if close is None:
                log.warning(f"No close price data returned for {label}")
                continue
            if not hasattr(close, "columns"):
                # A single symbol can come back as a plain Series.
                close = close.to_frame(name=symbols[0])
            for t in missing:
                col = f"{t}{suffix}"
                if col not in close.columns:
                    continue
                series = close[col].dropna()
                if series.empty:
                    continue
                results[t] = (float(series.iloc[-1]), series.index[-1].date())
        except Exception as e:
            log.warning(f"{label} fetch failed: {e}")

    # Yahoo misses many BSE SME stocks — fall back to the Screener page.
    missing = [t for t in tickers if t not in results]
    if missing:
        log.info(f"Trying Screener for {len(missing)} tickers")
    for t in missing:
        price = fetch_screener_price(t)
        if price is not None:
            results[t] = (price, date.today())

    return results


SCREENER_PRICE = re.compile(r'Current Price[\s\S]{0,300}?<span class="number">([\d,.]+)</span>')


def fetch_screener_price(ticker: str) -> float | None:
    """Last price from screener.in/company/<ticker>/ (NSE symbol or BSE code)."""
    url = f"https://www.screener.in/company/{urllib.parse.quote(ticker)}/"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            html = resp.read().decode("utf-8", errors="ignore")
    except Exception as e:
        log.warning(f"Screener fetch failed for {ticker}: {e}")
        return None
    m = SCREENER_PRICE.search(html)
    if not m:
        return None
    try:
        price = float(m.group(1).replace(",", ""))
    except ValueError:
        return None
    return price if price > 0 else None


def upsert_prices(conn, prices: dict[str, tuple[float, date]]) -> int:
    if not prices:
        return 0
    with conn.cursor() as cur:
        for ticker, (price, price_date) in prices.items():
            cur.execute("""
                INSERT INTO price_cache (ticker, close_price, price_date, updated_at)
                VALUES (%s, %s, %s, NOW())
                ON CONFLICT (ticker) DO UPDATE
                  SET close_price = EXCLUDED.close_price,
                      price_date = EXCLUDED.price_date,
                      updated_at = NOW()
            """, (ticker, price, price_date))

        # Propagate current_price into pipeline_ideas
        cur.execute("""
            UPDATE pipeline_ideas pi
            SET current_price = pc.close_price, updated_at = NOW()
            FROM price_cache pc
            WHERE pi.ticker = pc.ticker
        """)
    conn.commit()
    return len(prices)


def main():
    try:
        conn = psycopg2.connect(DATABASE_URL)
    except Exception as e:
        log.error(f"DB connection failed: {e}")
        sys.exit(1)

    try:
        tickers = get_tickers(conn)
        log.info(f"Found {len(tickers)} unique tickers to update")

        if not tickers:
            log.info("No tickers to update, exiting")
            return

        prices = fetch_prices(tickers)
        log.info(f"Fetched prices for {len(prices)}/{len(tickers)} tickers")

        count = upsert_prices(conn, prices)
        log.info(f"Upserted {count} price records")

        failed = [t for t in tickers if t not in prices]
        if failed:
            log.warning(f"No price data for: {', '.join(failed)}")

    finally:
        conn.close()


if __name__ == "__main__":
    main()
