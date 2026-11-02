import { authorizationServerMetadata, publicOrigin } from '../../../../lib/mcp/oauth';

// OAuth authorization server metadata (RFC 8414) for the Claude connector.
// The catch-all also answers path-suffixed lookups (…/oauth-authorization-server/api/mcp).
export function GET(req: Request) {
  const origin = publicOrigin(name => req.headers.get(name));
  return Response.json(authorizationServerMetadata(origin), {
    headers: { 'Access-Control-Allow-Origin': '*' },
  });
}
