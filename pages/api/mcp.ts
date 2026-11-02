import { NextApiRequest, NextApiResponse } from 'next';
import { verifyAccessToken, publicOrigin, McpUser } from '../../lib/mcp/oauth';
import { TOOLS, callTool } from '../../lib/mcp/tools';
import { getFirmSettingsSafe } from '../../lib/firmSettings';

// Claude connector: a stateless MCP server over Streamable HTTP. Every POST is
// one JSON-RPC message (or batch) answered with plain JSON — no sessions or SSE.
// Auth is an OAuth bearer token from /api/oauth/token (see lib/mcp/oauth.ts).

export const config = { api: { bodyParser: { sizeLimit: '30mb' } } };

const SUPPORTED_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];

interface RpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: any;
}

const rpcError = (id: RpcRequest['id'], code: number, message: string) =>
  ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

async function handleMessage(msg: RpcRequest, user: McpUser): Promise<object | null> {
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    return rpcError(msg?.id, -32600, 'Invalid request');
  }
  // Notifications (no id) get no response.
  if (msg.id === undefined || msg.id === null) return null;
  const ok = (result: object) => ({ jsonrpc: '2.0', id: msg.id, result });

  switch (msg.method) {
    case 'initialize': {
      const requested = msg.params?.protocolVersion;
      const firm = await getFirmSettingsSafe();
      return ok({
        protocolVersion: SUPPORTED_VERSIONS.includes(requested) ? requested : SUPPORTED_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: `${firm.shortName || firm.name} Portfolio Insights`, version: '1.0.0' },
        instructions:
          `Portfolio Insights for ${firm.name}, signed in as ${user.email}. ` +
          'Public portfolio stocks are identified by NSE/BSE code (search_portfolio_stocks); PE tracker companies by code or name (list_pe_companies). ' +
          'Forward models are grids of rows × fiscal years (FY ends in March; "E" marks estimates). ' +
          'Read a model before updating it, and confirm the values with the user before writing.',
      });
    }
    case 'ping':
      return ok({});
    case 'tools/list':
      return ok({
        tools: TOOLS.map(t => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema, annotations: t.annotations })),
      });
    case 'tools/call': {
      const name = msg.params?.name;
      if (typeof name !== 'string') return rpcError(msg.id, -32602, 'Tool name is required');
      if (!TOOLS.some(t => t.name === name)) return rpcError(msg.id, -32602, `Unknown tool: ${name}`);
      const { text, isError } = await callTool(name, msg.params?.arguments || {}, user);
      return ok({ content: [{ type: 'text', text }], isError });
    }
    case 'resources/list':
      return ok({ resources: [] });
    case 'prompts/list':
      return ok({ prompts: [] });
    default:
      return rpcError(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Mcp-Session-Id, MCP-Protocol-Version');
  res.setHeader('Access-Control-Expose-Headers', 'WWW-Authenticate');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const origin = publicOrigin(name => {
    const v = req.headers[name];
    return Array.isArray(v) ? v[0] : v;
  });
  const bearer = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  const user = bearer ? await verifyAccessToken(bearer) : null;
  if (!user) {
    res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`);
    return res.status(401).json(rpcError(null, -32001, 'Authentication required'));
  }

  // No server-initiated stream (GET) and no sessions to end (DELETE).
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json(rpcError(null, -32000, 'Method not allowed'));
  }

  const body = req.body;
  try {
    if (Array.isArray(body)) {
      const replies = (await Promise.all(body.map(m => handleMessage(m, user)))).filter(Boolean);
      return replies.length > 0 ? res.status(200).json(replies) : res.status(202).end();
    }
    const reply = await handleMessage(body, user);
    return reply ? res.status(200).json(reply) : res.status(202).end();
  } catch (error) {
    console.error('MCP request failed:', error);
    return res.status(500).json(rpcError(Array.isArray(body) ? null : body?.id, -32603, 'Internal error'));
  }
}
