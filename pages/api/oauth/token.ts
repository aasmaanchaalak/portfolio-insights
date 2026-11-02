import { NextApiRequest, NextApiResponse } from 'next';
import { exchangeCode, refreshTokens, OAuthError } from '../../../lib/mcp/oauth';

// OAuth token endpoint for the Claude connector (form-encoded per RFC 6749).
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'invalid_request', error_description: 'POST only' });
  }
  res.setHeader('Cache-Control', 'no-store');

  const body = req.body || {};
  const str = (k: string) => (typeof body[k] === 'string' ? body[k] : '');

  try {
    if (body.grant_type === 'authorization_code') {
      if (!str('code') || !str('client_id') || !str('redirect_uri') || !str('code_verifier')) {
        return res.status(400).json({ error: 'invalid_request', error_description: 'code, client_id, redirect_uri and code_verifier are required' });
      }
      const tokens = await exchangeCode({
        code: str('code'), clientId: str('client_id'), redirectUri: str('redirect_uri'), codeVerifier: str('code_verifier'),
      });
      return res.status(200).json(tokens);
    }

    if (body.grant_type === 'refresh_token') {
      if (!str('refresh_token')) {
        return res.status(400).json({ error: 'invalid_request', error_description: 'refresh_token is required' });
      }
      return res.status(200).json(await refreshTokens(str('refresh_token'), str('client_id')));
    }

    return res.status(400).json({ error: 'unsupported_grant_type' });
  } catch (error) {
    if (error instanceof OAuthError) {
      return res.status(400).json({ error: error.code, error_description: error.message });
    }
    console.error('OAuth token error:', error);
    return res.status(500).json({ error: 'server_error' });
  }
}
