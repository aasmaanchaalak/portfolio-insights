import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth, authUser } from '../../../lib/authMiddleware';
import { canEditFo } from '../../../lib/fo/access';
import { getSpotQuotes } from '../../../lib/fo/dashboard';
import {
  saveReport, listReportDates, getMarginEntries, setMarginEntry, getHoldings, setPurpose, getAccounts, SpotsAtUpload,
} from '../../../lib/fo/queries';
import { FoReport, PURPOSES, Purpose, FO_PORTFOLIO } from '../../../lib/fo/types';

// F&O Data page.
// GET                       → uploaded report dates, margin entries, holdings summary
// POST { kind: 'report' }   → a parsed broker report (parsed in the browser)
// POST { kind: 'margin' }   → margin used / SPAN / exposure / cash for an account
// POST { kind: 'purpose' }  → Hedge / Income / Directional for one contract (null = default)

const numOrNull = (v: any) => (v === '' || v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));

function validReport(r: any): r is FoReport {
  return r && r.broker === 'nuvama' && typeof r.account === 'string' && /^nuvama:\w+$/.test(r.account)
    && /^\d{4}-\d{2}-\d{2}$/.test(r.asOf) && Array.isArray(r.legs) && Array.isArray(r.trades)
    && r.legs.every((l: any) => typeof l.contract === 'string' && typeof l.underlying === 'string'
      && ['FUT', 'CE', 'PE'].includes(l.type) && /^\d{4}-\d{2}-\d{2}$/.test(l.expiry)
      && [l.qty, l.avg, l.ltp, l.unrealised, l.realised].every(Number.isFinite))
    && r.trades.every((t: any) => typeof t.contract === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.date)
      && ['Buy', 'Sell'].includes(t.side) && [t.qty, t.price, t.charges].every(Number.isFinite));
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = authUser(req);
  if (!canEditFo(user)) return res.status(403).json({ error: 'Forbidden' });
  const by = user.name || user.email;
  try {
    if (req.method === 'GET') {
      const [reports, margins, holdings, accounts] = await Promise.all([listReportDates(), getMarginEntries(), getHoldings(FO_PORTFOLIO), getAccounts()]);
      return res.status(200).json({
        accounts,
        reports,
        margins,
        holdings: { portfolio: FO_PORTFOLIO, count: holdings?.holdings.length ?? 0, updatedAt: holdings?.updatedAt ?? null },
      });
    }
    if (req.method !== 'POST') {
      res.setHeader('Allow', ['GET', 'POST']);
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { kind } = req.body || {};
    if (kind === 'report') {
      const report = req.body.report;
      if (!validReport(report)) return res.status(400).json({ error: 'Invalid report data' });
      // Remember each underlying's spot at upload, so later live re-pricing starts from the report's close.
      const quotes = await getSpotQuotes([...new Set(report.legs.map(l => l.underlying))].map(s => ({ nse: s, bse: null })));
      const spots: SpotsAtUpload = {};
      for (const l of report.legs) { const q = quotes[l.underlying]; if (q) spots[l.underlying] = { price: q.price, time: q.time }; }
      await saveReport(report, spots, by);
      return res.status(200).json({ success: true });
    }
    if (kind === 'margin') {
      const { account } = req.body;
      if (typeof account !== 'string' || !account) return res.status(400).json({ error: 'Account is required' });
      const m = { span: numOrNull(req.body.span), exposure: numOrNull(req.body.exposure), total: numOrNull(req.body.total), cash: numOrNull(req.body.cash) };
      if (Object.values(m).some(v => v !== null && v < 0)) return res.status(400).json({ error: 'Amounts cannot be negative' });
      await setMarginEntry(account, m, by);
      return res.status(200).json({ success: true });
    }
    if (kind === 'purpose') {
      const { account, contract, purpose } = req.body;
      if (typeof account !== 'string' || typeof contract !== 'string') return res.status(400).json({ error: 'Account and contract are required' });
      if (purpose !== null && !PURPOSES.includes(purpose)) return res.status(400).json({ error: 'Invalid purpose' });
      await setPurpose(account, contract, purpose as Purpose | null, by);
      return res.status(200).json({ success: true });
    }
    return res.status(400).json({ error: 'Unknown kind' });
  } catch (error) {
    console.error('F&O data error:', error);
    res.status(500).json({ error: 'F&O data request failed' });
  }
}

export default withAuth(handler);
