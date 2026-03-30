// Private Equity Calculations
// MOIC and IRR calculations for PE investments

import { PEInvestment, PEMetrics } from '../../types/pe';

/**
 * Calculate Multiple on Invested Capital (MOIC)
 * MOIC = Current Value / Invested Value
 */
export function calculateMOIC(investment: PEInvestment | null): number | null {
  if (!investment) return null;
  if (!investment.investedValue || investment.investedValue === 0) return null;
  if (investment.currentValue == null) return null;

  return investment.currentValue / investment.investedValue;
}

/**
 * Calculate Internal Rate of Return (IRR) using Newton-Raphson method
 * This is a simplified IRR calculation assuming a single investment and single current value
 * IRR = (Current Value / Invested Value)^(1/years) - 1
 */
export function calculateIRR(investment: PEInvestment | null): number | null {
  if (!investment) return null;
  if (!investment.investedValue || investment.investedValue === 0) return null;
  if (investment.currentValue == null) return null;
  if (!investment.investmentDate) return null;

  const investmentDate = new Date(investment.investmentDate);
  const today = new Date();

  // Calculate years between investment date and today
  const msPerYear = 365.25 * 24 * 60 * 60 * 1000;
  const years = (today.getTime() - investmentDate.getTime()) / msPerYear;

  if (years <= 0) return null;

  const moic = investment.currentValue / investment.investedValue;

  // IRR = (MOIC)^(1/years) - 1
  // Convert to percentage
  const irr = (Math.pow(moic, 1 / years) - 1) * 100;

  return irr;
}

/**
 * Calculate total gain/loss
 */
export function calculateTotalGainLoss(investment: PEInvestment | null): number | null {
  if (!investment) return null;
  if (investment.currentValue == null) return null;

  return investment.currentValue - investment.investedValue;
}

/**
 * Calculate total gain/loss percentage
 */
export function calculateTotalGainLossPercentage(investment: PEInvestment | null): number | null {
  if (!investment) return null;
  if (!investment.investedValue || investment.investedValue === 0) return null;
  if (investment.currentValue == null) return null;

  return ((investment.currentValue - investment.investedValue) / investment.investedValue) * 100;
}

/**
 * Calculate all PE metrics for an investment
 */
export function calculateMetrics(investment: PEInvestment | null): PEMetrics {
  return {
    moic: calculateMOIC(investment),
    irr: calculateIRR(investment),
    totalGainLoss: calculateTotalGainLoss(investment),
    totalGainLossPercentage: calculateTotalGainLossPercentage(investment),
  };
}

/**
 * Format MOIC for display
 */
export function formatMOIC(moic: number | null): string {
  if (moic == null) return '-';
  return `${moic.toFixed(2)}x`;
}

/**
 * Format IRR for display
 */
export function formatIRR(irr: number | null): string {
  if (irr == null) return '-';
  return `${irr.toFixed(1)}%`;
}

/**
 * Format currency value for display (INR)
 */
export function formatCurrency(value: number | null, currency: string = 'INR'): string {
  if (value == null) return '-';

  if (currency === 'INR') {
    // Format in Indian numbering system (lakhs and crores)
    const absValue = Math.abs(value);
    const sign = value < 0 ? '-' : '';

    if (absValue >= 10000000) {
      // Crores
      return `${sign}₹${(absValue / 10000000).toFixed(2)} Cr`;
    } else if (absValue >= 100000) {
      // Lakhs
      return `${sign}₹${(absValue / 100000).toFixed(2)} L`;
    } else if (absValue >= 1000) {
      // Thousands
      return `${sign}₹${(absValue / 1000).toFixed(2)} K`;
    } else {
      return `${sign}₹${absValue.toFixed(2)}`;
    }
  }

  // Default USD format
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Format percentage for display
 */
export function formatPercentage(value: number | null): string {
  if (value == null) return '-';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

/**
 * Format ownership percentage for display
 */
export function formatOwnership(value: number | null): string {
  if (value == null) return '-';
  return `${value.toFixed(2)}%`;
}
