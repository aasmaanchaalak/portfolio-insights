#!/usr/bin/env python3
"""
Nightly price updater — fetches previous-day close prices via yfinance
and upserts them into the price_cache table.

Run: python scripts/update_prices.py
Cron: 0 7 * * * /path/to/venv/bin/python /path/to/scripts/update_prices.py
"""

import os
import sys
import logging
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


def fetch_prices(tickers: list[str]) -> dict[str, tuple[float, date]]:
    results: dict[str, tuple[float, date]] = {}
    if not tickers:
        return results

    ns_tickers = [f"{t}.NS" for t in tickers]
    log.info(f"Fetching {len(ns_tickers)} tickers from yfinance (NSE)")

    try:
        data = yf.download(ns_tickers, period="2d", auto_adjust=True, progress=False)
        close = data["Close"] if "Close" in data.columns else data.get("close")
        if close is None:
            log.warning("No close price data returned")
            return results

        for t in tickers:
            col = f"{t}.NS"
            if col not in close.columns:
                continue
            series = close[col].dropna()
            if series.empty:
                continue
            price = float(series.iloc[-1])
            price_date = series.index[-1].date()
            results[t] = (price, price_date)
    except Exception as e:
        log.error(f"yfinance batch fetch failed: {e}")

    # Retry missing tickers via BSE
    missing = [t for t in tickers if t not in results]
    if missing:
        log.info(f"Retrying {len(missing)} tickers via BSE (.BO)")
        bo_tickers = [f"{t}.BO" for t in missing]
        try:
            data2 = yf.download(bo_tickers, period="2d", auto_adjust=True, progress=False)
            close2 = data2["Close"] if "Close" in data2.columns else data2.get("close")
            if close2 is not None:
                for t in missing:
                    col = f"{t}.BO"
                    if col not in close2.columns:
                        continue
                    series2 = close2[col].dropna()
                    if series2.empty:
                        continue
                    results[t] = (float(series2.iloc[-1]), series2.index[-1].date())
        except Exception as e:
            log.warning(f"BSE fallback failed: {e}")

    return results


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
