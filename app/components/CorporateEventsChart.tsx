'use client';

import React, { useState, useRef, useCallback } from 'react';

interface PricePoint {
  date: string; // YYYY-MM-DD
  close: number;
}

interface Announcement {
  date: string; // YYYY-MM-DD
  subject: string;
  details: string;
  attachment: string;
}

const MONTH_MAP: Record<string, string> = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
};

const COLORS = [
  '#e63946', '#2a9d8f', '#e9a400', '#f4a261', '#264653', '#6a4c93',
  '#606c38', '#bc6c25', '#7209b7', '#3a86ff', '#fb5607', '#0077b6',
];

function parseNSEDate(raw: string): string {
  const s = raw.replace(/"/g, '').trim();
  const datePart = s.split(' ')[0]; // "09-Apr-2026"
  const parts = datePart.split('-');
  if (parts.length !== 3) return '';
  const [day, mon, year] = parts;
  const m = MONTH_MAP[mon];
  if (!m) return '';
  return `${year}-${m}-${day.padStart(2, '0')}`;
}

function parsePrice(raw: string): number {
  return parseFloat(raw.replace(/[",]/g, '')) || 0;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parsePriceCSV(text: string): PricePoint[] {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]).map(h => h.replace(/"/g, '').trim().toUpperCase());
  const dateIdx = headers.findIndex(h => h === 'DATE');
  const closeIdx = headers.findIndex(h => h === 'CLOSE');
  if (dateIdx < 0 || closeIdx < 0) return [];

  const points: PricePoint[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    const date = parseNSEDate(cols[dateIdx] || '');
    const close = parsePrice(cols[closeIdx] || '');
    if (date && close > 0) points.push({ date, close });
  }
  // NSE exports newest first — sort ASC
  return points.sort((a, b) => a.date.localeCompare(b.date));
}

function parseAnnouncementsCSV(text: string): Announcement[] {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]).map(h => h.replace(/"/g, '').trim().toUpperCase());
  const subjectIdx = headers.findIndex(h => h === 'SUBJECT');
  const detailsIdx = headers.findIndex(h => h === 'DETAILS');
  const dateIdx = headers.findIndex(h => h.includes('BROADCAST'));
  const attachIdx = headers.findIndex(h => h === 'ATTACHMENT');
  if (subjectIdx < 0 || dateIdx < 0) return [];

  const items: Announcement[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    const date = parseNSEDate(cols[dateIdx] || '');
    const subject = (cols[subjectIdx] || '').replace(/"/g, '').trim();
    const details = (cols[detailsIdx] || '').replace(/"/g, '').trim();
    const attachment = (cols[attachIdx] || '').replace(/"/g, '').trim();
    if (date && subject) items.push({ date, subject, details, attachment });
  }
  return items;
}

const SVG_W = 800;
const SVG_H = 320;
const PAD = { top: 28, right: 24, bottom: 36, left: 56 };
const CHART_W = SVG_W - PAD.left - PAD.right;
const CHART_H = SVG_H - PAD.top - PAD.bottom;

export function CorporateEventsChart() {
  const [priceData, setPriceData] = useState<PricePoint[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [enabledCategories, setEnabledCategories] = useState<Set<string>>(new Set());
  const [priceFileName, setPriceFileName] = useState('');
  const [annFileName, setAnnFileName] = useState('');
  const [tooltip, setTooltip] = useState<{ x: number; y: number; items: Announcement[]; date: string } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleHide = () => {
    hideTimer.current = setTimeout(() => setTooltip(null), 220);
  };
  const cancelHide = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
  };

  const handlePriceFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPriceFileName(file.name);
    const reader = new FileReader();
    reader.onload = ev => {
      const data = parsePriceCSV(ev.target?.result as string);
      setPriceData(data);
    };
    reader.readAsText(file);
  }, []);

  const handleAnnFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAnnFileName(file.name);
    const reader = new FileReader();
    reader.onload = ev => {
      const data = parseAnnouncementsCSV(ev.target?.result as string);
      setAnnouncements(data);
      const cats = new Set(data.map(a => a.subject));
      setEnabledCategories(cats);
    };
    reader.readAsText(file);
  }, []);

  // Derived data
  const minPrice = priceData.length ? Math.min(...priceData.map(p => p.close)) * 0.98 : 0;
  const maxPrice = priceData.length ? Math.max(...priceData.map(p => p.close)) * 1.02 : 1;
  const priceRange = maxPrice - minPrice || 1;

  const xScale = (i: number) => PAD.left + (i / Math.max(priceData.length - 1, 1)) * CHART_W;
  const yScale = (price: number) => PAD.top + CHART_H - ((price - minPrice) / priceRange) * CHART_H;

  const dateToIndex = new Map(priceData.map((p, i) => [p.date, i]));
  const priceMinDate = priceData[0]?.date ?? '';
  const priceMaxDate = priceData[priceData.length - 1]?.date ?? '';

  // Group announcements by date, filter to price range
  const annByDate = new Map<string, Announcement[]>();
  for (const ann of announcements) {
    if (ann.date < priceMinDate || ann.date > priceMaxDate) continue;
    if (!annByDate.has(ann.date)) annByDate.set(ann.date, []);
    annByDate.get(ann.date)!.push(ann);
  }

  // Categories for visible announcements
  const allCats = Array.from(new Set(announcements.map(a => a.subject)));
  const catColor = new Map(allCats.map((c, i) => [c, COLORS[i % COLORS.length]]));

  // Price line path
  const linePath = priceData.map((p, i) =>
    `${i === 0 ? 'M' : 'L'}${xScale(i).toFixed(1)},${yScale(p.close).toFixed(1)}`
  ).join(' ');

  // X-axis labels: ~8 evenly spaced
  const xLabels: { i: number; label: string }[] = [];
  if (priceData.length > 1) {
    const step = Math.max(1, Math.floor(priceData.length / 8));
    for (let i = 0; i < priceData.length; i += step) {
      const d = priceData[i].date; // YYYY-MM-DD
      xLabels.push({ i, label: `${d.slice(8)}/${d.slice(5, 7)}` });
    }
    const last = priceData.length - 1;
    if (xLabels[xLabels.length - 1]?.i !== last) {
      const d = priceData[last].date;
      xLabels.push({ i: last, label: `${d.slice(8)}/${d.slice(5, 7)}` });
    }
  }

  // Y-axis labels: 5 evenly spaced
  const yLabels = Array.from({ length: 5 }, (_, i) => {
    const price = minPrice + (priceRange * i) / 4;
    return { price, y: yScale(price) };
  });

  const handleSvgMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!priceData.length || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = SVG_W / rect.width;
    const svgX = (e.clientX - rect.left) * scaleX;
    const svgY = (e.clientY - rect.top) * (SVG_H / rect.height);

    if (svgX < PAD.left || svgX > PAD.left + CHART_W) { setTooltip(null); return; }

    // Find nearest date
    const fraction = (svgX - PAD.left) / CHART_W;
    const idx = Math.round(fraction * (priceData.length - 1));
    const clampedIdx = Math.max(0, Math.min(priceData.length - 1, idx));
    const hovDate = priceData[clampedIdx].date;

    // Check if there are enabled announcements near this date
    // Look ±3 pixels worth of dates
    const pixPerDay = CHART_W / (priceData.length - 1);
    const daysWindow = Math.ceil(8 / Math.max(pixPerDay, 0.5));
    let bestItems: Announcement[] = [];
    let bestDate = '';
    for (let di = -daysWindow; di <= daysWindow; di++) {
      const ni = clampedIdx + di;
      if (ni < 0 || ni >= priceData.length) continue;
      const d = priceData[ni].date;
      const items = (annByDate.get(d) || []).filter(a => enabledCategories.has(a.subject));
      if (items.length > bestItems.length) { bestItems = items; bestDate = d; }
    }

    if (bestItems.length) {
      const dateIdx2 = dateToIndex.get(bestDate) ?? clampedIdx;
      setTooltip({ x: xScale(dateIdx2), y: svgY, items: bestItems, date: bestDate });
    } else {
      setTooltip(null);
    }
  }, [priceData, annByDate, enabledCategories, dateToIndex, xScale]);

  const toggleCategory = (cat: string) => {
    setEnabledCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };

  const inRangeAnnCount = Array.from(annByDate.values()).flat().length;

  return (
    <div className="chart-card">
      {/* Upload row */}
      <div className="events-upload-row">
        <div className="events-upload-box">
          <label htmlFor="price-csv">Price History CSV</label>
          <input type="file" id="price-csv" accept=".csv" onChange={handlePriceFile} />
          {priceFileName && <div style={{ fontSize: '0.75rem', color: 'var(--secondary-text-color)', marginTop: '0.25rem' }}>{priceFileName}</div>}
        </div>
        <div className="events-upload-box">
          <label htmlFor="ann-csv">Corporate Announcements CSV</label>
          <input type="file" id="ann-csv" accept=".csv" onChange={handleAnnFile} />
          {annFileName && <div style={{ fontSize: '0.75rem', color: 'var(--secondary-text-color)', marginTop: '0.25rem' }}>{annFileName}</div>}
        </div>
      </div>

      {/* Status */}
      {(priceData.length > 0 || announcements.length > 0) && (
        <div className="events-status">
          {priceData.length > 0 && `${priceData.length} trading days`}
          {priceData.length > 0 && announcements.length > 0 && ' · '}
          {announcements.length > 0 && `${announcements.length} announcements (${inRangeAnnCount} in range)`}
        </div>
      )}

      {/* Chart */}
      {priceData.length === 0 ? (
        <div className="empty-chart-state">Upload the price CSV to view the chart</div>
      ) : (
        <div style={{ position: 'relative' }}>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
            style={{ width: '100%', height: 'auto', display: 'block' }}
            onMouseMove={handleSvgMouseMove}
            onMouseLeave={scheduleHide}
          >
            {/* Grid lines */}
            {yLabels.map(({ price, y }) => (
              <g key={price}>
                <line x1={PAD.left} y1={y} x2={PAD.left + CHART_W} y2={y}
                  stroke="var(--border-color)" strokeWidth="0.5" />
                <text x={PAD.left - 6} y={y + 4} textAnchor="end"
                  fontSize="10" fill="var(--secondary-text-color)">
                  {price.toFixed(0)}
                </text>
              </g>
            ))}

            {/* X-axis labels */}
            {xLabels.map(({ i, label }) => (
              <text key={i} x={xScale(i)} y={SVG_H - 6} textAnchor="middle"
                fontSize="10" fill="var(--secondary-text-color)">{label}</text>
            ))}

            {/* Area fill */}
            {priceData.length > 1 && (
              <path
                d={`${linePath} L${xScale(priceData.length - 1).toFixed(1)},${(PAD.top + CHART_H).toFixed(1)} L${PAD.left.toFixed(1)},${(PAD.top + CHART_H).toFixed(1)} Z`}
                fill="var(--accent-color)" fillOpacity="0.08"
              />
            )}

            {/* Price line */}
            {priceData.length > 1 && (
              <path d={linePath} fill="none" stroke="var(--accent-color)" strokeWidth="1.5" />
            )}

            {/* Announcement markers */}
            {Array.from(annByDate.entries()).map(([date, items]) => {
              const visibleItems = items.filter(a => enabledCategories.has(a.subject));
              if (!visibleItems.length) return null;
              const idx = dateToIndex.get(date);
              if (idx === undefined) {
                // Date not exactly in price data — find nearest
                const nearest = priceData.reduce((best, p, i) =>
                  Math.abs(p.date.localeCompare(date)) < Math.abs(priceData[best].date.localeCompare(date)) ? i : best, 0);
                const x = xScale(nearest);
                const color = catColor.get(visibleItems[0].subject) || '#888';
                return <MarkerLine key={date} x={x} top={PAD.top} bottom={PAD.top + CHART_H} color={color} multiColor={visibleItems.length > 1 ? visibleItems.map(a => catColor.get(a.subject) || '#888') : undefined} />;
              }
              const x = xScale(idx);
              const color = catColor.get(visibleItems[0].subject) || '#888';
              return <MarkerLine key={date} x={x} top={PAD.top} bottom={PAD.top + CHART_H} color={color} multiColor={visibleItems.length > 1 ? visibleItems.map(a => catColor.get(a.subject) || '#888') : undefined} />;
            })}

            {/* Axes */}
            <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + CHART_H}
              stroke="var(--border-color)" strokeWidth="1" />
            <line x1={PAD.left} y1={PAD.top + CHART_H} x2={PAD.left + CHART_W} y2={PAD.top + CHART_H}
              stroke="var(--border-color)" strokeWidth="1" />
          </svg>

          {/* Tooltip */}
          {tooltip && (
            <div className="events-tooltip" onMouseEnter={cancelHide} onMouseLeave={() => setTooltip(null)} style={{
              left: `${Math.min(tooltip.x / SVG_W * 100, 72)}%`,
              top: 8,
            }}>
              <div className="events-tooltip-date">{tooltip.date}</div>
              {tooltip.items.map((item, i) => (
                <div key={i} className="events-tooltip-item">
                  <div className="events-tooltip-subject" style={{ color: catColor.get(item.subject) }}>
                    {item.subject}
                  </div>
                  {item.details && (
                    <div className="events-tooltip-details">
                      {item.details.length > 140 ? item.details.slice(0, 140) + '…' : item.details}
                    </div>
                  )}
                  {item.attachment && (
                    <a href={item.attachment} target="_blank" rel="noreferrer"
                      style={{ fontSize: '0.72rem', color: 'var(--accent-color)', pointerEvents: 'all' }}>
                      View attachment ↗
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Category filter */}
      {allCats.length > 0 && (
        <div style={{ marginTop: '1rem' }}>
          <div className="events-select-btns">
            <button className="pipeline-btn-secondary" style={{ padding: '0.2rem 0.625rem', fontSize: '0.8rem' }}
              onClick={() => setEnabledCategories(new Set(allCats))}>Select all</button>
            <button className="pipeline-btn-secondary" style={{ padding: '0.2rem 0.625rem', fontSize: '0.8rem' }}
              onClick={() => setEnabledCategories(new Set())}>Deselect all</button>
          </div>
          <div className="events-categories">
            {allCats.map(cat => {
              const color = catColor.get(cat) || '#888';
              const count = announcements.filter(a => a.subject === cat).length;
              const active = enabledCategories.has(cat);
              return (
                <div key={cat} className={`events-category-pill${active ? ' active' : ''}`}
                  style={{ color: active ? color : 'var(--secondary-text-color)', borderColor: active ? color : undefined }}
                  onClick={() => toggleCategory(cat)}>
                  <span className="events-category-dot" style={{ background: active ? color : 'var(--border-color)' }} />
                  <input type="checkbox" checked={active} onChange={() => toggleCategory(cat)}
                    style={{ display: 'none' }} />
                  <span>{cat}</span>
                  <span style={{ opacity: 0.6, fontSize: '0.72rem' }}>({count})</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function MarkerLine({ x, top, bottom, color, multiColor }: {
  x: number; top: number; bottom: number; color: string; multiColor?: string[];
}) {
  if (multiColor && multiColor.length > 1) {
    const segH = (bottom - top) / multiColor.length;
    return (
      <g>
        {multiColor.map((c, i) => (
          <line key={i} x1={x} y1={top + i * segH} x2={x} y2={top + (i + 1) * segH}
            stroke={c} strokeWidth="1.5" strokeDasharray="3,2" opacity="0.8" />
        ))}
        <circle cx={x} cy={top} r={3} fill={color} />
      </g>
    );
  }
  return (
    <g>
      <line x1={x} y1={top} x2={x} y2={bottom}
        stroke={color} strokeWidth="1.5" strokeDasharray="3,2" opacity="0.8" />
      <circle cx={x} cy={top} r={3} fill={color} />
    </g>
  );
}
