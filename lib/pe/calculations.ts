// Private Equity Calculations

import { PECompany, PEMetrics } from '../../types/pe';

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
