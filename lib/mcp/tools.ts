// Tools the Claude connector exposes. Each runs as the user who approved the
// connector, with the same rules as the app: analysts don't see public holdings
// below the visibility threshold, and amounts/quantities are never returned.

import { query } from '../db';
import { getGridKeyData, getAnalystOverrides, isVisibleToAnalyst, getCurrentFiscalYear } from '../queries';
import { getThesisByStockCode, getForwardMetrics, upsertForwardMetrics, addNote } from '../thesis/queries';
import { listCompanies, getCompanyById, getValuation, upsertValuation, getCommunications, createCommunication } from '../pe/queries';
import { CommunicationType, ValuationTableData } from '../../types/pe';
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

// Current holdings (PF Data) plus any stock that already has a thesis or model.
async function stockUniverse(user: McpUser): Promise<StockRef[]> {
  const [holdings, theses, overrides] = await Promise.all([
    getGridKeyData(),
    query<{ stock_code: string; stock_name: string; has_model: boolean; note_count: string }>(
      `SELECT t.stock_code, t.stock_name, t.forward_metrics IS NOT NULL AS has_model,
              (SELECT COUNT(*) FROM thesis_notes n WHERE n.thesis_id = t.id) AS note_count
       FROM theses t`,
    ),
    getAnalystOverrides(),
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

const date = (d: string | Date | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : '');

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

// ============ Schemas ============

const stockArg = { type: 'string', description: 'NSE/BSE code or company name of a public portfolio stock, e.g. "HDFCBANK"' };
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
    description: 'List public portfolio stocks (current holdings and stocks with a thesis) with their codes, whether a forward model exists and how many notes they have. Omit query to list all.',
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
    description: 'Set cells in a portfolio stock\'s forward model (e.g. after results). Only the given cells change. Target price comes from EPS × P/E (target), or (EBITDA × EV/EBITDA − net debt) ÷ shares when P/E is blank. Use ₹ Cr for EBITDA/PAT/net debt, Cr for shares. Call get_stock_model first to see the rows.',
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
    description: 'Show a PE company\'s thesis summary and its notes / communication log (newest first).',
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
      const isDate = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
      if (args.date && !isDate(args.date)) throw new ToolError('date must be YYYY-MM-DD');
      if (args.follow_up_date && !isDate(args.follow_up_date)) throw new ToolError('follow_up_date must be YYYY-MM-DD');
      const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

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
