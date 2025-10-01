/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Stock {
  name: string;
  bseCode: string | null;
  nseCode: string | null;
  industry: string;
  currentPrice: number | null;
  return1D: number | null;
  return1M: number | null;
  return1W: number | null;
  return3M: number | null;
  return6M: number | null;
  return1Y: number | null;
}