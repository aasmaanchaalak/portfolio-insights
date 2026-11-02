import { protectedResourceMetadata, publicOrigin } from '../../../../lib/mcp/oauth';

// OAuth protected resource metadata (RFC 9728): tells Claude that /api/mcp is
// guarded by this app's own authorization server.
export function GET(req: Request) {
  const origin = publicOrigin(name => req.headers.get(name));
  return Response.json(protectedResourceMetadata(origin), {
    headers: { 'Access-Control-Allow-Origin': '*' },
  });
}
