// OAuth 2.1 for the Claude connector (MCP). Claude registers itself as a public
// client (RFC 7591), sends the user to /oauth/authorize to approve, then trades
// the code + PKCE verifier for opaque bearer tokens. Tokens are stored hashed
// and resolve to the approving user, so tools run with that user's role.

import { createHash, randomBytes } from 'crypto';
import { query, queryOne } from '../db';
import { UserRole } from '../queries';

export const ACCESS_TOKEN_SECONDS = 60 * 60;            // 1 hour
const REFRESH_TOKEN_SECONDS = 90 * 24 * 60 * 60;        // 90 days, rotated on use
const CODE_SECONDS = 10 * 60;
export const MCP_SCOPE = 'portfolio';

// Same statements as scripts/migrations/033_mcp_oauth.sql, applied once per
// process so the connector works where the migration hasn't been run.
let schemaReady: Promise<void> | null = null;
function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = query(`
      CREATE TABLE IF NOT EXISTS mcp_oauth_clients (
        client_id TEXT PRIMARY KEY,
        client_name TEXT,
        redirect_uris TEXT[] NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS mcp_oauth_codes (
        code_hash TEXT PRIMARY KEY,
        client_id TEXT NOT NULL REFERENCES mcp_oauth_clients(client_id) ON DELETE CASCADE,
        user_email VARCHAR(255) NOT NULL REFERENCES users(email) ON DELETE CASCADE,
        redirect_uri TEXT NOT NULL,
        code_challenge TEXT NOT NULL,
        scope TEXT,
        expires_at TIMESTAMPTZ NOT NULL
      );
      CREATE TABLE IF NOT EXISTS mcp_oauth_tokens (
        token_hash TEXT PRIMARY KEY,
        kind VARCHAR(10) NOT NULL CHECK (kind IN ('access', 'refresh')),
        client_id TEXT NOT NULL REFERENCES mcp_oauth_clients(client_id) ON DELETE CASCADE,
        user_email VARCHAR(255) NOT NULL REFERENCES users(email) ON DELETE CASCADE,
        scope TEXT,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_used_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS mcp_oauth_tokens_user_idx ON mcp_oauth_tokens (user_email);
    `).then(() => undefined, err => { schemaReady = null; throw err; });
  }
  return schemaReady;
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const randomToken = () => randomBytes(32).toString('base64url');

/** Public origin of this deployment, e.g. https://app.example.com. */
export function publicOrigin(getHeader: (name: string) => string | null | undefined): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, '');
  const host = getHeader('x-forwarded-host') || getHeader('host') || 'localhost:3000';
  const proto = getHeader('x-forwarded-proto') || (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? 'http' : 'https');
  return `${proto.split(',')[0].trim()}://${host.split(',')[0].trim()}`;
}

export function authorizationServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: [MCP_SCOPE],
  };
}

export function protectedResourceMetadata(origin: string) {
  return {
    resource: `${origin}/api/mcp`,
    authorization_servers: [origin],
    scopes_supported: [MCP_SCOPE],
    bearer_methods_supported: ['header'],
  };
}

// ============ Clients ============

export interface OAuthClient {
  clientId: string;
  clientName: string | null;
  redirectUris: string[];
}

function isAllowedRedirect(uri: string): boolean {
  try {
    const u = new URL(uri);
    if (u.hash) return false;
    if (u.protocol === 'https:') return true;
    return u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  } catch {
    return false;
  }
}

export async function registerClient(clientName: string | null, redirectUris: unknown): Promise<OAuthClient> {
  if (!Array.isArray(redirectUris) || redirectUris.length === 0 || redirectUris.length > 10
      || !redirectUris.every(u => typeof u === 'string' && isAllowedRedirect(u))) {
    throw new Error('redirect_uris must be https (or http://localhost) URLs');
  }
  await ensureSchema();
  const clientId = `mcp_${randomBytes(16).toString('hex')}`;
  const name = clientName ? clientName.slice(0, 200) : null;
  await query(
    `INSERT INTO mcp_oauth_clients (client_id, client_name, redirect_uris) VALUES ($1, $2, $3)`,
    [clientId, name, redirectUris],
  );
  return { clientId, clientName: name, redirectUris: redirectUris as string[] };
}

export async function getClient(clientId: string): Promise<OAuthClient | null> {
  await ensureSchema();
  const row = await queryOne<{ client_id: string; client_name: string | null; redirect_uris: string[] }>(
    `SELECT client_id, client_name, redirect_uris FROM mcp_oauth_clients WHERE client_id = $1`,
    [clientId],
  );
  return row ? { clientId: row.client_id, clientName: row.client_name, redirectUris: row.redirect_uris } : null;
}

// ============ Authorization codes ============

export async function createAuthorizationCode(p: {
  clientId: string; userEmail: string; redirectUri: string; codeChallenge: string; scope: string | null;
}): Promise<string> {
  await ensureSchema();
  const code = randomToken();
  await query(
    `INSERT INTO mcp_oauth_codes (code_hash, client_id, user_email, redirect_uri, code_challenge, scope, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW() + make_interval(secs => $7))`,
    [sha256(code), p.clientId, p.userEmail, p.redirectUri, p.codeChallenge, p.scope, CODE_SECONDS],
  );
  return code;
}

export interface TokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token: string;
  scope: string;
}

async function issueTokens(clientId: string, userEmail: string, scope: string | null): Promise<TokenResponse> {
  const access = randomToken();
  const refresh = randomToken();
  await query(`DELETE FROM mcp_oauth_tokens WHERE expires_at < NOW()`);
  await query(
    `INSERT INTO mcp_oauth_tokens (token_hash, kind, client_id, user_email, scope, expires_at) VALUES
       ($1, 'access',  $3, $4, $5, NOW() + make_interval(secs => $6)),
       ($2, 'refresh', $3, $4, $5, NOW() + make_interval(secs => $7))`,
    [sha256(access), sha256(refresh), clientId, userEmail, scope, ACCESS_TOKEN_SECONDS, REFRESH_TOKEN_SECONDS],
  );
  return {
    access_token: access,
    token_type: 'Bearer',
    expires_in: ACCESS_TOKEN_SECONDS,
    refresh_token: refresh,
    scope: scope || MCP_SCOPE,
  };
}

export class OAuthError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

/** authorization_code grant: single-use code, PKCE S256, exact redirect_uri. */
export async function exchangeCode(p: {
  code: string; clientId: string; redirectUri: string; codeVerifier: string;
}): Promise<TokenResponse> {
  await ensureSchema();
  const row = await queryOne<{
    client_id: string; user_email: string; redirect_uri: string; code_challenge: string; scope: string | null; expired: boolean;
  }>(
    `DELETE FROM mcp_oauth_codes WHERE code_hash = $1
     RETURNING client_id, user_email, redirect_uri, code_challenge, scope, expires_at < NOW() AS expired`,
    [sha256(p.code)],
  );
  if (!row || row.expired) throw new OAuthError('invalid_grant', 'Authorization code is invalid or expired');
  if (row.client_id !== p.clientId) throw new OAuthError('invalid_grant', 'Code was issued to another client');
  if (row.redirect_uri !== p.redirectUri) throw new OAuthError('invalid_grant', 'redirect_uri does not match');
  const challenge = createHash('sha256').update(p.codeVerifier).digest('base64url');
  if (challenge !== row.code_challenge) throw new OAuthError('invalid_grant', 'PKCE verification failed');
  return issueTokens(row.client_id, row.user_email, row.scope);
}

/** refresh_token grant: the old refresh token is consumed and a new pair issued. */
export async function refreshTokens(refreshToken: string, clientId: string): Promise<TokenResponse> {
  await ensureSchema();
  const row = await queryOne<{ client_id: string; user_email: string; scope: string | null; expired: boolean }>(
    `DELETE FROM mcp_oauth_tokens WHERE token_hash = $1 AND kind = 'refresh'
     RETURNING client_id, user_email, scope, expires_at < NOW() AS expired`,
    [sha256(refreshToken)],
  );
  if (!row || row.expired) throw new OAuthError('invalid_grant', 'Refresh token is invalid or expired');
  if (clientId && row.client_id !== clientId) throw new OAuthError('invalid_grant', 'Token was issued to another client');
  return issueTokens(row.client_id, row.user_email, row.scope);
}

// ============ Bearer verification ============

export interface McpUser {
  email: string;
  name: string | null;
  role: UserRole;
  isAdmin: boolean;
}

export async function verifyAccessToken(token: string): Promise<McpUser | null> {
  await ensureSchema();
  const row = await queryOne<{ email: string; name: string | null; role: UserRole | null; is_admin: boolean }>(
    `UPDATE mcp_oauth_tokens t SET last_used_at = NOW()
     FROM users u
     WHERE t.token_hash = $1 AND t.kind = 'access' AND t.expires_at > NOW() AND u.email = t.user_email
     RETURNING u.email, u.name, u.role, u.is_admin`,
    [sha256(token)],
  );
  if (!row) return null;
  return { email: row.email, name: row.name, role: row.role || 'analyst', isAdmin: !!row.is_admin };
}
