// Firm branding + benchmark, stored in app_settings and edited from the Admin
// panel. Read on every page render (layout metadata, manifest), so it's cached
// in-process; writes on this instance clear the cache immediately.

import { createHash } from 'crypto';
import { getSetting, setSetting, ANALYST_MIN_INVESTED_KEY, DEFAULT_ANALYST_MIN_INVESTED, clearAnalystThresholdCache } from './queries';
import { Benchmark, DEFAULT_BENCHMARK, findBenchmark } from './benchmarks';

const KEYS = {
  name: 'firm_name',
  shortName: 'firm_short_name',
  logo: 'firm_logo',          // data: URL of an uploaded image, or a /public path
  icon: 'firm_icon',          // data: URL of the square app / home-screen / notification icon
  benchmark: 'benchmark_index',
  foPortfolio: 'fo_portfolio',
  analystMinInvested: ANALYST_MIN_INVESTED_KEY,
} as const;

export const DEFAULT_FIRM_NAME = 'Portfolio Insights';
export const MAX_LOGO_BYTES = 500 * 1024;
export const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
// The icon is rasterised into PNGs (app/icon.tsx), which only takes PNG and JPEG.
export const ICON_TYPES = ['image/png', 'image/jpeg'];

export interface FirmSettings {
  name: string;
  shortName: string;
  logoUrl: string | null;     // what an <img src> should point at
  iconUrl: string | null;
  benchmark: Benchmark;
}

interface Raw {
  name: string | null;
  shortName: string | null;
  logo: string | null;
  icon: string | null;
  benchmark: string | null;
}

const CACHE_MS = 60_000;
let cache: { raw: Raw; at: number } | null = null;

async function loadRaw(): Promise<Raw> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.raw;
  const [name, shortName, logo, icon, benchmark] = await Promise.all([
    getSetting(KEYS.name),
    getSetting(KEYS.shortName),
    getSetting(KEYS.logo),
    getSetting(KEYS.icon),
    getSetting(KEYS.benchmark),
  ]);
  const raw = { name, shortName, logo, icon, benchmark };
  cache = { raw, at: Date.now() };
  return raw;
}

function imageUrlFor(image: string | null, kind: 'logo' | 'icon'): string | null {
  if (!image) return null;
  if (!image.startsWith('data:')) return image;
  // Uploaded images are served by /api/settings/firm-logo; the hash busts caches on change.
  const v = createHash('sha1').update(image).digest('hex').slice(0, 10);
  return `/api/settings/firm-logo?${kind === 'icon' ? 'kind=icon&' : ''}v=${v}`;
}

export async function getFirmSettings(): Promise<FirmSettings> {
  const raw = await loadRaw();
  const name = raw.name?.trim() || DEFAULT_FIRM_NAME;
  return {
    name,
    shortName: raw.shortName?.trim() || name,
    logoUrl: imageUrlFor(raw.logo, 'logo'),
    iconUrl: imageUrlFor(raw.icon, 'icon'),
    benchmark: findBenchmark(raw.benchmark),
  };
}

/** Never throws — page renders fall back to defaults if the DB is unreachable. */
export async function getFirmSettingsSafe(): Promise<FirmSettings> {
  try {
    return await getFirmSettings();
  } catch (error) {
    console.error('Failed to load firm settings:', error);
    return { name: DEFAULT_FIRM_NAME, shortName: DEFAULT_FIRM_NAME, logoUrl: null, iconUrl: null, benchmark: findBenchmark(DEFAULT_BENCHMARK) };
  }
}

/** The uploaded logo (or icon) as bytes, or null when there's none (or it's a /public path). */
export async function getFirmLogoImage(kind: 'logo' | 'icon' = 'logo'): Promise<{ type: string; data: Buffer } | null> {
  const raw = await loadRaw();
  const m = raw[kind]?.match(/^data:([^;,]+);base64,(.*)$/);
  if (!m) return null;
  return { type: m[1], data: Buffer.from(m[2], 'base64') };
}

export interface FirmSettingsUpdate {
  name?: string;
  shortName?: string;
  benchmark?: string;
  logo?: string | null;       // data: URL to replace, null to remove
  icon?: string | null;
}

export async function updateFirmSettings(update: FirmSettingsUpdate): Promise<FirmSettings> {
  const writes: Promise<void>[] = [];
  if (update.name !== undefined) writes.push(setSetting(KEYS.name, update.name.trim()));
  if (update.shortName !== undefined) writes.push(setSetting(KEYS.shortName, update.shortName.trim()));
  if (update.benchmark !== undefined) writes.push(setSetting(KEYS.benchmark, update.benchmark));
  if (update.logo !== undefined) writes.push(setSetting(KEYS.logo, update.logo ?? ''));
  if (update.icon !== undefined) writes.push(setSetting(KEYS.icon, update.icon ?? ''));
  await Promise.all(writes);
  cache = null;
  return getFirmSettings();
}

// ---------- operations settings (admin-only, not part of the public firm settings) ----------

export interface OpsSettings {
  foPortfolio: string;          // PF Data portfolio whose holdings sit in the F&O account ('' = none)
  analystMinInvested: number;   // ₹; analysts don't see holdings below this
}

let opsCache: { ops: OpsSettings; at: number } | null = null;

export async function getOpsSettings(): Promise<OpsSettings> {
  if (opsCache && Date.now() - opsCache.at < CACHE_MS) return opsCache.ops;
  const [fo, min] = await Promise.all([getSetting(KEYS.foPortfolio), getSetting(KEYS.analystMinInvested)]);
  const parsed = min != null && min !== '' ? Number(min) : NaN;
  const ops = {
    foPortfolio: fo?.trim() || '',
    analystMinInvested: Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_ANALYST_MIN_INVESTED,
  };
  opsCache = { ops, at: Date.now() };
  return ops;
}

export async function updateOpsSettings(update: Partial<OpsSettings>): Promise<OpsSettings> {
  const writes: Promise<void>[] = [];
  if (update.foPortfolio !== undefined) writes.push(setSetting(KEYS.foPortfolio, update.foPortfolio.trim()));
  if (update.analystMinInvested !== undefined) writes.push(setSetting(KEYS.analystMinInvested, String(update.analystMinInvested)));
  await Promise.all(writes);
  opsCache = null;
  clearAnalystThresholdCache();
  return getOpsSettings();
}
