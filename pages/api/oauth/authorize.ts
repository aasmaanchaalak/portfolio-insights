import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth, authUser } from '../../../lib/authMiddleware';
import { getClient, createAuthorizationCode, MCP_SCOPE } from '../../../lib/mcp/oauth';

// Backs the /oauth/authorize consent page. GET checks the request and returns
// the client's name; POST (signed-in user) approves or denies and returns the
// URL to send the browser back to.
async function handler(req: NextApiRequest, res: NextApiResponse) {
  const src = req.method === 'POST' ? (req.body || {}) : req.query;
  const str = (k: string) => (typeof src[k] === 'string' ? (src[k] as string) : '');
  const clientId = str('client_id');
  const redirectUri = str('redirect_uri');

  const client = clientId ? await getClient(clientId) : null;
  // Never redirect to a URI the client didn't register — show the error instead.
  if (!client) return res.status(400).json({ error: 'Unknown client. Remove and re-add the connector in Claude.' });
  if (!client.redirectUris.includes(redirectUri)) return res.status(400).json({ error: 'redirect_uri is not registered for this client' });

  const back = (params: Record<string, string>) => {
    const url = new URL(redirectUri);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    if (str('state')) url.searchParams.set('state', str('state'));
    return url.toString();
  };

  if (str('response_type') !== 'code') {
    return res.status(200).json({ redirect: back({ error: 'unsupported_response_type' }) });
  }
  if (!str('code_challenge') || str('code_challenge_method') !== 'S256') {
    return res.status(200).json({ redirect: back({ error: 'invalid_request', error_description: 'PKCE (S256) is required' }) });
  }

  if (req.method === 'GET') {
    return res.status(200).json({ clientName: client.clientName || 'Claude' });
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (req.body?.approve !== true) {
    return res.status(200).json({ redirect: back({ error: 'access_denied' }) });
  }

  const code = await createAuthorizationCode({
    clientId,
    userEmail: authUser(req).email,
    redirectUri,
    codeChallenge: str('code_challenge'),
    scope: str('scope') || MCP_SCOPE,
  });
  return res.status(200).json({ redirect: back({ code }) });
}

export default withAuth(handler);
