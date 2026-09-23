'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  PipelineIdea, PipelineNote, PipelineStage, PipelinePriority, PipelineOutcome, PipelineAlert, GuidanceEntry,
} from '../../../types/pipeline';
import { useAuth } from '../../contexts/AuthContext';
import './pipeline.css';
import { DrawerTabs, DrawerTab } from '../drawer/DrawerTabs';
import { ForwardMetricsTab } from '../thesis/ForwardMetricsTab';
import { ThesisTab } from '../thesis/ThesisTab';
import { PortfolioHistoryTab, PortfolioHistory, hasPortfolioHistory } from './PortfolioHistoryTab';
import '../drawer/drawer.css';
import '../thesis/thesis.css';

// Team members are fetched from /api/team-members at runtime

const GUIDANCE_METRICS = ['Revenue', 'EBITDA', 'PAT', 'Market Cap', 'Sales Volume', 'Margin %', 'Other'];

const STALE_DAYS = 45;
const EVENT_WINDOW_DAYS = 14;

const STAGES: { id: PipelineStage; label: string; def: string }[] = [
  { id: 'new', label: 'New', def: 'Captured, not yet looked at' },
  { id: 'research', label: 'Researching', def: 'Actively doing the work' },
  { id: 'waiting', label: 'Waiting', def: 'Thesis done — waiting for a price or event' },
  { id: 'closed', label: 'Closed', def: 'Bought, passed or exited' },
];

const PRIORITIES: { id: PipelinePriority; label: string }[] = [
  { id: 'high', label: 'High' },
  { id: 'medium', label: 'Medium' },
  { id: 'low', label: 'Low' },
];

// ───────────────────────── HELPERS ─────────────────────────

/** ₹ with Indian digit grouping; whole rupees from ₹1,000 up, else one decimal. */
function rs(n: number | null): string {
  if (n === null) return '—';
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: Math.abs(n) >= 1000 ? 0 : 1 })}`;
}

/** Signed percentage with a true minus sign. */
function signedPct(v: number): string {
  return `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}%`;
}

function pctChange(from: number | null, to: number | null): number | null {
  return from && to !== null ? ((to - from) / from) * 100 : null;
}

function daysSince(dateStr: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000));
}

function agoLabel(dateStr: string): string {
  const d = daysSince(dateStr);
  return d === 0 ? 'today' : `${d}d ago`;
}

function daysUntil(dateStr: string): number {
  const d = new Date(dateStr.split('T')[0] + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

function dueLabel(days: number): string {
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days > 1) return `in ${days} days`;
  return days === -1 ? '1 day ago' : `${-days} days ago`;
}

/**
 * Ticker from what was typed or pasted: a Screener link
 * (screener.in/company/544684/ or /company/KAYNES/consolidated/) gives its
 * company code — an NSE symbol or a numeric BSE code — anything else is
 * taken as the ticker itself.
 */
function parseTickerInput(raw: string): string {
  const m = raw.match(/screener\.in\/company\/([^/?#\s]+)/i);
  const code = m ? decodeURIComponent(m[1]) : raw;
  return code.trim().toUpperCase();
}

const OTHER_SOURCE = '__other';

const QUICK_SOURCES: { label: string; value: string }[] = [
  { label: 'Concall', value: 'Concall' },
  { label: 'Qtrly', value: 'Quarterly results' },
  { label: 'PPT', value: 'Investor PPT' },
  { label: 'Broker', value: 'Broker note' },
  { label: 'IPO', value: 'IPO' },
  { label: 'News', value: 'News' },
];

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '—';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function resolveAuthor(userName: string | undefined, teamMembers: string[]): string {
  if (!userName || teamMembers.length === 0) return teamMembers[0] || '';
  const lower = userName.toLowerCase();
  // Exact match first
  const exact = teamMembers.find(m => m.toLowerCase() === lower);
  if (exact) return exact;
  // First-word match (e.g. "Aditya Agarwal" → "Aditya")
  const firstName = lower.split(' ')[0];
  const partial = teamMembers.find(m => m.toLowerCase() === firstName || lower.startsWith(m.toLowerCase()));
  return partial || teamMembers[0];
}

function isHit(i: PipelineIdea): boolean {
  return i.alert?.type === 'price' && i.currentPrice !== null && i.currentPrice <= i.alert.value;
}

/** Days until an event alert is due (negative once past); null without a due date. */
function eventDays(i: PipelineIdea): number | null {
  return i.alert?.type === 'event' && i.alert.dueDate ? daysUntil(i.alert.dueDate) : null;
}

function isStale(i: PipelineIdea): boolean {
  return (i.stage === 'new' || i.stage === 'research') && daysSince(i.lastActivityAt) > STALE_DAYS;
}

/** Exited from the portfolio and closed without a Bought/Pass decision. */
function isExited(i: PipelineIdea): boolean {
  return i.stage === 'closed' && i.tag === 'Exited' && !i.outcome;
}

function whyText(i: PipelineIdea): string {
  return i.why?.trim() || 'No reason noted yet';
}

async function patchIdea(id: string, body: Record<string, unknown>): Promise<PipelineIdea> {
  const res = await fetch(`/api/pipeline/ideas/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('Save failed');
  return (await res.json()).idea;
}

/**
 * Runs `fn` once `delay` ms have passed without another call. A call still
 * pending on unmount runs immediately, so closing the panel never drops an edit.
 */
function useDebounced<T extends unknown[]>(fn: (...args: T) => void, delay: number) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingArgs = useRef<T | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    if (pendingArgs.current) fnRef.current(...pendingArgs.current);
  }, []);
  return useMemo(() => {
    const run = (...args: T) => {
      if (timer.current) clearTimeout(timer.current);
      pendingArgs.current = args;
      timer.current = setTimeout(() => {
        pendingArgs.current = null;
        fnRef.current(...args);
      }, delay);
    };
    const cancel = () => {
      if (timer.current) clearTimeout(timer.current);
      pendingArgs.current = null;
    };
    return Object.assign(run, { cancel });
  }, [delay]);
}

// ───────────────────────── NEEDS ATTENTION ─────────────────────────

interface AttentionRow {
  key: string;
  kind: string;
  amber?: boolean;
  name: string;
  detail: string;
  cta: string;
  onClick: () => void;
}

function buildAttention(
  pool: PipelineIdea[],
  staleOnly: boolean,
  onOpen: (idea: PipelineIdea) => void,
  onToggleStale: () => void,
): AttentionRow[] {
  const rows: AttentionRow[] = [];
  pool.filter(isHit).forEach(i => rows.push({
    key: `t-${i.id}`,
    kind: 'Trigger hit',
    amber: true,
    name: i.companyName,
    detail: `Now ${rs(i.currentPrice)}, below your ${rs(i.alert?.type === 'price' ? i.alert.value : null)} alert · ${whyText(i)}`,
    cta: 'Decide',
    onClick: () => onOpen(i),
  }));
  pool
    .filter(i => i.stage !== 'closed' || isExited(i))
    .map(i => ({ idea: i, days: eventDays(i) }))
    .filter((e): e is { idea: PipelineIdea; days: number } => e.days !== null && e.days <= EVENT_WINDOW_DAYS)
    .sort((a, b) => a.days - b.days)
    .forEach(({ idea, days }) => rows.push({
      key: `e-${idea.id}`,
      kind: days < 0 ? 'Event passed' : days === 0 ? 'Event today' : `Event in ${days}d`,
      name: idea.companyName,
      detail: `${(idea.alert?.type === 'event' && idea.alert.text) || 'Event'} — review the thesis before it lands`,
      cta: 'Open',
      onClick: () => onOpen(idea),
    }));
  const stale = pool.filter(isStale);
  if (stale.length > 0) rows.push({
    key: 'stale',
    kind: `${stale.length} stale`,
    name: `${stale.length === 1 ? '1 idea' : `${stale.length} ideas`} with no update in ${STALE_DAYS}+ days`,
    detail: stale.map(i => i.companyName).join(', '),
    cta: staleOnly ? 'Show all' : 'Show only these',
    onClick: onToggleStale,
  });
  return rows;
}

function NeedsAttention({ rows }: { rows: AttentionRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section className="pl-attention">
      <div className="pl-section-head">
        <h2>Needs attention</h2>
        <span className="pl-section-note">Triggers, upcoming events and stale ideas</span>
      </div>
      {rows.map(r => (
        <div key={r.key} className="pl-attn-row" onClick={r.onClick}>
          <span className={`pl-attn-badge${r.amber ? ' is-amber' : ''}`}>{r.kind}</span>
          <span className="pl-attn-name">{r.name}</span>
          <span className="pl-attn-detail">{r.detail}</span>
          <span className="pl-attn-cta">{r.cta} ›</span>
        </div>
      ))}
    </section>
  );
}

// ───────────────────────── STAGE LIST ─────────────────────────

function AlertCell({ idea }: { idea: PipelineIdea }) {
  // Exited ideas keep their alert as a re-entry watch; show it when set.
  if (isExited(idea) && !idea.alert) {
    const since = pctChange(idea.closedPrice, idea.currentPrice);
    return (
      <>
        <div className="pl-alert-main is-closed">Exited</div>
        {since !== null && <div className="pl-alert-sub">price since exit {signedPct(since)}</div>}
      </>
    );
  }
  if (idea.stage === 'closed' && !isExited(idea)) {
    if (idea.outcome === 'bought') {
      return <><div className="pl-alert-main is-bought">Bought</div><div className="pl-alert-sub">moved to portfolio</div></>;
    }
    const since = pctChange(idea.closedPrice, idea.currentPrice);
    return (
      <>
        <div className="pl-alert-main is-closed">{idea.outcome === 'passed' ? 'Passed' : 'Closed'}</div>
        {since !== null && <div className="pl-alert-sub">price since {idea.outcome === 'passed' ? 'pass' : 'close'} {signedPct(since)}</div>}
      </>
    );
  }
  const a = idea.alert;
  if (a?.type === 'price') {
    const hit = isHit(idea);
    return (
      <>
        <div className="pl-alert-main">Price below {rs(a.value)}</div>
        {hit
          ? <div className="pl-alert-sub is-hit">Hit — now {rs(idea.currentPrice)}</div>
          : idea.currentPrice !== null && <div className="pl-alert-sub">{(((idea.currentPrice - a.value) / idea.currentPrice) * 100).toFixed(1)}% away</div>}
      </>
    );
  }
  if (a?.type === 'event') {
    const days = eventDays(idea);
    return (
      <>
        <div className="pl-alert-main">{a.text || 'Event'}</div>
        <div className="pl-alert-sub">{days === null ? 'no date set' : dueLabel(days)}</div>
      </>
    );
  }
  if (idea.stage === 'new') return <div className="pl-alert-main is-dash">—</div>;
  return <div className="pl-alert-main is-set">Set an alert</div>;
}

function IdeaRow({ idea, open, onOpen }: { idea: PipelineIdea; open: boolean; onOpen: () => void }) {
  const chg = pctChange(idea.priceAtAdd, idea.currentPrice);
  const stale = isStale(idea);
  return (
    <div className={`pl-grid pl-row${open ? ' is-open' : ''}`} onClick={onOpen}>
      <div className="pl-idea">
        <span className={`pl-spine prio-${idea.priority}`} title={`${idea.priority[0].toUpperCase()}${idea.priority.slice(1)} priority`} />
        <div className="pl-idea-text">
          <div className="pl-idea-line">
            <span className="pl-idea-name">{idea.companyName || idea.ticker}</span>
            {idea.tag && <span className="pl-tag">{idea.tag}</span>}
          </div>
          <div className="pl-idea-ticker">{idea.ticker}</div>
        </div>
      </div>
      <span className="pl-why">{whyText(idea)}</span>
      <div className="pl-since">
        {chg !== null ? (
          <>
            <div className={`pl-chg ${chg >= 0 ? 'pos' : 'neg'}`}>{signedPct(chg)}</div>
            <div className="pl-price-line">{rs(idea.priceAtAdd)} → {rs(idea.currentPrice)}</div>
          </>
        ) : <div className="pl-alert-main is-dash">—</div>}
      </div>
      <div className="pl-alert"><AlertCell idea={idea} /></div>
      <div className="pl-owner">
        <span className="pl-tile">{initials(idea.owner)}</span>
        <span className="pl-owner-name">{idea.owner}</span>
      </div>
      <span className={`pl-updated${stale ? ' is-stale' : ''}`}>{agoLabel(idea.lastActivityAt)}</span>
    </div>
  );
}

function sortForGroup(list: PipelineIdea[]): PipelineIdea[] {
  return list.slice().sort((a, b) =>
    (Number(isHit(b)) - Number(isHit(a)))
    || (new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime()));
}

interface StageListProps {
  pool: PipelineIdea[];
  staleOnly: boolean;
  openId: string | null;
  onOpen: (idea: PipelineIdea) => void;
}

function StageList({ pool, staleOnly, openId, onOpen }: StageListProps) {
  const [showClosed, setShowClosed] = useState(false);
  return (
    <div className="pl-list-scroll">
      <div className="pl-list">
        <div className="pl-grid pl-colhead">
          <span>Idea</span>
          <span>Why</span>
          <span className="pl-right">Since added</span>
          <span>Alert</span>
          <span>Owner</span>
          <span className="pl-right">Updated</span>
        </div>
        {STAGES.map(s => {
          let list = pool.filter(i => i.stage === s.id);
          if (staleOnly) list = list.filter(isStale);
          if (staleOnly && list.length === 0) return null;
          const isClosed = s.id === 'closed';
          const collapsed = isClosed && !showClosed;
          return (
            <div key={s.id} className="pl-group">
              <div
                className={`pl-group-head${isClosed ? ' is-toggle' : ''}`}
                onClick={isClosed ? () => setShowClosed(v => !v) : undefined}
              >
                <h2>{s.label}</h2>
                <span className="pl-group-count">{list.length}</span>
                <span className="pl-group-def">{s.def}</span>
                {isClosed && <span className="pl-group-toggle">{showClosed ? 'Hide' : 'Show'}</span>}
              </div>
              {!collapsed && list.length === 0 && (
                <div className="pl-group-empty">{s.id === 'new' ? 'Nothing new — add an idea above.' : 'Nothing here.'}</div>
              )}
              {!collapsed && sortForGroup(list).map(idea => (
                <IdeaRow key={idea.id} idea={idea} open={idea.id === openId} onOpen={() => onOpen(idea)} />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ───────────────────────── PHONE LAYOUT ─────────────────────────
// Shown ≤767px instead of the header, quick add, attention block and grid.
// Tabs replace the stage groups; "Needs attention" lists each idea individually.

type MobileTab = 'attention' | PipelineStage;

function needsAttention(i: PipelineIdea): boolean {
  const days = eventDays(i);
  const eventDue = days !== null && days <= EVENT_WINDOW_DAYS && (i.stage !== 'closed' || isExited(i));
  return isHit(i) || eventDue || isStale(i);
}

/** Attention order: hit alerts, then events soonest first, then stale. */
function attentionRank(i: PipelineIdea): number {
  if (isHit(i)) return 0;
  const days = eventDays(i);
  if (days !== null && days <= EVENT_WINDOW_DAYS) return 1 + (days + 1000) / 10000;
  return 2;
}

function mobileBadge(i: PipelineIdea): { text: string; tone: 'amber' | 'grey' | 'pos' } | null {
  if (i.stage === 'closed' && !isExited(i)) {
    return i.outcome === 'bought' ? { text: 'Bought', tone: 'pos' } : { text: i.outcome === 'passed' ? 'Passed' : 'Closed', tone: 'grey' };
  }
  const a = i.alert;
  if (a?.type === 'price') {
    if (isHit(i)) return { text: `Hit · now ${rs(i.currentPrice)} < ${rs(a.value)}`, tone: 'amber' };
    const away = i.currentPrice ? ` · ${(((i.currentPrice - a.value) / i.currentPrice) * 100).toFixed(1)}% away` : '';
    return { text: `Below ${rs(a.value)}${away}`, tone: 'grey' };
  }
  if (a?.type === 'event') {
    const days = eventDays(i);
    const when = days === null ? '' : days < 0 ? ' · passed' : days === 0 ? ' today' : ` in ${days}d`;
    return { text: `${a.text || 'Event'}${when}`, tone: 'grey' };
  }
  if (isExited(i)) return { text: 'Exited', tone: 'grey' };
  return null;
}

interface MobilePipelineProps {
  pool: PipelineIdea[];
  activeCount: number;
  ownerScope: 'everyone' | 'mine';
  onToggleOwner: () => void;
  onOpen: (idea: PipelineIdea) => void;
  onAdd: () => void;
}

function MobilePipeline({ pool, activeCount, ownerScope, onToggleOwner, onOpen, onAdd }: MobilePipelineProps) {
  const attention = pool.filter(needsAttention);
  const [tab, setTab] = useState<MobileTab | null>(null);
  // Default to Needs attention when there is something in it, else New.
  const current: MobileTab = tab ?? (attention.length > 0 ? 'attention' : 'new');

  const tabs: { id: MobileTab; label: string; count: number }[] = [
    { id: 'attention', label: 'Needs attention', count: attention.length },
    ...STAGES.map(s => ({ id: s.id as MobileTab, label: s.label, count: pool.filter(i => i.stage === s.id).length })),
  ];

  const list = current === 'attention'
    ? sortForGroup(attention).sort((a, b) => attentionRank(a) - attentionRank(b))
    : sortForGroup(pool.filter(i => i.stage === current));

  const caption = current === 'attention'
    ? 'Triggers hit, events within 14 days, stale ideas'
    : STAGES.find(s => s.id === current)!.def;
  const emptyText = current === 'attention'
    ? 'Nothing needs attention.'
    : current === 'new' ? 'Nothing new — tap + Idea to add one.' : 'Nothing here.';

  return (
    <div className="plm">
      <div className="plm-header">
        <div className="plm-header-text">
          <h1 className="pl-title">Pipeline</h1>
          <div className="plm-subtitle">
            <span>{activeCount} active</span>
            <span>·</span>
            <span>{attention.length} need attention</span>
          </div>
        </div>
        <button type="button" className="pl-btn is-primary plm-add" onClick={onAdd}>+ Idea</button>
      </div>

      <div className="plm-tabs" role="tablist">
        {tabs.map(t => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={current === t.id}
            className={current === t.id ? 'active' : ''}
            onClick={() => setTab(t.id)}
          >
            {t.label}<span className="plm-tab-count">{t.count}</span>
          </button>
        ))}
      </div>

      <div className="plm-caption">
        <span className="plm-caption-text">{caption}</span>
        <button type="button" className="plm-owner" onClick={onToggleOwner}>
          {ownerScope === 'everyone' ? 'Mine' : 'Everyone'}
        </button>
      </div>

      <div className="plm-list">
        {list.length === 0 && <div className="plm-empty">{emptyText}</div>}
        {list.map(idea => {
          const chg = pctChange(idea.priceAtAdd, idea.currentPrice);
          const badge = mobileBadge(idea);
          const stale = isStale(idea);
          const stageLabel = STAGES.find(s => s.id === idea.stage)!.label;
          return (
            <div key={idea.id} className="plm-row" onClick={() => onOpen(idea)}>
              <span className={`pl-spine prio-${idea.priority}`} />
              <div className="plm-row-body">
                <div className="plm-row-top">
                  <span className="plm-name">{idea.companyName || idea.ticker}</span>
                  {chg !== null && <span className={`pl-chg ${chg >= 0 ? 'pos' : 'neg'} plm-chg`}>{signedPct(chg)}</span>}
                </div>
                <div className="plm-why">{whyText(idea)}</div>
                <div className="plm-row-bottom">
                  {badge && <span className={`plm-badge is-${badge.tone}`}>{badge.text}</span>}
                  <span className={`plm-meta${stale ? ' is-stale' : ''}`}>
                    {stageLabel} · {idea.owner} · {stale ? 'stale ' : ''}{agoLabel(idea.lastActivityAt)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ───────────────────────── DETAIL PANEL ─────────────────────────

interface Attachment {
  id: string;
  fileName: string;
  fileType: string;
  uploadedBy: string;
  uploadedAt: string;
  url: string;
}

interface TimelineEntry {
  key: string;
  who: string;
  at: string;
  text: string;
  system: boolean;
  tile: boolean;
  attachments: Attachment[];
  noteId?: string;
}

interface DetailPanelProps {
  idea: PipelineIdea;
  me: string;
  teamMembers: string[];
  isAdmin: boolean;
  onClose: () => void;
  onChange: (idea: PipelineIdea) => void;
  onDeleted: (id: string) => void;
}

function DetailPanel({ idea, me, teamMembers, isAdmin, onClose, onChange, onDeleted }: DetailPanelProps) {
  const [tab, setTab] = useState('overview');
  const [history, setHistory] = useState<PortfolioHistory | null>(null);
  const [notes, setNotes] = useState<PipelineNote[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [why, setWhy] = useState(whyText(idea));
  const [priceInput, setPriceInput] = useState(idea.alert?.type === 'price' ? String(idea.alert.value) : '');
  const [eventText, setEventText] = useState(idea.alert?.type === 'event' ? idea.alert.text : '');
  const [eventDue, setEventDue] = useState(idea.alert?.type === 'event' ? idea.alert.dueDate || '' : '');
  const [note, setNote] = useState('');
  const [pending, setPending] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [posting, setPosting] = useState(false);
  const [decision, setDecision] = useState<PipelineOutcome | null>(null);
  const [rationale, setRationale] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');

  const ideaRef = useRef(idea);
  ideaRef.current = idea;

  // Reset local drafts whenever a different idea is opened.
  useEffect(() => {
    setTab('overview');
    setWhy(whyText(idea));
    setPriceInput(idea.alert?.type === 'price' ? String(idea.alert.value) : '');
    setEventText(idea.alert?.type === 'event' ? idea.alert.text : '');
    setEventDue(idea.alert?.type === 'event' ? idea.alert.dueDate || '' : '');
    setNote('');
    setPending([]);
    setDecision(null);
    setRationale('');
    setConfirmDelete(false);
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idea.id]);

  const loadActivity = useCallback(() => {
    fetch(`/api/pipeline/ideas/${idea.id}/notes`)
      .then(r => r.json())
      .then(d => setNotes(d.notes || []))
      .catch(() => {});
  }, [idea.id]);

  useEffect(() => {
    loadActivity();
    setAttachments([]);
    fetch(`/api/attachments?module=pipeline&entityId=${encodeURIComponent(idea.id)}`)
      .then(r => r.json())
      .then(d => setAttachments(Array.isArray(d) ? d : []))
      .catch(() => {});
    // Data recorded while the stock was a holding, keyed by ticker.
    setHistory(null);
    fetch(`/api/pipeline/portfolio-history?ticker=${encodeURIComponent(idea.ticker)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => setHistory(d))
      .catch(() => {});
  }, [idea.id, idea.ticker, loadActivity]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const save = async (body: Record<string, unknown>, reloadActivity = false) => {
    setError('');
    try {
      const updated = await patchIdea(ideaRef.current.id, { ...body, actor: me });
      onChange(updated);
      if (reloadActivity) loadActivity();
    } catch {
      setError('Couldn’t save — check your connection and try again.');
    }
  };

  const saveWhy = useDebounced((v: string) => save({ why: v }), 700);
  const saveAlert = useDebounced((a: PipelineAlert | null) => save({ alert: a }), 700);

  const setAlertType = (type: 'price' | 'event' | 'none') => {
    saveAlert.cancel();
    if (type === 'none') {
      save({ alert: null });
    } else if (type === 'price') {
      const cur = idea.currentPrice;
      const v = cur ? Math.round(cur * 0.9) : null;
      setPriceInput(v !== null ? String(v) : '');
      if (v !== null) save({ alert: { type: 'price', value: v } });
      else onChange({ ...idea, alert: { type: 'price', value: 0 } });
    } else {
      setEventText('');
      setEventDue('');
      save({ alert: { type: 'event', text: '', dueDate: null } });
    }
  };

  const onPriceInput = (raw: string) => {
    const clean = raw.replace(/[^0-9.]/g, '');
    setPriceInput(clean);
    const v = parseFloat(clean);
    if (v > 0) {
      onChange({ ...idea, alert: { type: 'price', value: v } });
      saveAlert({ type: 'price', value: v });
    }
  };

  const onEventInput = (text: string, due: string) => {
    setEventText(text);
    setEventDue(due);
    const a: PipelineAlert = { type: 'event', text, dueDate: due || null };
    onChange({ ...idea, alert: a });
    saveAlert(a);
  };

  const changeStage = (stage: PipelineStage) => {
    if (stage === idea.stage) return;
    save({ stage }, true);
  };

  const uploadFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;
    setUploading(true);
    setError('');
    try {
      for (const file of list) {
        if (file.size > 20 * 1024 * 1024) { setError(`${file.name} is over the 20 MB limit`); continue; }
        const form = new FormData();
        form.append('module', 'pipeline');
        form.append('entityId', idea.id);
        form.append('file', file);
        const res = await fetch('/api/attachments/upload', { method: 'POST', body: form });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || `Upload failed for ${file.name}`);
        }
        const att: Attachment = await res.json();
        setPending(p => [...p, att]);
        setAttachments(a => [att, ...a]);
      }
    } catch (err: any) {
      setError(err?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const postNote = async () => {
    const text = note.trim();
    if ((!text && pending.length === 0) || posting || uploading) return;
    setPosting(true);
    setError('');
    try {
      const res = await fetch(`/api/pipeline/ideas/${idea.id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noteText: text, addedBy: me, attachmentIds: pending.map(p => p.id) }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setNotes(prev => [data.note, ...prev]);
      setNote('');
      setPending([]);
      onChange({ ...idea, lastActivityAt: new Date().toISOString() });
    } catch {
      setError('Couldn’t post the note. Try again.');
    } finally {
      setPosting(false);
    }
  };

  const removeNote = async (noteId: string) => {
    await fetch(`/api/pipeline/notes/${noteId}`, { method: 'DELETE' });
    setNotes(prev => prev.filter(n => n.id !== noteId));
  };

  const confirmDecision = async () => {
    if (!decision || !rationale.trim()) return;
    setError('');
    try {
      const res = await fetch(`/api/pipeline/ideas/${idea.id}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome: decision, reason: rationale.trim(), actor: me }),
      });
      if (!res.ok) throw new Error();
      onChange((await res.json()).idea);
      setDecision(null);
      setRationale('');
      loadActivity();
    } catch {
      setError('Couldn’t record the decision. Try again.');
    }
  };

  const doDelete = async () => {
    try {
      const res = await fetch(`/api/pipeline/ideas/${idea.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      onDeleted(idea.id);
    } catch {
      setError('Couldn’t delete the idea. Try again.');
      setConfirmDelete(false);
    }
  };

  // ── derived ──
  const chg = pctChange(idea.priceAtAdd, idea.currentPrice);
  const addedDays = daysSince(idea.dateAdded || idea.createdAt);
  const meta = [
    idea.ticker,
    idea.exchange,
    `added ${addedDays === 0 ? 'today' : addedDays === 1 ? '1 day ago' : `${addedDays} days ago`} by ${idea.addedBy}`,
  ].filter(Boolean).join(' · ');
  const alertType = idea.alert?.type ?? 'none';
  const priceValue = parseFloat(priceInput);
  const priceStatus = alertType !== 'price' || !(priceValue > 0) || idea.currentPrice === null
    ? null
    : idea.currentPrice <= priceValue
      ? { text: `Hit — now ${rs(idea.currentPrice)}`, hit: true }
      : { text: `${(((idea.currentPrice - priceValue) / idea.currentPrice) * 100).toFixed(1)}% below current`, hit: false };

  const attById = new Map(attachments.map(a => [a.id, a]));
  const linked = new Set(notes.flatMap(n => n.attachmentIds));
  const timeline: TimelineEntry[] = [
    ...notes.map(n => ({
      key: n.id,
      who: n.addedBy,
      at: n.createdAt,
      text: n.noteText,
      system: n.kind !== 'note',
      tile: n.kind === 'note',
      attachments: n.attachmentIds.map(id => attById.get(id)).filter((a): a is Attachment => !!a),
      noteId: n.kind === 'note' ? n.id : undefined,
    })),
    // Files attached before notes could carry them.
    ...attachments.filter(a => !linked.has(a.id) && !pending.some(p => p.id === a.id)).map(a => ({
      key: `att-${a.id}`,
      who: a.uploadedBy,
      at: a.uploadedAt,
      text: '',
      system: false,
      tile: true,
      attachments: [a],
    })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  timeline.push({
    key: 'created',
    who: idea.addedBy,
    at: idea.createdAt || idea.dateAdded,
    text: `Added at ${rs(idea.priceAtAdd)}${idea.source ? ` from ${idea.source}` : ''}`,
    system: true,
    tile: true,
    attachments: [],
  });

  const showHistory = idea.tag === 'Exited' || hasPortfolioHistory(history);
  const tabs: DrawerTab[] = [
    { id: 'overview', label: 'Overview', enabled: true },
    { id: 'forward-metrics', label: 'Forward metrics', enabled: true },
    { id: 'thesis', label: 'Thesis', enabled: true },
    ...(showHistory ? [{ id: 'portfolio-history', label: 'Portfolio history', enabled: true }] : []),
  ];

  return (
    <>
      <div className="pl-scrim" onClick={onClose} aria-hidden />
      <aside className={`pl-panel${tab !== 'overview' ? ' is-wide' : ''}`} role="dialog" aria-label={idea.companyName}>
        <header className="pl-panel-head">
          <div className="pl-panel-title-row">
            <div className="pl-panel-title-block">
              <div className="pl-panel-title">{idea.companyName || idea.ticker}</div>
              <div className="pl-panel-meta">{meta}</div>
            </div>
            <button type="button" className="pl-panel-close" onClick={onClose} title="Close" aria-label="Close">×</button>
          </div>
          <div className="pl-stage-control">
            {STAGES.map(s => (
              <button
                key={s.id}
                type="button"
                className={s.id === idea.stage ? 'active' : ''}
                onClick={() => changeStage(s.id)}
              >
                {s.label}
              </button>
            ))}
          </div>
          <DrawerTabs tabs={tabs} activeTab={tab} onTabChange={setTab} />
        </header>

        <div className="pl-panel-body">
          {error && <div className="pl-panel-error">{error}</div>}
          {tab === 'forward-metrics' && <ForwardMetricsTab stockCode={idea.ticker} stockName={idea.companyName} />}
          {tab === 'thesis' && <ThesisTab stockCode={idea.ticker} stockName={idea.companyName} />}
          {tab === 'portfolio-history' && <PortfolioHistoryTab ticker={idea.ticker} history={history} />}
          {tab === 'overview' && (
            <>
              <div className="pl-facts">
                <div className="pl-fact"><div className="pl-fact-label">Added at</div><div className="pl-fact-val">{rs(idea.priceAtAdd)}</div></div>
                <div className="pl-fact"><div className="pl-fact-label">Now</div><div className="pl-fact-val">{rs(idea.currentPrice)}</div></div>
                <div className="pl-fact">
                  <div className="pl-fact-label">Since added</div>
                  <div className={`pl-fact-val${chg === null ? '' : chg >= 0 ? ' pos' : ' neg'}`}>{chg === null ? '—' : signedPct(chg)}</div>
                </div>
                <div className="pl-fact">
                  <div className="pl-fact-label">Last update</div>
                  <div className={`pl-fact-val${isStale(idea) ? ' stale' : ''}`}>{agoLabel(idea.lastActivityAt)}</div>
                </div>
              </div>

              <div className="pl-label">Why it’s interesting</div>
              <textarea
                className="pl-why-input"
                rows={2}
                value={why}
                onChange={e => { setWhy(e.target.value); saveWhy(e.target.value); }}
              />

              <div className="pl-label pl-label-gap">Alert me when</div>
              <div className="pl-alert-row">
                <div className="pl-seg">
                  {(['price', 'event', 'none'] as const).map(t => (
                    <button key={t} type="button" className={alertType === t ? 'active' : ''} onClick={() => alertType !== t && setAlertType(t)}>
                      {t === 'price' ? 'Price' : t === 'event' ? 'Event' : 'None'}
                    </button>
                  ))}
                </div>
                {alertType === 'price' && (
                  <div className="pl-alert-price">
                    <span className="pl-alert-lead">falls below ₹</span>
                    <input className="pl-input pl-num" style={{ width: 100 }} value={priceInput} inputMode="decimal" onChange={e => onPriceInput(e.target.value)} />
                    {priceStatus && <span className={`pl-alert-status${priceStatus.hit ? ' is-hit' : ''}`}>{priceStatus.text}</span>}
                  </div>
                )}
                {alertType === 'event' && (
                  <div className="pl-alert-event">
                    <input
                      className="pl-input"
                      placeholder="e.g. Q2 results, capex commissioning"
                      value={eventText}
                      onChange={e => onEventInput(e.target.value, eventDue)}
                    />
                    <input
                      className="pl-input pl-num"
                      type="date"
                      value={eventDue}
                      min={todayStr()}
                      onChange={e => onEventInput(eventText, e.target.value)}
                      title="Due date"
                    />
                  </div>
                )}
                {alertType === 'none' && <span className="pl-alert-none">No alert — you’ll only see this idea in its list</span>}
              </div>

              <div className="pl-two-col">
                <div>
                  <div className="pl-label">Owner</div>
                  <select className="pl-input" value={idea.owner} onChange={e => save({ owner: e.target.value })}>
                    {Array.from(new Set([...teamMembers, idea.owner])).filter(Boolean).map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <div className="pl-label">Priority</div>
                  <div className="pl-seg pl-seg-fill">
                    {PRIORITIES.map(p => (
                      <button key={p.id} type="button" className={idea.priority === p.id ? 'active' : ''} onClick={() => idea.priority !== p.id && save({ priority: p.id })}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="pl-activity-head">
                <span className="pl-activity-title">Activity</span>
                {idea.source && <span className="pl-activity-source">Source: {idea.source}</span>}
              </div>
              <div
                className={`pl-note-box${dragOver ? ' is-drag' : ''}`}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); uploadFiles(e.dataTransfer.files); }}
              >
                <textarea
                  className="pl-input pl-note-input"
                  rows={2}
                  value={note}
                  placeholder={`Add a note — posts as ${me || 'you'}. Drop files here or use Attach file.`}
                  onChange={e => setNote(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); postNote(); } }}
                />
                <div className="pl-note-actions">
                  <button type="button" className="pl-btn" onClick={postNote} disabled={posting || uploading || (!note.trim() && pending.length === 0)}>
                    {posting ? 'Posting…' : 'Post'}
                  </button>
                  <button type="button" className="pl-btn pl-attach" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                    {uploading ? 'Uploading…' : 'Attach file'}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.pptx,.docx,.xlsx,.xlsm,.xls,.doc"
                    hidden
                    onChange={e => { if (e.target.files) uploadFiles(e.target.files); e.target.value = ''; }}
                  />
                </div>
              </div>
              {pending.length > 0 && (
                <div className="pl-pending">
                  {pending.map(p => (
                    <span key={p.id} className="pl-file-chip">
                      {p.fileName}
                      <button type="button" onClick={() => setPending(list => list.filter(x => x.id !== p.id))} aria-label={`Remove ${p.fileName}`}>×</button>
                    </span>
                  ))}
                </div>
              )}
              {timeline.map(e => (
                <div key={e.key} className="pl-entry">
                  <span className={`pl-tile${e.tile ? '' : ' is-blank'}`}>{e.tile ? initials(e.who) : ''}</span>
                  <div className="pl-entry-body">
                    <div className="pl-entry-meta">
                      <span className="pl-entry-who">{e.who}</span> · {agoLabel(e.at)}
                      {e.noteId && (
                        <button type="button" className="pl-entry-delete" onClick={() => removeNote(e.noteId!)}>Delete</button>
                      )}
                    </div>
                    {e.text && <div className={`pl-entry-text${e.system ? ' is-system' : ''}`}>{e.text}</div>}
                    {e.attachments.length > 0 && (
                      <div className="pl-entry-files">
                        {e.attachments.map(a => (
                          <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer" className="pl-file-chip is-link">{a.fileName}</a>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        {tab === 'overview' && (
          <footer className="pl-panel-foot">
            {decision ? (
              <div>
                <div className="pl-label">{decision === 'bought' ? 'Mark as bought — why now?' : 'Pass on this idea — why?'}</div>
                <textarea
                  className="pl-input pl-rationale"
                  rows={1}
                  autoFocus
                  value={rationale}
                  placeholder="One line on what convinced or deterred you"
                  onChange={e => setRationale(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); confirmDecision(); } }}
                />
                <div className="pl-foot-actions">
                  <button type="button" className="pl-btn" onClick={() => { setDecision(null); setRationale(''); }}>Cancel</button>
                  <button type="button" className="pl-btn is-primary" onClick={confirmDecision} disabled={!rationale.trim()}>Confirm</button>
                </div>
              </div>
            ) : confirmDelete ? (
              <div className="pl-foot-row">
                <span className="pl-foot-label">Delete {idea.companyName || idea.ticker}? This can’t be undone.</span>
                <span className="pl-spacer" />
                <button type="button" className="pl-btn" onClick={() => setConfirmDelete(false)}>Cancel</button>
                <button type="button" className="pl-btn is-primary" onClick={doDelete}>Delete</button>
              </div>
            ) : (
              <div className="pl-foot-row">
                <span className="pl-foot-label">Decision</span>
                {idea.stage === 'closed' && idea.outcome ? (
                  <span className={`pl-foot-outcome${idea.outcome === 'bought' ? ' is-bought' : ''}`}>
                    {idea.outcome === 'bought' ? 'Bought' : 'Passed'}
                  </span>
                ) : (
                  <>
                    <button type="button" className="pl-btn is-bought" onClick={() => setDecision('bought')}>Bought</button>
                    <button type="button" className="pl-btn" onClick={() => setDecision('passed')}>Pass</button>
                  </>
                )}
                <span className="pl-spacer" />
                {isAdmin && (
                  <button type="button" className="pl-link-muted" onClick={() => setConfirmDelete(true)}>Delete idea</button>
                )}
              </div>
            )}
          </footer>
        )}
      </aside>
    </>
  );
}

// ───────────────────────── GUIDANCE TRACKER ─────────────────────────

function GuidanceTracker() {
  const [entries, setEntries] = useState<GuidanceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ticker: '', companyName: '', metric: 'Revenue', guidedValue: '', guidedUnit: 'Cr', currentValue: '', timeframe: '', sourceContext: '' });
  const [saving, setSaving] = useState(false);
  const pendingUpdates = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    fetch('/api/pipeline/guidance')
      .then(r => r.json())
      .then(d => setEntries(d.guidance || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.ticker || !form.companyName || !form.metric) return;
    setSaving(true);
    try {
      const res = await fetch('/api/pipeline/guidance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          guidedValue: form.guidedValue ? parseFloat(form.guidedValue) : null,
          currentValue: form.currentValue ? parseFloat(form.currentValue) : null,
        }),
      });
      const data = await res.json();
      setEntries(prev => [...prev, data.guidance]);
      setForm({ ticker: '', companyName: '', metric: 'Revenue', guidedValue: '', guidedUnit: 'Cr', currentValue: '', timeframe: '', sourceContext: '' });
      setShowForm(false);
    } finally {
      setSaving(false);
    }
  };

  const handleCurrentValueChange = (id: string, value: string) => {
    setEntries(prev => prev.map(e => e.id === id ? { ...e, currentValue: value === '' ? null : parseFloat(value) } : e));
    clearTimeout(pendingUpdates.current[id]);
    pendingUpdates.current[id] = setTimeout(async () => {
      await fetch(`/api/pipeline/guidance/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentValue: value === '' ? null : parseFloat(value) }),
      });
    }, 800);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this guidance entry?')) return;
    await fetch(`/api/pipeline/guidance/${id}`, { method: 'DELETE' });
    setEntries(prev => prev.filter(e => e.id !== id));
  };

  const progressClass = (current: number | null, guided: number | null) => {
    if (!current || !guided) return 'behind';
    const ratio = current / guided;
    if (ratio >= 0.8) return 'good';
    if (ratio >= 0.5) return 'ok';
    return 'behind';
  };

  if (loading) return <div className="pipeline-empty">Loading…</div>;

  return (
    <div>
      {showForm ? (
        <div className="guidance-add-form">
          <form onSubmit={handleAdd}>
            <div className="pipeline-form-grid" style={{ marginBottom: '0.875rem' }}>
              <div className="pipeline-form-group">
                <label>Ticker *</label>
                <input value={form.ticker} onChange={set('ticker')} placeholder="NSE symbol" required style={{ textTransform: 'uppercase' }} />
              </div>
              <div className="pipeline-form-group">
                <label>Company Name *</label>
                <input value={form.companyName} onChange={set('companyName')} placeholder="Company name" required />
              </div>
              <div className="pipeline-form-group">
                <label>Metric *</label>
                <select value={form.metric} onChange={set('metric')}>
                  {GUIDANCE_METRICS.map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div className="pipeline-form-group">
                <label>Timeframe</label>
                <input value={form.timeframe} onChange={set('timeframe')} placeholder="e.g. FY27, Q3FY26" />
              </div>
              <div className="pipeline-form-group">
                <label>Guided Value</label>
                <input type="number" step="0.01" value={form.guidedValue} onChange={set('guidedValue')} placeholder="e.g. 5000" />
              </div>
              <div className="pipeline-form-group">
                <label>Unit</label>
                <select value={form.guidedUnit} onChange={set('guidedUnit')}>
                  {['Cr', '%', 'units', 'mn', 'bn', ''].map(u => <option key={u} value={u}>{u || '—'}</option>)}
                </select>
              </div>
              <div className="pipeline-form-group">
                <label>Current Value</label>
                <input type="number" step="0.01" value={form.currentValue} onChange={set('currentValue')} placeholder="Latest actual" />
              </div>
              <div className="pipeline-form-group pipeline-form-full">
                <label>Notes / Context</label>
                <input value={form.sourceContext} onChange={set('sourceContext')} placeholder="When/where guided, any caveats" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button type="button" className="pipeline-btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
              <button type="submit" className="pipeline-btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Add Entry'}</button>
            </div>
          </form>
        </div>
      ) : (
        <button className="guidance-add-btn" onClick={() => setShowForm(true)}>+ Add Guidance Entry</button>
      )}

      {entries.length === 0 ? (
        <div className="pipeline-empty">No guidance entries yet. Add one to start tracking.</div>
      ) : (
        <div className="guidance-table-wrap">
          <table className="guidance-table">
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Metric</th>
                <th>Timeframe</th>
                <th>Guided</th>
                <th>Current</th>
                <th>Gap %</th>
                <th>Progress</th>
                <th>Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {entries.map(e => {
                const gap = e.guidedValue && e.currentValue
                  ? (((e.currentValue - e.guidedValue) / e.guidedValue) * 100)
                  : null;
                const pct = e.guidedValue && e.currentValue
                  ? Math.min(100, (e.currentValue / e.guidedValue) * 100)
                  : 0;
                return (
                  <tr key={e.id}>
                    <td>
                      <div className="guidance-ticker">{e.ticker}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--secondary-text-color)' }}>{e.companyName}</div>
                    </td>
                    <td><span className="guidance-metric-badge">{e.metric}</span></td>
                    <td>{e.timeframe ? <span className="guidance-timeframe">{e.timeframe}</span> : '—'}</td>
                    <td style={{ fontFamily: 'monospace' }}>
                      {e.guidedValue !== null ? `${e.guidedValue.toLocaleString('en-IN')} ${e.guidedUnit || ''}`.trim() : '—'}
                    </td>
                    <td>
                      <input
                        className="guidance-current-input"
                        type="number"
                        step="0.01"
                        value={e.currentValue ?? ''}
                        onChange={ev => handleCurrentValueChange(e.id, ev.target.value)}
                        placeholder="—"
                      />
                    </td>
                    <td>
                      {gap !== null
                        ? <span className={gap >= 0 ? 'guidance-gap-pos' : 'guidance-gap-neg'}>{gap >= 0 ? '+' : ''}{gap.toFixed(1)}%</span>
                        : '—'}
                    </td>
                    <td>
                      {e.guidedValue ? (
                        <div className="guidance-progress-bar-wrap">
                          <div
                            className={`guidance-progress-bar-fill ${progressClass(e.currentValue, e.guidedValue)}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      ) : '—'}
                    </td>
                    <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.8125rem', color: 'var(--secondary-text-color)' }}>
                      {e.sourceContext || '—'}
                    </td>
                    <td>
                      <button className="guidance-delete-btn" onClick={() => handleDelete(e.id)} title="Delete" type="button">×</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ───────────────────────── MAIN PAGE ─────────────────────────

function readStored(key: string): string | null {
  try { return typeof window !== 'undefined' ? localStorage.getItem(key) : null; } catch { return null; }
}

export function PipelinePage() {
  const { user, isAdmin } = useAuth();
  const [ideas, setIdeas] = useState<PipelineIdea[]>([]);
  const [loading, setLoading] = useState(true);
  const [teamMembers, setTeamMembers] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [ownerScope, setOwnerScope] = useState<'everyone' | 'mine'>(() => readStored('pipelineOwner') === 'mine' ? 'mine' : 'everyone');
  const [staleOnly, setStaleOnly] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [guidanceOpen, setGuidanceOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNote, setRefreshNote] = useState('');

  useEffect(() => {
    fetch('/api/team-members')
      .then(r => r.ok ? r.json() : [])
      .then((data: { id: string; name: string }[]) => setTeamMembers(data.map(m => m.name)))
      .catch(() => {});
  }, []);

  const me = resolveAuthor(user?.name, teamMembers);

  const fetchIdeas = useCallback(async () => {
    try {
      const res = await fetch('/api/pipeline/ideas');
      const data = await res.json();
      setIdeas(data.ideas || []);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchIdeas(); }, [fetchIdeas]);
  useEffect(() => { try { localStorage.setItem('pipelineOwner', ownerScope); } catch {} }, [ownerScope]);

  const upsert = useCallback((idea: PipelineIdea) => {
    setIdeas(prev => {
      const idx = prev.findIndex(i => i.id === idea.id);
      if (idx < 0) return [idea, ...prev];
      const next = [...prev];
      next[idx] = idea;
      return next;
    });
  }, []);

  const handleRefreshPrices = async () => {
    setRefreshing(true);
    setRefreshNote('');
    try {
      const res = await fetch('/api/pipeline/refresh-prices', { method: 'POST' });
      const data = await res.json();
      setRefreshNote(`Prices updated for ${data.updated}${data.failed?.length ? ` · ${data.failed.length} failed` : ''}`);
      await fetchIdeas();
    } catch {
      setRefreshNote('Price refresh failed');
    } finally {
      setRefreshing(false);
      setTimeout(() => setRefreshNote(''), 4000);
    }
  };

  // ── quick add ──
  const [quickTicker, setQuickTicker] = useState('');
  const [quickWhy, setQuickWhy] = useState('');
  const [quickSaving, setQuickSaving] = useState(false);
  const [quickError, setQuickError] = useState('');
  const [quickSheetOpen, setQuickSheetOpen] = useState(false);
  // One of QUICK_SOURCES' values, OTHER_SOURCE (free text in quickSourceOther), or ''.
  const [quickSource, setQuickSource] = useState('');
  const [quickSourceOther, setQuickSourceOther] = useState('');

  // A pasted Screener link is resolved server-side to its NSE symbol (or BSE
  // code), company name and price; the field then shows the ticker.
  const [resolved, setResolved] = useState<{ ticker: string; companyName: string | null; exchange: string; price: number | null } | null>(null);
  const [resolving, setResolving] = useState(false);

  const onTickerInput = async (raw: string) => {
    setQuickError('');
    if (!/screener\.in\/company\//i.test(raw)) {
      setQuickTicker(raw.toUpperCase());
      return;
    }
    setQuickTicker(parseTickerInput(raw));
    setResolving(true);
    try {
      const res = await fetch(`/api/pipeline/screener?url=${encodeURIComponent(raw.trim())}`);
      if (!res.ok) throw new Error();
      const { company } = await res.json();
      const ticker = company.nseSymbol || company.bseCode || company.code;
      setQuickTicker(ticker);
      setResolved({ ticker, companyName: company.companyName, exchange: company.nseSymbol ? 'NSE' : 'BSE', price: company.price });
    } catch {
      setResolved(null);
      setQuickError('Couldn’t read that Screener link — the ticker is filled in from it.');
    } finally {
      setResolving(false);
    }
  };

  const resolvedFor = (ticker: string) => (resolved && resolved.ticker === ticker ? resolved : null);

  // Resolves the ticker (NSE, BSE, then the SME boards) for company name and
  // price; date, owner, stage and priority are filled in server-side.
  const handleQuickAdd = async () => {
    const ticker = parseTickerInput(quickTicker);
    if (!ticker || quickSaving || resolving) return;
    const fromScreener = resolvedFor(ticker);
    setQuickSaving(true);
    setQuickError('');
    try {
      let price: { closePrice: number; companyName?: string } | null = null;
      let exchange = 'NSE';
      // Numeric codes are BSE scrip codes (e.g. from a Screener link) — skip NSE.
      const boards = [['.NS', 'NSE'], ['.BO', 'BSE'], ['-SM.NS', 'NSE SME'], ['-SM.BO', 'BSE SME']] as const;
      for (const [suffix, ex] of boards.filter(([sfx]) => !/^\d+$/.test(ticker) || sfx.endsWith('.BO'))) {
        const res = await fetch(`/api/pipeline/price?ticker=${encodeURIComponent(ticker + suffix)}`);
        const data = await res.json().catch(() => ({}));
        if (data.price?.closePrice) { price = data.price; exchange = ex; break; }
      }
      // Yahoo misses many BSE SME stocks; a resolved Screener link has the price.
      if (!price && fromScreener?.price) {
        price = { closePrice: fromScreener.price, companyName: fromScreener.companyName || undefined };
        exchange = fromScreener.exchange;
      }
      if (!price) {
        setQuickError(`Couldn’t find a price for ${ticker}`);
        return;
      }
      const res = await fetch('/api/pipeline/ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker,
          companyName: fromScreener?.companyName || price.companyName || ticker,
          exchange,
          addedBy: me,
          owner: me,
          source: (quickSource === OTHER_SOURCE ? quickSourceOther.trim() : quickSource) || 'Quick add',
          why: quickWhy.trim() || 'No reason noted yet',
          priceAtAdd: price.closePrice,
          priority: 'medium',
          dateAdded: todayStr(),
        }),
      });
      if (!res.ok) throw new Error();
      upsert((await res.json()).idea);
      setQuickTicker('');
      setQuickWhy('');
      setQuickSource('');
      setQuickSourceOther('');
      setResolved(null);
      setQuickSheetOpen(false);
    } catch {
      setQuickError('Couldn’t add the idea. Try again.');
    } finally {
      setQuickSaving(false);
    }
  };

  const onQuickKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); handleQuickAdd(); }
  };

  // ── derived ──
  let pool = ideas;
  if (ownerScope === 'mine') pool = pool.filter(i => i.owner === me);
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    pool = pool.filter(i => `${i.companyName} ${i.ticker} ${i.why || ''}`.toLowerCase().includes(q));
  }

  const openIdea = useCallback((idea: PipelineIdea) => setOpenId(idea.id), []);
  const attention = buildAttention(pool, staleOnly, openIdea, () => setStaleOnly(v => !v));
  const activeCount = pool.filter(i => i.stage !== 'closed').length;
  const ownedCount = ideas.filter(i => i.owner === me && i.stage !== 'closed').length;
  const openIdeaObj = openId ? ideas.find(i => i.id === openId) || null : null;
  const closePanel = useCallback(() => setOpenId(null), []);

  return (
    <div className="pl-page">
      {/* Header */}
      <div className="pl-header">
        <div>
          <h1 className="pl-title">Pipeline</h1>
          <div className="pl-subtitle">
            <span>{activeCount} active ideas ·</span>
            <span>{attention.length} need attention ·</span>
            <span>{ownedCount} owned by you</span>
          </div>
        </div>
        <div className="pl-header-actions">
          {refreshNote && <span className="pl-refresh-note">{refreshNote}</span>}
          <button type="button" className="pl-btn pl-refresh" onClick={handleRefreshPrices} disabled={refreshing} title="Refresh prices">
            {refreshing ? 'Refreshing…' : '↻ Prices'}
          </button>
          <input className="pl-input pl-search" placeholder="Search ideas" value={search} onChange={e => setSearch(e.target.value)} />
          <div className="pl-seg">
            <button type="button" className={ownerScope === 'everyone' ? 'active' : ''} onClick={() => setOwnerScope('everyone')}>Everyone</button>
            <button type="button" className={ownerScope === 'mine' ? 'active' : ''} onClick={() => setOwnerScope('mine')}>Mine</button>
          </div>
        </div>
      </div>

      {/* Quick add */}
      <div className="pl-quick">
        <span className="pl-quick-label">New idea</span>
        <input
          className="pl-input pl-quick-ticker"
          placeholder="Ticker / Screener link"
          value={quickTicker}
          onChange={e => onTickerInput(e.target.value)}
          onKeyDown={onQuickKey}
        />
        <input
          className="pl-input pl-quick-why"
          placeholder="Why?"
          value={quickWhy}
          onChange={e => setQuickWhy(e.target.value)}
          onKeyDown={onQuickKey}
        />
        <select
          className={`pl-input pl-quick-source${quickSource ? '' : ' is-empty'}`}
          value={quickSource}
          onChange={e => { setQuickSource(e.target.value); if (e.target.value !== OTHER_SOURCE) setQuickSourceOther(''); }}
          aria-label="Source"
        >
          <option value="">Source</option>
          {QUICK_SOURCES.map(src => <option key={src.value} value={src.value}>{src.label}</option>)}
          <option value={OTHER_SOURCE}>Other…</option>
        </select>
        {quickSource === OTHER_SOURCE && (
          <input
            className="pl-input pl-quick-source-other"
            placeholder="Source"
            autoFocus
            value={quickSourceOther}
            onChange={e => setQuickSourceOther(e.target.value)}
            onKeyDown={onQuickKey}
          />
        )}
        <button type="button" className="pl-btn is-primary" onClick={handleQuickAdd} disabled={!quickTicker.trim() || quickSaving || resolving}>
          {quickSaving ? 'Adding…' : 'Add'}
        </button>
        {(quickError || resolving || resolvedFor(quickTicker)?.companyName) && (
          <span className={`pl-quick-hint${quickError ? ' is-error' : ''}`}>
            {quickError || (resolving ? 'Reading Screener link…' : resolvedFor(quickTicker)!.companyName)}
          </span>
        )}
      </div>

      {loading ? (
        <div className="pl-loading">Loading…</div>
      ) : (
        <>
          <NeedsAttention rows={attention} />
          <StageList pool={pool} staleOnly={staleOnly} openId={openId} onOpen={openIdea} />
          <MobilePipeline
            pool={pool}
            activeCount={activeCount}
            ownerScope={ownerScope}
            onToggleOwner={() => setOwnerScope(s => (s === 'everyone' ? 'mine' : 'everyone'))}
            onOpen={openIdea}
            onAdd={() => { setQuickError(''); setQuickSheetOpen(true); }}
          />
        </>
      )}

      {/* Phone quick add — a bottom sheet opened from "+ Idea" */}
      {quickSheetOpen && (
        <>
          <div className="pl-scrim plm-sheet-scrim" onClick={() => setQuickSheetOpen(false)} aria-hidden />
          <div className="plm-sheet" role="dialog" aria-label="New idea">
            <span className="plm-sheet-handle" aria-hidden />
            <div className="plm-sheet-title">New idea</div>

            <label className="plm-field-label" htmlFor="plm-ticker">Ticker</label>
            <input
              id="plm-ticker"
              className="pl-input plm-field"
              placeholder="e.g. KAYNES or a Screener link"
              autoFocus
              autoCapitalize="characters"
              autoCorrect="off"
              value={quickTicker}
              onChange={e => onTickerInput(e.target.value)}
              onKeyDown={onQuickKey}
            />

            <label className="plm-field-label" htmlFor="plm-why">Why is it interesting?</label>
            <input
              id="plm-why"
              className="pl-input plm-field"
              placeholder="One line is enough"
              value={quickWhy}
              onChange={e => setQuickWhy(e.target.value)}
              onKeyDown={onQuickKey}
            />

            <div className="plm-field-label plm-field-label-row">
              <span>Source</span>
              <span className="plm-optional">Optional</span>
            </div>
            <div className="plm-sources">
              {QUICK_SOURCES.map(src => (
                <button
                  key={src.value}
                  type="button"
                  className={quickSource === src.value ? 'active' : ''}
                  onClick={() => { setQuickSource(v => (v === src.value ? '' : src.value)); setQuickSourceOther(''); }}
                >
                  {src.label}
                </button>
              ))}
              <input
                className="pl-input plm-source-other"
                placeholder="Other…"
                value={quickSourceOther}
                onChange={e => { setQuickSourceOther(e.target.value); setQuickSource(e.target.value.trim() ? OTHER_SOURCE : ''); }}
              />
            </div>

            <p className={`plm-sheet-hint${quickError ? ' is-error' : ''}`}>
              {quickError || (resolving
                ? 'Reading Screener link…'
                : resolvedFor(quickTicker)?.companyName
                  ? `${resolvedFor(quickTicker)!.companyName}. Price, date and owner are filled in for you.`
                  : 'Price, date and owner are filled in for you. It lands in New.')}
            </p>
            <button type="button" className="pl-btn is-primary plm-sheet-submit" onClick={handleQuickAdd} disabled={!quickTicker.trim() || quickSaving || resolving}>
              {quickSaving ? 'Adding…' : 'Add idea'}
            </button>
          </div>
        </>
      )}

      {openIdeaObj && (
        <DetailPanel
          idea={openIdeaObj}
          me={me}
          teamMembers={teamMembers}
          isAdmin={isAdmin}
          onClose={closePanel}
          onChange={upsert}
          onDeleted={id => { setIdeas(prev => prev.filter(i => i.id !== id)); setOpenId(null); }}
        />
      )}

      {/* Guidance tracker — floating launcher, bottom-right */}
      <button className="guidance-fab" type="button" onClick={() => setGuidanceOpen(true)}>
        Guidance Tracker
      </button>
      <div className={`pipeline-modal-backdrop ${guidanceOpen ? 'open' : ''}`} onClick={() => setGuidanceOpen(false)} aria-hidden />
      <div className={`pipeline-modal wide guidance-panel ${guidanceOpen ? 'open' : ''}`} role="dialog" aria-modal aria-label="Guidance Tracker">
        <div className="pipeline-modal-header">
          <h2 className="pipeline-modal-title">Guidance Tracker</h2>
          <button className="pipeline-modal-close" onClick={() => setGuidanceOpen(false)} type="button">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="pipeline-modal-body">
          {guidanceOpen && <GuidanceTracker />}
        </div>
      </div>
    </div>
  );
}
