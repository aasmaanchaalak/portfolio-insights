// Tools the Claude connector exposes. Each runs as the user who approved the
// connector, with the same rules as the app: analysts don't see public holdings
// below the visibility threshold, and amounts/quantities are never returned.

import { query } from '../db';
import { getGridKeyData, getAnalystOverrides, isVisibleToAnalyst, getCurrentFiscalYear, getTeamMembers } from '../queries';
import { getThesisByStockCode, getForwardMetrics, upsertForwardMetrics, addNote } from '../thesis/queries';
import { listCompanies, getCompanyById, getValuation, upsertValuation, getCommunications, createCommunication, updateMonitoring } from '../pe/queries';
import { listIdeas, getIdeaByTicker, createIdea, updateIdea, decideIdea, getNotesByIdea, createNote, listGuidance, createGuidance, updateGuidance, STAGE_LABEL } from '../pipeline/queries';
import { fetchLivePrice } from '../pipeline/price';
import { resolveAuthor } from '../pipeline/author';
import { CommunicationType, GuidanceVsActual, PECompany, ValuationTableData } from '../../types/pe';
import { PipelineIdea, PipelinePriority, PipelineStage, UpdateIdeaRequest } from '../../types/pipeline';
import { McpUser } from './oauth';
import { applyModelUpdates, defaultGrid, formatModel, ModelUpdate } from './model';
import { addAttachment, listAttachments, AttachmentInfo } from './attachments';
import { ToolError } from './errors';

type Args = Record<string, any>;

interface ToolDef {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, any>;
  annotations: Record<string, boolean | string>;
  run: (args: Args, user: McpUser) => Promise<string>;
}

// ============ Lookups ============

interface StockRef {
  code: string;
  name: string;
  held: boolean;
  hasModel: boolean;
  noteCount: number;
}

// Current holdings (PF Data), stocks with a thesis or model, and pipeline ideas.
async function stockUniverse(user: McpUser): Promise<StockRef[]> {
  const [holdings, theses, overrides, ideas] = await Promise.all([
    getGridKeyData(),
    query<{ stock_code: string; stock_name: string; has_model: boolean; note_count: string }>(
      `SELECT t.stock_code, t.stock_name, t.forward_metrics IS NOT NULL AS has_model,
              (SELECT COUNT(*) FROM thesis_notes n WHERE n.thesis_id = t.id) AS note_count
       FROM theses t`,
    ),
    getAnalystOverrides(),
    listIdeas(),
  ]);

  // PF Data can hold one row per portfolio for the same stock; sum them.
  const held = new Map<string, { name: string; invested: number }>();
  for (const item of holdings || []) {
    const code: string | null = item.nseCode || item.bseCode;
    if (!code) continue;
    const prev = held.get(code);
    const invested = (Number(item.quantity) || 0) * (Number(item.averageBuyPrice) || 0);
    held.set(code, { name: prev?.name || item.scripName || code, invested: (prev?.invested || 0) + invested });
  }

  const hidden = new Set<string>();
  if (user.role === 'analyst') {
    for (const [code, h] of held) if (!isVisibleToAnalyst(h.invested, code, overrides)) hidden.add(code);
  }

  const out = new Map<string, StockRef>();
  for (const [code, h] of held) {
    if (!hidden.has(code)) out.set(code, { code, name: h.name, held: true, hasModel: false, noteCount: 0 });
  }
  for (const t of theses) {
    if (hidden.has(t.stock_code)) continue;
    const ref = out.get(t.stock_code) || { code: t.stock_code, name: t.stock_name, held: false, hasModel: false, noteCount: 0 };
    ref.hasModel = t.has_model;
    ref.noteCount = Number(t.note_count) || 0;
    out.set(t.stock_code, ref);
  }
  // Pipeline ideas have a Forward Metrics tab keyed by ticker too.
  for (const idea of ideas) {
    if (!hidden.has(idea.ticker) && !out.has(idea.ticker)) {
      out.set(idea.ticker, { code: idea.ticker, name: idea.companyName, held: false, hasModel: false, noteCount: 0 });
    }
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// Exact code, then exact name, then a unique partial match on name or code.
function pick<T>(items: T[], input: string, keys: (t: T) => string[], label: (t: T) => string, what: string): T {
  const q = input.trim().toLowerCase();
  if (!q) throw new ToolError(`Which ${what}? Pass its code or name.`);
  const exact = items.filter(t => keys(t).some(k => k.toLowerCase() === q));
  if (exact.length === 1) return exact[0];
  const partial = exact.length > 1 ? exact : items.filter(t => keys(t).some(k => k.toLowerCase().includes(q)));
  if (partial.length === 1) return partial[0];
  if (partial.length === 0) throw new ToolError(`No ${what} matches "${input}".`);
  throw new ToolError(`"${input}" matches several — pass one exactly:\n${partial.slice(0, 15).map(t => `- ${label(t)}`).join('\n')}`);
}

async function resolveStock(user: McpUser, input: unknown): Promise<StockRef> {
  const all = await stockUniverse(user);
  return pick(all, String(input ?? ''), s => [s.code, s.name], s => `${s.code} — ${s.name}`, 'portfolio stock');
}

async function resolveCompany(input: unknown) {
  const all = await listCompanies();
  return pick(all, String(input ?? ''), c => [c.id, c.companyCode, c.companyName], c => `${c.companyCode} — ${c.companyName}`, 'PE company');
}

// A placeholder thesis row lets notes/models exist before a full thesis is
// written (same as saving forward metrics first in the app).
async function ensureThesisRow(stock: StockRef): Promise<void> {
  await query(
    `INSERT INTO theses (stock_code, stock_name) VALUES ($1, $2) ON CONFLICT (stock_code) DO NOTHING`,
    [stock.code, stock.name],
  );
}

// ============ Formatting ============

// DATE columns come back as local-midnight Dates, so read local parts.
const date = (d: string | Date | null | undefined) => {
  if (!d) return '';
  const v = d instanceof Date ? d : new Date(d);
  if (isNaN(v.getTime())) return String(d);
  return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
};
const today = () => date(new Date());
const isDate = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

function formatAttachments(list: AttachmentInfo[]): string {
  if (list.length === 0) return 'No attachments.';
  return list.map(a =>
    `- ${a.fileName} (${a.fileType}, ${Math.max(1, Math.round(a.fileSize / 1024))} KB) — ${date(a.uploadedAt)} by ${a.uploadedBy}\n  Download (valid 1 hour): ${a.url}`,
  ).join('\n');
}

function parseUpdates(args: Args): ModelUpdate[] {
  if (!Array.isArray(args.updates) || args.updates.length === 0) throw new ToolError('updates must be a non-empty array');
  if (args.updates.length > 500) throw new ToolError('At most 500 updates per call');
  return args.updates.map((u: any) => ({ row: u?.row, year: u?.year, value: u?.value === undefined ? null : u.value }));
}

async function updateModel(
  kind: 'stock' | 'pe',
  existing: ValuationTableData | null,
  args: Args,
  save: (d: ValuationTableData) => Promise<ValuationTableData>,
): Promise<string> {
  const updates = parseUpdates(args);
  const currentFY = await getCurrentFiscalYear();
  const base = existing && Array.isArray(existing.rows) && Array.isArray(existing.columns) ? existing : defaultGrid(kind, currentFY);
  const { data, changes, errors } = applyModelUpdates(base, updates, currentFY, args.create_missing !== false);
  if (errors.length > 0) throw new ToolError(`Nothing saved:\n${errors.map(e => `- ${e}`).join('\n')}`);
  const saved = changes.length > 0 || !existing ? await save(data) : data;
  const changeLines = changes.map(c => `- ${c.row} ${c.year}: ${c.from ?? 'blank'} → ${c.to ?? 'blank'}`);
  return [
    changes.length > 0 ? `Saved ${changes.length} change${changes.length === 1 ? '' : 's'}:\n${changeLines.join('\n')}` : 'No values changed.',
    '',
    formatModel(saved, kind === 'stock'),
  ].join('\n');
}

const COMMUNICATION_TYPES: CommunicationType[] = ['note', 'email', 'call', 'meeting', 'site_visit', 'board_meeting', 'document_received', 'other'];

// ============ PE checklist ============

const GUIDANCE_VS_ACTUAL: GuidanceVsActual[] = ['ahead', 'on_track', 'behind', 'missed'];

function formatChecklist(c: PECompany): string {
  const box = (on: boolean, label: string, when: unknown) => `${on ? '☑' : '☐'} ${label}${on && when ? ` (${date(when as any)})` : ''}`;
  return [
    'Checklist:',
    box(!!c.fy26AnnualReportReceived, 'FY26 annual report received', c.fy26AnnualReportDate),
    box(!!c.fy25AnnualReportReceived, 'FY25 annual report received', c.fy25AnnualReportDate),
    box(!!c.drhpFiled, 'DRHP filed', c.drhpFiledDate) + (c.drhpLink ? ` — ${c.drhpLink}` : ''),
    `Last audited financials received: ${date(c.lastAuditedFinancialsReceived) || '—'}`,
    `Latest deck received: ${date(c.latestDeckReceived) || '—'}${c.latestDeckName ? ` (${c.latestDeckName})` : ''}`,
    `Latest earnings update${c.latestEarningsDate ? ` (${date(c.latestEarningsDate)})` : ''}: ${c.latestEarningsUpdate || '—'}`,
    `Management guidance: ${c.managementGuidance || '—'}`,
    `Guidance vs actual: ${c.guidanceVsActual || '—'}${c.guidanceVsActualNotes ? ` — ${c.guidanceVsActualNotes}` : ''}`,
  ].join('\n');
}

// ============ Pipeline ============

async function resolveIdea(input: unknown): Promise<PipelineIdea> {
  const all = await listIdeas();
  return pick(all, String(input ?? ''), i => [i.id, i.ticker, i.companyName], i => `${i.ticker} — ${i.companyName} (${STAGE_LABEL[i.stage]})`, 'pipeline idea');
}

// Pipeline authors/owners are team-member names, as in the Pipeline page.
async function teamNames(): Promise<string[]> {
  return (await getTeamMembers()).map(m => m.name);
}

async function resolveOwner(input: unknown, user: McpUser): Promise<string> {
  const names = await teamNames();
  if (input === undefined || input === null || input === '') return resolveAuthor(user.name || undefined, names) || user.email;
  const match = names.find(n => n.toLowerCase() === String(input).trim().toLowerCase());
  if (!match) throw new ToolError(`Owner must be a team member: ${names.join(', ') || '(none set up)'}`);
  return match;
}

function formatIdea(i: PipelineIdea): string {
  const move = i.priceAtAdd && i.currentPrice ? ` (${((i.currentPrice / i.priceAtAdd - 1) * 100).toFixed(1)}% since added)` : '';
  const alert = !i.alert ? 'none'
    : i.alert.type === 'price' ? `price ≤ ₹${i.alert.value}`
    : `${i.alert.text}${i.alert.dueDate ? ` (due ${i.alert.dueDate})` : ''}`;
  return [
    `${i.companyName} (${i.ticker}${i.exchange ? `, ${i.exchange}` : ''}) — ${STAGE_LABEL[i.stage]}${i.outcome ? ` · ${i.outcome}` : ''} · ${i.priority} priority`,
    `Owner: ${i.owner} · added ${date(i.dateAdded)} by ${i.addedBy}${i.source ? ` · source: ${i.source}` : ''}${i.tag ? ` · tag: ${i.tag}` : ''}`,
    `Price: added at ₹${i.priceAtAdd ?? '—'}, now ₹${i.currentPrice ?? '—'}${move}`,
    `Alert: ${alert}`,
    `Why: ${i.why || '—'}`,
  ].join('\n');
}

// Same exchange order as the Pipeline page's quick add (numeric = BSE code).
async function lookupPrice(ticker: string): Promise<{ price: number; exchange: string; companyName: string | null } | null> {
  const boards = [['.NS', 'NSE'], ['.BO', 'BSE'], ['-SM.NS', 'NSE SME'], ['-SM.BO', 'BSE SME']] as const;
  for (const [suffix, exchange] of boards.filter(([sfx]) => !/^\d+$/.test(ticker) || sfx.endsWith('.BO'))) {
    const live = await fetchLivePrice(ticker + suffix);
    if (live) return { price: live.closePrice, exchange, companyName: live.companyName };
  }
  return null;
}

const STAGES: PipelineStage[] = ['new', 'research', 'waiting', 'closed'];
const PRIORITIES: PipelinePriority[] = ['high', 'medium', 'low'];
const ideaArg = { type: 'string', description: 'Pipeline idea ticker, company name or id' };

// ============ Schemas ============

const stockArg = { type: 'string', description: 'NSE/BSE code or company name of a portfolio stock or pipeline idea, e.g. "HDFCBANK"' };
const companyArg = { type: 'string', description: 'PE company code, name or id' };
const updatesArg = {
  type: 'array',
  description: 'Cells to set. Row is matched by label ignoring case/punctuation ("P/E" matches "P/E (target)"); year accepts FY27, FY27E or 2027.',
  items: {
    type: 'object',
    properties: {
      row: { type: 'string', description: 'Row label, e.g. Revenue, EBITDA, PAT, EPS, P/E' },
      year: { type: 'string', description: 'Fiscal year (ending March), e.g. FY27E' },
      value: { type: ['number', 'null'], description: 'New value; null clears the cell' },
    },
    required: ['row', 'year', 'value'],
  },
};
const createMissingArg = { type: 'boolean', description: 'Add rows/years that don\'t exist yet (default true). Set false to only touch existing cells.' };
const attachmentProps = {
  file_name: { type: 'string', description: 'File name with extension, e.g. "Q2FY27 results.pdf". Optional for source_url.' },
  content_base64: { type: 'string', description: 'File bytes, base64-encoded (keep under ~3 MB)' },
  text_content: { type: 'string', description: 'Text to save as a file (markdown/plain), e.g. a call summary' },
  source_url: { type: 'string', description: 'Public https URL to download the file from (max 20 MB)' },
  mime_type: { type: 'string', description: 'Optional; inferred from the extension' },
};
const read = { readOnlyHint: true, openWorldHint: false };
const write = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };

// ============ Tools ============

export const TOOLS: ToolDef[] = [
  // ---- Public portfolio ----
  {
    name: 'search_portfolio_stocks',
    title: 'Search portfolio stocks',
    description: 'List public portfolio stocks (current holdings, stocks with a thesis, and pipeline ideas) with their codes, whether a forward model exists and how many notes they have. Omit query to list all.',
    inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Part of a name or code' } } },
    annotations: { ...read, title: 'Search portfolio stocks' },
    async run(args, user) {
      let stocks = await stockUniverse(user);
      const q = typeof args.query === 'string' ? args.query.trim().toLowerCase() : '';
      if (q) stocks = stocks.filter(s => s.code.toLowerCase().includes(q) || s.name.toLowerCase().includes(q));
      if (stocks.length === 0) return 'No matching stocks.';
      return stocks.map(s =>
        `- ${s.code} — ${s.name}${s.held ? '' : ' (not held)'} · model: ${s.hasModel ? 'yes' : 'no'} · notes: ${s.noteCount}`,
      ).join('\n');
    },
  },
  {
    name: 'get_stock_model',
    title: 'Get stock forward model',
    description: 'Show the forward model (Forward Metrics grid: Revenue, EBITDA, PAT, EPS, target P/E, EV/EBITDA, net debt, shares… by fiscal year) for a portfolio stock, with the derived target price per year.',
    inputSchema: { type: 'object', properties: { stock: stockArg }, required: ['stock'] },
    annotations: { ...read, title: 'Get stock forward model' },
    async run(args, user) {
      const stock = await resolveStock(user, args.stock);
      const data = await getForwardMetrics(stock.code);
      return `${stock.name} (${stock.code}) forward model\nUnits: EBITDA/PAT/net debt in ₹ Cr, shares in Cr, EPS in ₹.\n\n${formatModel(data, true)}`;
    },
  },
  {
    name: 'update_stock_model',
    title: 'Update stock forward model',
    description: 'Set cells in a portfolio stock\'s forward model (e.g. after results). Only the given cells change. Target price comes from EPS × P/E (target) — a blank EPS is derived as PAT ÷ shares, so entering PAT is enough — or (EBITDA × EV/EBITDA − net debt) ÷ shares when P/E is blank. Use ₹ Cr for EBITDA/PAT/net debt, Cr for shares. Call get_stock_model first to see the rows.',
    inputSchema: {
      type: 'object',
      properties: { stock: stockArg, updates: updatesArg, create_missing: createMissingArg },
      required: ['stock', 'updates'],
    },
    annotations: { ...write, idempotentHint: true, title: 'Update stock forward model' },
    async run(args, user) {
      const stock = await resolveStock(user, args.stock);
      const existing = await getForwardMetrics(stock.code);
      return `${stock.name} (${stock.code})\n` +
        await updateModel('stock', existing, args, d => upsertForwardMetrics(stock.code, d, stock.name));
    },
  },
  {
    name: 'get_stock_notes',
    title: 'Get stock notes',
    description: 'Show a portfolio stock\'s thesis status, original thesis and notes (newest first).',
    inputSchema: { type: 'object', properties: { stock: stockArg }, required: ['stock'] },
    annotations: { ...read, title: 'Get stock notes' },
    async run(args, user) {
      const stock = await resolveStock(user, args.stock);
      const thesis = await getThesisByStockCode(stock.code);
      if (!thesis) return `${stock.name} (${stock.code}): no thesis or notes yet.`;
      const notes = thesis.notes.length > 0
        ? thesis.notes.map(n => `- ${date(n.createdAt)}${n.userEmail ? ` (${n.userEmail})` : ''}: ${n.content}`).join('\n')
        : 'No notes.';
      return [
        `${stock.name} (${stock.code}) — thesis status: ${thesis.status}`,
        thesis.originalThesis ? `\nOriginal thesis:\n${thesis.originalThesis}` : '',
        `\nNotes:\n${notes}`,
      ].join('\n');
    },
  },
  {
    name: 'add_stock_note',
    title: 'Add stock note',
    description: 'Add a note to a portfolio stock (shown in its Thesis tab, newest first).',
    inputSchema: {
      type: 'object',
      properties: { stock: stockArg, content: { type: 'string', description: 'The note text' } },
      required: ['stock', 'content'],
    },
    annotations: { ...write, title: 'Add stock note' },
    async run(args, user) {
      const stock = await resolveStock(user, args.stock);
      const content = typeof args.content === 'string' ? args.content.trim() : '';
      if (!content) throw new ToolError('content is required');
      await ensureThesisRow(stock);
      const notes = await addNote(stock.code, content, user.email);
      return `Note added to ${stock.name} (${stock.code}). It now has ${notes.length} note${notes.length === 1 ? '' : 's'}.`;
    },
  },
  {
    name: 'list_stock_attachments',
    title: 'List stock attachments',
    description: 'List files attached to a portfolio stock, with temporary download links.',
    inputSchema: { type: 'object', properties: { stock: stockArg }, required: ['stock'] },
    annotations: { ...read, title: 'List stock attachments' },
    async run(args, user) {
      const stock = await resolveStock(user, args.stock);
      return `${stock.name} (${stock.code}) attachments:\n${formatAttachments(await listAttachments('thesis', stock.code))}`;
    },
  },
  {
    name: 'add_stock_attachment',
    title: 'Add stock attachment',
    description: 'Attach a file to a portfolio stock. Give exactly one of: source_url (public https link), text_content (saved as a .md file), or content_base64 (small files). Allowed: PDF, images, Word, Excel, PowerPoint, txt, md, csv; max 20 MB.',
    inputSchema: { type: 'object', properties: { stock: stockArg, ...attachmentProps }, required: ['stock'] },
    annotations: { ...write, openWorldHint: true, title: 'Add stock attachment' },
    async run(args, user) {
      const stock = await resolveStock(user, args.stock);
      const a = await addAttachment('thesis', stock.code, attachmentSource(args), user.email);
      return `Attached ${a.fileName} (${Math.max(1, Math.round(a.fileSize / 1024))} KB) to ${stock.name} (${stock.code}).`;
    },
  },

  // ---- PE tracker ----
  {
    name: 'list_pe_companies',
    title: 'List PE companies',
    description: 'List companies in the PE tracker with code, sector, thesis status and last communication date. Omit query to list all.',
    inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Part of a name or code' } } },
    annotations: { ...read, title: 'List PE companies' },
    async run(args) {
      let companies = await listCompanies();
      const q = typeof args.query === 'string' ? args.query.trim().toLowerCase() : '';
      if (q) companies = companies.filter(c => c.companyName.toLowerCase().includes(q) || c.companyCode.toLowerCase().includes(q));
      if (companies.length === 0) return 'No matching PE companies.';
      return companies.map(c =>
        `- ${c.companyCode} — ${c.companyName}${c.sector ? ` · ${c.sector}` : ''}${c.isExited ? ' · exited' : ''}`
        + `${c.thesisStatus ? ` · thesis: ${c.thesisStatus}` : ''}${c.lastCommunicationDate ? ` · last update ${date(c.lastCommunicationDate)}` : ''}`,
      ).join('\n');
    },
  },
  {
    name: 'get_pe_model',
    title: 'Get PE company model',
    description: 'Show the valuation model grid (rows like Valuation, PAT, Unit Sales, AOV by fiscal year) for a PE tracker company.',
    inputSchema: { type: 'object', properties: { company: companyArg }, required: ['company'] },
    annotations: { ...read, title: 'Get PE company model' },
    async run(args) {
      const company = await resolveCompany(args.company);
      return `${company.companyName} (${company.companyCode}) valuation model\n\n${formatModel(await getValuation(company.id), false)}`;
    },
  },
  {
    name: 'update_pe_model',
    title: 'Update PE company model',
    description: 'Set cells in a PE company\'s valuation model. Only the given cells change; missing rows/years are added unless create_missing is false. Call get_pe_model first to see the rows.',
    inputSchema: {
      type: 'object',
      properties: { company: companyArg, updates: updatesArg, create_missing: createMissingArg },
      required: ['company', 'updates'],
    },
    annotations: { ...write, idempotentHint: true, title: 'Update PE company model' },
    async run(args) {
      const company = await resolveCompany(args.company);
      const existing = await getValuation(company.id);
      return `${company.companyName} (${company.companyCode})\n` +
        await updateModel('pe', existing, args, d => upsertValuation(company.id, d));
    },
  },
  {
    name: 'get_pe_notes',
    title: 'Get PE company notes',
    description: 'Show a PE company\'s thesis summary, checklist (annual reports, DRHP, deck…) and its notes / communication log (newest first).',
    inputSchema: {
      type: 'object',
      properties: { company: companyArg, limit: { type: 'number', description: 'How many entries (default 20, max 100)' } },
      required: ['company'],
    },
    annotations: { ...read, title: 'Get PE company notes' },
    async run(args) {
      const ref = await resolveCompany(args.company);
      const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 100);
      const [company, comms] = await Promise.all([getCompanyById(ref.id), getCommunications(ref.id, limit, 0)]);
      const log = comms.length > 0
        ? comms.map(c => [
            `- ${date(c.communicationDate)} [${c.communicationType}]${c.subject ? ` ${c.subject}` : ''}${c.createdBy ? ` (${c.createdBy})` : ''}`,
            c.summary ? `  ${c.summary}` : '',
            c.detailedNotes ? `  Details: ${c.detailedNotes}` : '',
            c.participants ? `  Participants: ${c.participants}` : '',
            c.followUpRequired ? `  Follow-up${c.followUpDate ? ` by ${date(c.followUpDate)}` : ''}${c.followUpNotes ? `: ${c.followUpNotes}` : ''}` : '',
          ].filter(Boolean).join('\n')).join('\n')
        : 'No notes or communications.';
      return [
        `${ref.companyName} (${ref.companyCode})${company?.thesisStatus ? ` — thesis status: ${company.thesisStatus}` : ''}`,
        company?.originalThesis ? `\nThesis:\n${company.originalThesis}` : '',
        company?.latestNote ? `\nLatest note: ${company.latestNote}` : '',
        company ? `\n${formatChecklist(company)}` : '',
        `\nCommunication log:\n${log}`,
      ].join('\n');
    },
  },
  {
    name: 'add_pe_note',
    title: 'Add PE company note',
    description: 'Add a note or communication (call, meeting, email…) to a PE company\'s log.',
    inputSchema: {
      type: 'object',
      properties: {
        company: companyArg,
        summary: { type: 'string', description: 'The note / summary text' },
        type: { type: 'string', enum: COMMUNICATION_TYPES, description: 'Default "note"' },
        subject: { type: 'string' },
        detailed_notes: { type: 'string' },
        date: { type: 'string', description: 'YYYY-MM-DD; defaults to today' },
        participants: { type: 'string' },
        follow_up_date: { type: 'string', description: 'YYYY-MM-DD; marks a follow-up as required' },
        follow_up_notes: { type: 'string' },
      },
      required: ['company', 'summary'],
    },
    annotations: { ...write, title: 'Add PE company note' },
    async run(args, user) {
      const company = await resolveCompany(args.company);
      const summary = typeof args.summary === 'string' ? args.summary.trim() : '';
      if (!summary) throw new ToolError('summary is required');
      const type: CommunicationType = COMMUNICATION_TYPES.includes(args.type) ? args.type : 'note';
      if (args.date && !isDate(args.date)) throw new ToolError('date must be YYYY-MM-DD');
      if (args.follow_up_date && !isDate(args.follow_up_date)) throw new ToolError('follow_up_date must be YYYY-MM-DD');
      await createCommunication(company.id, {
        communicationType: type,
        subject: str(args.subject),
        summary,
        detailedNotes: str(args.detailed_notes),
        communicationDate: args.date || new Date().toISOString(),
        participants: str(args.participants),
        followUpRequired: !!args.follow_up_date || !!str(args.follow_up_notes),
        followUpDate: args.follow_up_date || undefined,
        followUpNotes: str(args.follow_up_notes),
      }, user.email);
      return `Added ${type} to ${company.companyName} (${company.companyCode}).`;
    },
  },
  {
    name: 'update_pe_checklist',
    title: 'Update PE company checklist',
    description: 'Tick/untick checklist items and set monitoring fields for a PE company: FY26/FY25 annual report received, DRHP filed, last audited financials / latest deck received dates, latest earnings update, management guidance, guidance vs actual. Only the fields given change. Ticking an item without a date records today.',
    inputSchema: {
      type: 'object',
      properties: {
        company: companyArg,
        fy26_annual_report_received: { type: 'boolean' },
        fy26_annual_report_date: { type: 'string', description: 'YYYY-MM-DD' },
        fy25_annual_report_received: { type: 'boolean' },
        fy25_annual_report_date: { type: 'string', description: 'YYYY-MM-DD' },
        drhp_filed: { type: 'boolean' },
        drhp_filed_date: { type: 'string', description: 'YYYY-MM-DD' },
        drhp_link: { type: 'string' },
        last_audited_financials_received: { type: ['string', 'null'], description: 'YYYY-MM-DD; null clears' },
        latest_deck_received: { type: ['string', 'null'], description: 'YYYY-MM-DD; null clears' },
        latest_deck_name: { type: 'string' },
        latest_earnings_update: { type: 'string' },
        latest_earnings_date: { type: 'string', description: 'YYYY-MM-DD' },
        management_guidance: { type: 'string' },
        guidance_vs_actual: { type: ['string', 'null'], enum: [...GUIDANCE_VS_ACTUAL, null] },
        guidance_vs_actual_notes: { type: 'string' },
      },
      required: ['company'],
    },
    annotations: { ...write, idempotentHint: true, title: 'Update PE company checklist' },
    async run(args) {
      const ref = await resolveCompany(args.company);
      const c = await getCompanyById(ref.id);
      if (!c) throw new ToolError('Company not found');

      const has = (k: string) => args[k] !== undefined;
      const dateArg = (k: string) => {
        if (args[k] === null || args[k] === '') return null;
        if (!isDate(args[k])) throw new ToolError(`${k} must be YYYY-MM-DD`);
        return args[k] as string;
      };
      // A checkbox and its date: ticking without a date keeps the old one or
      // records today; unticking clears the date.
      const tick = (flag: string, dateKey: string, current: boolean, currentDate: any): [boolean, any] => {
        const on = has(flag) ? !!args[flag] : current;
        if (!on) return [false, null];
        if (has(dateKey)) return [true, dateArg(dateKey)];
        return [true, currentDate || (has(flag) && !current ? today() : null)];
      };
      if (has('guidance_vs_actual') && args.guidance_vs_actual !== null && !GUIDANCE_VS_ACTUAL.includes(args.guidance_vs_actual)) {
        throw new ToolError(`guidance_vs_actual must be one of ${GUIDANCE_VS_ACTUAL.join(', ')}`);
      }

      const [fy26, fy26Date] = tick('fy26_annual_report_received', 'fy26_annual_report_date', !!c.fy26AnnualReportReceived, c.fy26AnnualReportDate);
      const [fy25, fy25Date] = tick('fy25_annual_report_received', 'fy25_annual_report_date', !!c.fy25AnnualReportReceived, c.fy25AnnualReportDate);
      const [drhp, drhpDate] = tick('drhp_filed', 'drhp_filed_date', !!c.drhpFiled, c.drhpFiledDate);
      const text = (k: string, current: string | null) => (has(k) ? (str(args[k]) ?? null) : current);

      const updated = await updateMonitoring(c.id, {
        fy26AnnualReportReceived: fy26, fy26AnnualReportDate: fy26Date,
        fy25AnnualReportReceived: fy25, fy25AnnualReportDate: fy25Date,
        drhpFiled: drhp, drhpFiledDate: drhpDate,
        drhpLink: drhp ? text('drhp_link', c.drhpLink) : null,
        lastAuditedFinancialsReceived: has('last_audited_financials_received') ? dateArg('last_audited_financials_received') : c.lastAuditedFinancialsReceived,
        latestDeckReceived: has('latest_deck_received') ? dateArg('latest_deck_received') : c.latestDeckReceived,
        latestDeckName: text('latest_deck_name', c.latestDeckName),
        latestEarningsUpdate: text('latest_earnings_update', c.latestEarningsUpdate),
        latestEarningsDate: has('latest_earnings_date') ? dateArg('latest_earnings_date') : c.latestEarningsDate,
        managementGuidance: text('management_guidance', c.managementGuidance),
        guidanceVsActual: has('guidance_vs_actual') ? (args.guidance_vs_actual ?? null) : c.guidanceVsActual,
        guidanceVsActualNotes: text('guidance_vs_actual_notes', c.guidanceVsActualNotes),
      });
      return `Updated ${c.companyName} (${c.companyCode}).\n\n${formatChecklist(updated)}`;
    },
  },
  {
    name: 'list_pe_attachments',
    title: 'List PE company attachments',
    description: 'List files attached to a PE company, with temporary download links.',
    inputSchema: { type: 'object', properties: { company: companyArg }, required: ['company'] },
    annotations: { ...read, title: 'List PE company attachments' },
    async run(args) {
      const company = await resolveCompany(args.company);
      return `${company.companyName} (${company.companyCode}) attachments:\n${formatAttachments(await listAttachments('pe', company.id))}`;
    },
  },
  {
    name: 'add_pe_attachment',
    title: 'Add PE company attachment',
    description: 'Attach a file to a PE company. Give exactly one of: source_url (public https link), text_content (saved as a .md file), or content_base64 (small files). Allowed: PDF, images, Word, Excel, PowerPoint, txt, md, csv; max 20 MB.',
    inputSchema: { type: 'object', properties: { company: companyArg, ...attachmentProps }, required: ['company'] },
    annotations: { ...write, openWorldHint: true, title: 'Add PE company attachment' },
    async run(args, user) {
      const company = await resolveCompany(args.company);
      const a = await addAttachment('pe', company.id, attachmentSource(args), user.email);
      return `Attached ${a.fileName} (${Math.max(1, Math.round(a.fileSize / 1024))} KB) to ${company.companyName} (${company.companyCode}).`;
    },
  },
  // ---- Pipeline ----
  {
    name: 'list_pipeline_ideas',
    title: 'List pipeline ideas',
    description: 'List ideas in the stock pipeline with stage, priority, owner and price move since added. Closed ideas are left out unless include_closed is true.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Part of a ticker or company name' },
        stage: { type: 'string', enum: STAGES },
        include_closed: { type: 'boolean' },
      },
    },
    annotations: { ...read, title: 'List pipeline ideas' },
    async run(args) {
      let ideas = await listIdeas();
      const q = typeof args.query === 'string' ? args.query.trim().toLowerCase() : '';
      if (q) ideas = ideas.filter(i => i.ticker.toLowerCase().includes(q) || i.companyName.toLowerCase().includes(q));
      if (STAGES.includes(args.stage)) ideas = ideas.filter(i => i.stage === args.stage);
      else if (!args.include_closed) ideas = ideas.filter(i => i.stage !== 'closed');
      if (ideas.length === 0) return 'No matching pipeline ideas.';
      return ideas.map(i => {
        const move = i.priceAtAdd && i.currentPrice ? ` · ${((i.currentPrice / i.priceAtAdd - 1) * 100).toFixed(1)}% since added` : '';
        return `- ${i.ticker} — ${i.companyName} · ${STAGE_LABEL[i.stage]}${i.outcome ? ` (${i.outcome})` : ''} · ${i.priority} · ${i.owner}${move}`;
      }).join('\n');
    },
  },
  {
    name: 'get_pipeline_idea',
    title: 'Get pipeline idea',
    description: 'Show a pipeline idea: stage, priority, owner, prices, alert, why it is interesting, its activity log (notes, stage moves, decisions) and attachments. Its forward model is read with get_stock_model using the ticker.',
    inputSchema: { type: 'object', properties: { idea: ideaArg }, required: ['idea'] },
    annotations: { ...read, title: 'Get pipeline idea' },
    async run(args) {
      const idea = await resolveIdea(args.idea);
      const [notes, attachments] = await Promise.all([getNotesByIdea(idea.id), listAttachments('pipeline', idea.id)]);
      const byId = new Map(attachments.map(a => [a.id, a]));
      const log = notes.length > 0
        ? notes.map(n => {
            const files = n.attachmentIds.map(id => byId.get(id)?.fileName).filter(Boolean);
            return `- ${date(n.createdAt)} [${n.kind}] ${n.addedBy}: ${n.noteText}${files.length ? ` (files: ${files.join(', ')})` : ''}`;
          }).join('\n')
        : 'No activity.';
      return `${formatIdea(idea)}\n\nActivity:\n${log}\n\nAttachments:\n${formatAttachments(attachments)}`;
    },
  },
  {
    name: 'add_pipeline_idea',
    title: 'Add pipeline idea',
    description: 'Add a stock to the pipeline. Looks up the price (NSE, then BSE, then SME boards) and company name from the ticker. Owner defaults to you.',
    inputSchema: {
      type: 'object',
      properties: {
        ticker: { type: 'string', description: 'NSE symbol or BSE code, e.g. "TATAELXSI"' },
        why: { type: 'string', description: 'Why it is interesting' },
        source: { type: 'string', description: 'Where the idea came from' },
        priority: { type: 'string', enum: PRIORITIES },
        stage: { type: 'string', enum: ['new', 'research', 'waiting'] },
        owner: { type: 'string', description: 'Team member name' },
        company_name: { type: 'string', description: 'Override the looked-up name' },
      },
      required: ['ticker'],
    },
    annotations: { ...write, openWorldHint: true, title: 'Add pipeline idea' },
    async run(args, user) {
      const ticker = String(args.ticker ?? '').trim().toUpperCase().replace(/\.(NS|BO)$/, '');
      if (!/^[A-Z0-9&_-]+$/.test(ticker)) throw new ToolError('ticker should be an NSE symbol or BSE code');
      const existing = await getIdeaByTicker(ticker);
      if (existing) throw new ToolError(`${ticker} is already in the pipeline:\n${formatIdea(existing)}`);
      const price = await lookupPrice(ticker);
      if (!price) throw new ToolError(`Couldn't find a price for ${ticker}. Check the symbol.`);
      const [owner, author] = await Promise.all([resolveOwner(args.owner, user), resolveOwner(undefined, user)]);
      const idea = await createIdea({
        ticker,
        companyName: str(args.company_name) || price.companyName || ticker,
        exchange: price.exchange,
        addedBy: author,
        owner,
        source: str(args.source) || 'Claude',
        why: str(args.why),
        priceAtAdd: price.price,
        stage: ['new', 'research', 'waiting'].includes(args.stage) ? args.stage : 'new',
        priority: PRIORITIES.includes(args.priority) ? args.priority : 'medium',
        dateAdded: today(),
      });
      return `Added to the pipeline:\n${formatIdea(idea)}`;
    },
  },
  {
    name: 'update_pipeline_idea',
    title: 'Update pipeline idea',
    description: 'Change a pipeline idea\'s stage, priority, owner, tag or "why", or set/clear its alert (a price level, or an event with an optional due date). Only the fields given change. Use decide_pipeline_idea to close it as bought/passed.',
    inputSchema: {
      type: 'object',
      properties: {
        idea: ideaArg,
        stage: { type: 'string', enum: STAGES },
        priority: { type: 'string', enum: PRIORITIES },
        owner: { type: 'string', description: 'Team member name' },
        why: { type: 'string' },
        tag: { type: ['string', 'null'] },
        price_alert: { type: 'number', description: 'Alert when price falls to this level (₹)' },
        event_alert: {
          type: 'object',
          properties: { text: { type: 'string' }, due_date: { type: 'string', description: 'YYYY-MM-DD' } },
          required: ['text'],
        },
        clear_alert: { type: 'boolean' },
      },
      required: ['idea'],
    },
    annotations: { ...write, idempotentHint: true, title: 'Update pipeline idea' },
    async run(args, user) {
      const idea = await resolveIdea(args.idea);
      const data: UpdateIdeaRequest = {};
      if (args.stage !== undefined) {
        if (!STAGES.includes(args.stage)) throw new ToolError(`stage must be one of ${STAGES.join(', ')}`);
        data.stage = args.stage;
      }
      if (args.priority !== undefined) {
        if (!PRIORITIES.includes(args.priority)) throw new ToolError(`priority must be one of ${PRIORITIES.join(', ')}`);
        data.priority = args.priority;
      }
      if (args.owner !== undefined) data.owner = await resolveOwner(args.owner, user);
      if (args.why !== undefined) data.why = str(args.why) ?? null;
      if (args.tag !== undefined) data.tag = str(args.tag) ?? null;
      const alerts = [args.price_alert !== undefined, args.event_alert !== undefined, !!args.clear_alert].filter(Boolean).length;
      if (alerts > 1) throw new ToolError('Give only one of price_alert, event_alert or clear_alert');
      if (args.price_alert !== undefined) {
        if (!(Number(args.price_alert) > 0)) throw new ToolError('price_alert must be a positive number');
        data.alert = { type: 'price', value: Number(args.price_alert) };
      } else if (args.event_alert !== undefined) {
        const text = str(args.event_alert?.text);
        if (!text) throw new ToolError('event_alert.text is required');
        if (args.event_alert.due_date && !isDate(args.event_alert.due_date)) throw new ToolError('event_alert.due_date must be YYYY-MM-DD');
        data.alert = { type: 'event', text, dueDate: args.event_alert.due_date || null };
      } else if (args.clear_alert) {
        data.alert = null;
      }
      if (Object.keys(data).length === 0) throw new ToolError('Nothing to change');
      const updated = await updateIdea(idea.id, data, await resolveOwner(undefined, user));
      return `Updated:\n${formatIdea(updated || idea)}`;
    },
  },
  {
    name: 'decide_pipeline_idea',
    title: 'Close pipeline idea (bought / passed)',
    description: 'Close a pipeline idea as bought or passed, with a one-line reason (logged in its activity).',
    inputSchema: {
      type: 'object',
      properties: { idea: ideaArg, outcome: { type: 'string', enum: ['bought', 'passed'] }, reason: { type: 'string' } },
      required: ['idea', 'outcome', 'reason'],
    },
    annotations: { ...write, title: 'Close pipeline idea' },
    async run(args, user) {
      const idea = await resolveIdea(args.idea);
      if (args.outcome !== 'bought' && args.outcome !== 'passed') throw new ToolError("outcome must be 'bought' or 'passed'");
      const reason = str(args.reason);
      if (!reason) throw new ToolError('reason is required');
      const updated = await decideIdea(idea.id, args.outcome, reason, await resolveOwner(undefined, user));
      return `Closed as ${args.outcome}:\n${formatIdea(updated || idea)}`;
    },
  },
  {
    name: 'add_pipeline_note',
    title: 'Add pipeline note',
    description: 'Add a note to a pipeline idea\'s activity log.',
    inputSchema: { type: 'object', properties: { idea: ideaArg, text: { type: 'string' } }, required: ['idea', 'text'] },
    annotations: { ...write, title: 'Add pipeline note' },
    async run(args, user) {
      const idea = await resolveIdea(args.idea);
      const text = str(args.text);
      if (!text) throw new ToolError('text is required');
      await createNote(idea.id, text, await resolveOwner(undefined, user));
      return `Note added to ${idea.companyName} (${idea.ticker}).`;
    },
  },
  {
    name: 'add_pipeline_attachment',
    title: 'Add pipeline attachment',
    description: 'Attach a file to a pipeline idea (posted in its activity log, with an optional note). Give exactly one of: source_url (public https link), text_content (saved as a .md file), or content_base64 (small files). Allowed: PDF, images, Word, Excel, PowerPoint, txt, md, csv; max 20 MB.',
    inputSchema: {
      type: 'object',
      properties: { idea: ideaArg, note: { type: 'string', description: 'Optional text posted with the file' }, ...attachmentProps },
      required: ['idea'],
    },
    annotations: { ...write, openWorldHint: true, title: 'Add pipeline attachment' },
    async run(args, user) {
      const idea = await resolveIdea(args.idea);
      const a = await addAttachment('pipeline', idea.id, attachmentSource(args), user.email);
      await createNote(idea.id, str(args.note) || '', await resolveOwner(undefined, user), [a.id]);
      return `Attached ${a.fileName} (${Math.max(1, Math.round(a.fileSize / 1024))} KB) to ${idea.companyName} (${idea.ticker}).`;
    },
  },
  {
    name: 'list_pipeline_guidance',
    title: 'List guidance tracker',
    description: 'List management guidance entries (metric, guided vs current value, timeframe, source) from the pipeline\'s guidance tracker, with their ids.',
    inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Part of a ticker or company name' } } },
    annotations: { ...read, title: 'List guidance tracker' },
    async run(args) {
      let rows = await listGuidance();
      const q = typeof args.query === 'string' ? args.query.trim().toLowerCase() : '';
      if (q) rows = rows.filter(g => g.ticker.toLowerCase().includes(q) || g.companyName.toLowerCase().includes(q));
      if (rows.length === 0) return 'No guidance entries.';
      return rows.map(g =>
        `- [${g.id}] ${g.ticker} — ${g.companyName}: ${g.metric} guided ${g.guidedValue ?? '—'}${g.guidedUnit ? ` ${g.guidedUnit}` : ''}`
        + `, current ${g.currentValue ?? '—'}${g.timeframe ? ` · ${g.timeframe}` : ''}${g.sourceContext ? ` · ${g.sourceContext}` : ''}`,
      ).join('\n');
    },
  },
  {
    name: 'add_pipeline_guidance',
    title: 'Add guidance entry',
    description: 'Record a management guidance item in the guidance tracker (e.g. "FY27 revenue growth 20%").',
    inputSchema: {
      type: 'object',
      properties: {
        ticker: { type: 'string' },
        company_name: { type: 'string', description: 'Needed if the ticker is not a pipeline idea' },
        metric: { type: 'string', description: 'Revenue, EBITDA, PAT, Market Cap, Sales Volume, Margin % or Other' },
        guided_value: { type: 'number' },
        guided_unit: { type: 'string', description: 'e.g. "₹ Cr", "%", "units"' },
        current_value: { type: 'number' },
        timeframe: { type: 'string', description: 'e.g. FY27' },
        source_context: { type: 'string', description: 'e.g. "Q2FY27 concall"' },
      },
      required: ['ticker', 'metric'],
    },
    annotations: { ...write, title: 'Add guidance entry' },
    async run(args) {
      const ticker = String(args.ticker ?? '').trim().toUpperCase();
      const metric = str(args.metric);
      if (!ticker || !metric) throw new ToolError('ticker and metric are required');
      const companyName = str(args.company_name) || (await getIdeaByTicker(ticker))?.companyName;
      if (!companyName) throw new ToolError(`${ticker} isn't a pipeline idea — pass company_name`);
      const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
      const g = await createGuidance({
        ticker, companyName, metric,
        guidedValue: num(args.guided_value), guidedUnit: str(args.guided_unit) ?? null,
        currentValue: num(args.current_value), timeframe: str(args.timeframe) ?? null, sourceContext: str(args.source_context) ?? null,
      });
      return `Added guidance [${g.id}] for ${g.companyName}: ${g.metric} ${g.guidedValue ?? ''}${g.guidedUnit ? ` ${g.guidedUnit}` : ''}${g.timeframe ? ` (${g.timeframe})` : ''}.`;
    },
  },
  {
    name: 'update_pipeline_guidance',
    title: 'Update guidance entry',
    description: 'Update a guidance tracker entry by id (from list_pipeline_guidance), e.g. set the current/actual value. Only the fields given change.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        metric: { type: 'string' },
        guided_value: { type: ['number', 'null'] },
        guided_unit: { type: ['string', 'null'] },
        current_value: { type: ['number', 'null'] },
        timeframe: { type: ['string', 'null'] },
        source_context: { type: ['string', 'null'] },
      },
      required: ['id'],
    },
    annotations: { ...write, idempotentHint: true, title: 'Update guidance entry' },
    async run(args) {
      const existing = (await listGuidance()).find(g => g.id === args.id);
      if (!existing) throw new ToolError('No guidance entry with that id — use list_pipeline_guidance');
      const pickVal = <T,>(k: string, cur: T) => (args[k] === undefined ? cur : args[k]);
      // updateGuidance overwrites every value column, so pass the merged row.
      const g = await updateGuidance(existing.id, {
        metric: str(args.metric) || existing.metric,
        guidedValue: pickVal('guided_value', existing.guidedValue),
        guidedUnit: pickVal('guided_unit', existing.guidedUnit),
        currentValue: pickVal('current_value', existing.currentValue),
        timeframe: pickVal('timeframe', existing.timeframe),
        sourceContext: pickVal('source_context', existing.sourceContext),
      });
      if (!g) throw new ToolError('Guidance entry not found');
      return `Updated guidance [${g.id}] ${g.ticker} ${g.metric}: guided ${g.guidedValue ?? '—'}${g.guidedUnit ? ` ${g.guidedUnit}` : ''}, current ${g.currentValue ?? '—'}${g.timeframe ? ` (${g.timeframe})` : ''}.`;
    },
  },
];

function attachmentSource(args: Args) {
  const s = (v: unknown) => (typeof v === 'string' && v.length > 0 ? v : undefined);
  return {
    fileName: s(args.file_name),
    mimeType: s(args.mime_type),
    contentBase64: s(args.content_base64),
    textContent: s(args.text_content),
    sourceUrl: s(args.source_url),
  };
}

export async function callTool(name: string, args: Args, user: McpUser): Promise<{ text: string; isError: boolean }> {
  const tool = TOOLS.find(t => t.name === name);
  if (!tool) return { text: `Unknown tool: ${name}`, isError: true };
  try {
    return { text: await tool.run(args || {}, user), isError: false };
  } catch (error: any) {
    if (error instanceof ToolError) return { text: error.message, isError: true };
    console.error(`MCP tool ${name} failed:`, error);
    return { text: `${tool.title} failed due to a server error.`, isError: true };
  }
}
