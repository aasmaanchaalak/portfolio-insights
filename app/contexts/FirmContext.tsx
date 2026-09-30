'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { Benchmark, DEFAULT_BENCHMARK, findBenchmark } from '../../lib/benchmarks';

// Firm branding + benchmark from Admin → Firm settings (served by /api/settings/firm).

export interface Firm {
  name: string;
  shortName: string;
  logoUrl: string | null;
  benchmark: Benchmark;
}

interface FirmContextType {
  firm: Firm;
  loaded: boolean;
  refresh: () => Promise<void>;
}

const FALLBACK: Firm = {
  name: 'Portfolio Insights',
  shortName: 'Portfolio Insights',
  logoUrl: null,
  benchmark: findBenchmark(DEFAULT_BENCHMARK),
};

const FirmContext = createContext<FirmContextType | null>(null);

export function FirmProvider({ children }: { children: ReactNode }) {
  const [firm, setFirm] = useState<Firm>(FALLBACK);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/firm');
      if (res.ok) setFirm(await res.json());
    } catch (error) {
      console.error('Failed to load firm settings:', error);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <FirmContext.Provider value={{ firm, loaded, refresh }}>
      {children}
    </FirmContext.Provider>
  );
}

export function useFirm() {
  const context = useContext(FirmContext);
  if (!context) {
    throw new Error('useFirm must be used within FirmProvider');
  }
  return context;
}

/** The firm's logo, or its name as a text wordmark when no logo is set. */
export function FirmLogo({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const { firm, loaded } = useFirm();
  if (!loaded) return <span className={className} style={style} />;
  if (firm.logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={className} style={style} src={firm.logoUrl} alt={firm.name} />;
  }
  return (
    <span className={`${className ?? ''} firm-wordmark`} style={style}>{firm.name}</span>
  );
}
