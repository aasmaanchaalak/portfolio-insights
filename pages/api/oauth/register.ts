import { NextApiRequest, NextApiResponse } from 'next';
import { registerClient } from '../../../lib/mcp/oauth';

// Dynamic client registration (RFC 7591) for the Claude connector. Clients are
// public (PKCE, no secret); a registration alone grants nothing until a signed-in
// user approves it on /oauth/authorize.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'invalid_request', error_description: 'POST only' });
  }

  const { client_name, redirect_uris } = req.body || {};
  try {
    const client = await registerClient(typeof client_name === 'string' ? client_name : null, redirect_uris);
    return res.status(201).json({
      client_id: client.clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: client.clientName ?? undefined,
      redirect_uris: client.redirectUris,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    });
  } catch (error: any) {
    return res.status(400).json({ error: 'invalid_redirect_uri', error_description: error.message });
  }
}
