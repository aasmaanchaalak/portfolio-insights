// Private Equity Calculations

import { PECompany, PEMetrics, PEFactsheetSummary, PEFactsheetHolding, PEStage } from '../../types/pe';

// For exited companies the realized exit value replaces the current mark
export function effectiveValue(company: PECompany | null): number | null {
  if (!company) return null;
  return company.isExited ? company.exitValue : company.currentValue;
}

export function calculateMOIC(company: PECompany | null): number | null {
  if (!company?.investedValue || company.investedValue === 0) return null;
  const value = effectiveValue(company);
  if (value == null) return null;
  return value / company.investedValue;
}

export function calculateIRR(company: PECompany | null): number | null {
  if (!company?.investedValue || company.investedValue === 0) return null;
  const value = effectiveValue(company);
  if (value == null) return null;
  if (!company.investmentDate) return null;

  const endTime = company.isExited && company.exitDate
    ? new Date(company.exitDate).getTime()
    : Date.now();
  const msPerYear = 365.25 * 24 * 60 * 60 * 1000;
  const years = (endTime - new Date(company.investmentDate).getTime()) / msPerYear;
  if (years <= 0) return null;

  const moic = value / company.investedValue;
  return (Math.pow(moic, 1 / years) - 1) * 100;
}

export function calculateTotalGainLoss(company: PECompany | null): number | null {
  const value = effectiveValue(company);
  if (!company || value == null) return null;
  return value - (company.investedValue || 0);
}

export function calculateTotalGainLossPercentage(company: PECompany | null): number | null {
  if (!company?.investedValue || company.investedValue === 0) return null;
  const value = effectiveValue(company);
  if (value == null) return null;
  return ((value - company.investedValue) / company.investedValue) * 100;
}

export function calculateMetrics(company: PECompany | null): PEMetrics {
  return {
    moic: calculateMOIC(company),
    irr: calculateIRR(company),
    totalGainLoss: calculateTotalGainLoss(company),
    totalGainLossPercentage: calculateTotalGainLossPercentage(company),
  };
}

export function formatMOIC(moic: number | null): string {
  if (moic == null) return '-';
  return `${moic.toFixed(2)}x`;
}

export function formatIRR(irr: number | null): string {
  if (irr == null) return '-';
  return `${irr.toFixed(1)}%`;
}

export function formatCurrency(value: number | null, currency: string = 'INR'): string {
  if (value == null) return '-';

  if (currency === 'INR') {
    const absValue = Math.abs(value);
    const sign = value < 0 ? '-' : '';
    if (absValue >= 10000000) return `${sign}₹${(absValue / 10000000).toFixed(2)} Cr`;
    if (absValue >= 100000) return `${sign}₹${(absValue / 100000).toFixed(2)} L`;
    if (absValue >= 1000) return `${sign}₹${(absValue / 1000).toFixed(2)} K`;
    return `${sign}₹${absValue.toFixed(2)}`;
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPercentage(value: number | null): string {
  if (value == null) return '-';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

export function formatOwnership(value: number | null): string {
  if (value == null) return '-';
  return `${value.toFixed(2)}%`;
}

// ============ Blended (money-weighted) IRR via XIRR ============

interface CashFlow {
  amount: number; // negative = capital deployed, positive = value returned
  date: Date;
}

// Newton-Raphson with a bisection fallback. Returns annualized rate as a percentage.
export function xirr(flows: CashFlow[]): number | null {
  if (flows.length < 2) return null;
  if (!flows.some(f => f.amount < 0) || !flows.some(f => f.amount > 0)) return null;

  const sorted = [...flows].sort((a, b) => a.date.getTime() - b.date.getTime());
  const t0 = sorted[0].date.getTime();
  const msPerYear = 365.25 * 24 * 60 * 60 * 1000;
  const years = sorted.map(f => (f.date.getTime() - t0) / msPerYear);

  const npv = (rate: number) =>
    sorted.reduce((s, f, i) => s + f.amount / Math.pow(1 + rate, years[i]), 0);
  const dnpv = (rate: number) =>
    sorted.reduce((s, f, i) => s - (years[i] * f.amount) / Math.pow(1 + rate, years[i] + 1), 0);

  // Newton-Raphson
  let rate = 0.1;
  for (let iter = 0; iter < 100; iter++) {
    const f = npv(rate);
    const df = dnpv(rate);
    if (Math.abs(df) < 1e-10) break;
    const next = rate - f / df;
    if (!isFinite(next)) break;
    if (Math.abs(next - rate) < 1e-7) return next * 100;
    rate = next <= -0.9999 ? -0.99 : next;
  }

  // Bisection fallback over a wide bracket
  let lo = -0.9999;
  let hi = 100;
  const flo = npv(lo);
  const fhi = npv(hi);
  if (flo * fhi > 0) return null;
  for (let i = 0; i < 300; i++) {
    const mid = (lo + hi) / 2;
    const fmid = npv(mid);
    if (Math.abs(fmid) < 1e-6) return mid * 100;
    if (flo * fmid < 0) hi = mid;
    else lo = mid;
  }
  return ((lo + hi) / 2) * 100;
}

// ============ Factsheet: private-sleeve aggregation ============

function stageGroup(stage: PEStage | null): 'early' | 'growth' | 'late' | 'other' {
  switch (stage) {
    case 'seed':
    case 'series_a':
      return 'early';
    case 'series_b':
    case 'series_c':
      return 'growth';
    case 'series_d_plus':
    case 'pre_ipo':
      return 'late';
    default:
      return 'other';
  }
}

export function computePEFactsheetSummary(companies: PECompany[]): PEFactsheetSummary {
  const held = companies.filter(c => !c.isExited);
  const exited = companies.filter(c => c.isExited);

  const paidIn = companies.reduce((s, c) => s + (c.investedValue || 0), 0);
  const currentNav = held.reduce((s, c) => s + (c.currentValue || 0), 0);
  const distributed = exited.reduce((s, c) => s + (c.exitValue || 0), 0);

  const dpi = paidIn > 0 ? distributed / paidIn : null;
  const tvpi = paidIn > 0 ? (distributed + currentNav) / paidIn : null;

  // Blended IRR: capital out at each investment date, value back at exit (exited)
  // or marked NAV as of today (held). Only companies with an investment date qualify.
  const flows: CashFlow[] = [];
  let irrCoverage = 0;
  const now = new Date();
  for (const c of companies) {
    if (!c.investmentDate || !c.investedValue) continue;
    const value = c.isExited ? c.exitValue : c.currentValue;
    if (value == null) continue;
    flows.push({ amount: -c.investedValue, date: new Date(c.investmentDate) });
    const endDate = c.isExited && c.exitDate ? new Date(c.exitDate) : now;
    flows.push({ amount: value, date: endDate });
    irrCoverage++;
  }
  const irr = flows.length >= 2 ? xirr(flows) : null;

  const topHoldings: PEFactsheetHolding[] = held
    .filter(c => (c.currentValue || 0) > 0)
    .sort((a, b) => (b.currentValue || 0) - (a.currentValue || 0))
    .slice(0, 5)
    .map(c => ({
      companyName: c.companyName,
      sector: c.sector,
      stage: c.stage,
      currentValue: c.currentValue || 0,
      investmentDate: c.investmentDate,
      navPctOfSleeve: currentNav > 0 ? ((c.currentValue || 0) / currentNav) * 100 : null,
    }));

  const byStage = { early: 0, growth: 0, late: 0, other: 0 };
  const vintageMap: Record<string, number> = {};
  const liquidity = { lt3yr: 0, gt3yr: 0, unclassified: 0 };

  for (const c of held) {
    const nav = c.currentValue || 0;
    if (nav <= 0) continue;
    byStage[stageGroup(c.stage)] += nav;
    if (c.investmentDate) {
      const year = new Date(c.investmentDate).getFullYear().toString();
      vintageMap[year] = (vintageMap[year] || 0) + nav;
    }
    if (c.exitHorizon === 'lt_3yr') liquidity.lt3yr += nav;
    else if (c.exitHorizon === 'gt_3yr') liquidity.gt3yr += nav;
    else liquidity.unclassified += nav;
  }

  // Convert stage buckets to % of NAV
  if (currentNav > 0) {
    byStage.early = (byStage.early / currentNav) * 100;
    byStage.growth = (byStage.growth / currentNav) * 100;
    byStage.late = (byStage.late / currentNav) * 100;
    byStage.other = (byStage.other / currentNav) * 100;
  }

  const byVintage = Object.entries(vintageMap)
    .map(([label, nav]) => ({ label, pct: currentNav > 0 ? (nav / currentNav) * 100 : 0 }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return {
    paidIn,
    currentNav,
    distributed,
    heldCount: held.length,
    exitedCount: exited.length,
    dpi,
    tvpi,
    moic: tvpi,
    irr,
    irrCoverage,
    topHoldings,
    byStage,
    byVintage,
    liquidity,
  };
}
