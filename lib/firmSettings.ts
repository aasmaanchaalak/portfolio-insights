// Firm branding + benchmark, stored in app_settings and edited from the Admin
// panel. Read on every page render (layout metadata, manifest), so it's cached
// in-process; writes on this instance clear the cache immediately.

import { createHash } from 'crypto';
import { getSetting, setSetting } from './queries';
import { Benchmark, DEFAULT_BENCHMARK, findBenchmark } from './benchmarks';

const KEYS = {
  name: 'firm_name',
  shortName: 'firm_short_name',
  logo: 'firm_logo',          // data: URL of an uploaded image, or a /public path
  benchmark: 'benchmark_index',
} as const;

export const DEFAULT_FIRM_NAME = 'Portfolio Insights';
export const MAX_LOGO_BYTES = 500 * 1024;
export const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

export interface FirmSettings {
  name: string;
  shortName: string;
  logoUrl: string | null;     // what an <img src> should point at
  benchmark: Benchmark;
}

interface Raw {
  name: string | null;
  shortName: string | null;
  logo: string | null;
  benchmark: string | null;
}

const CACHE_MS = 60_000;
let cache: { raw: Raw; at: number } | null = null;

async function loadRaw(): Promise<Raw> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.raw;
  const [name, shortName, logo, benchmark] = await Promise.all([
    getSetting(KEYS.name),
    getSetting(KEYS.shortName),
    getSetting(KEYS.logo),
    getSetting(KEYS.benchmark),
  ]);
  const raw = { name, shortName, logo, benchmark };
  cache = { raw, at: Date.now() };
  return raw;
}

function logoUrlFor(logo: string | null): string | null {
  if (!logo) return null;
  if (!logo.startsWith('data:')) return logo;
  // Uploaded images are served by /api/settings/firm-logo; the hash busts caches on change.
  const v = createHash('sha1').update(logo).digest('hex').slice(0, 10);
  return `/api/settings/firm-logo?v=${v}`;
}

export async function getFirmSettings(): Promise<FirmSettings> {
  const raw = await loadRaw();
  const name = raw.name?.trim() || DEFAULT_FIRM_NAME;
  return {
    name,
    shortName: raw.shortName?.trim() || name,
    logoUrl: logoUrlFor(raw.logo),
    benchmark: findBenchmark(raw.benchmark),
  };
}

/** Never throws — page renders fall back to defaults if the DB is unreachable. */
export async function getFirmSettingsSafe(): Promise<FirmSettings> {
  try {
    return await getFirmSettings();
  } catch (error) {
    console.error('Failed to load firm settings:', error);
    return { name: DEFAULT_FIRM_NAME, shortName: DEFAULT_FIRM_NAME, logoUrl: null, benchmark: findBenchmark(DEFAULT_BENCHMARK) };
  }
}

/** The uploaded logo as bytes, or null when there's none (or it's a /public path). */
export async function getFirmLogoImage(): Promise<{ type: string; data: Buffer } | null> {
  const { logo } = await loadRaw();
  const m = logo?.match(/^data:([^;,]+);base64,(.*)$/);
  if (!m) return null;
  return { type: m[1], data: Buffer.from(m[2], 'base64') };
}

export interface FirmSettingsUpdate {
  name?: string;
  shortName?: string;
  benchmark?: string;
  logo?: string | null;       // data: URL to replace, null to remove
}

export async function updateFirmSettings(update: FirmSettingsUpdate): Promise<FirmSettings> {
  const writes: Promise<void>[] = [];
  if (update.name !== undefined) writes.push(setSetting(KEYS.name, update.name.trim()));
  if (update.shortName !== undefined) writes.push(setSetting(KEYS.shortName, update.shortName.trim()));
  if (update.benchmark !== undefined) writes.push(setSetting(KEYS.benchmark, update.benchmark));
  if (update.logo !== undefined) writes.push(setSetting(KEYS.logo, update.logo ?? ''));
  await Promise.all(writes);
  cache = null;
  return getFirmSettings();
}
