/** URL canônica do CRM (issuer OAuth e origem do resource /api/mcp). */
export function issuerUrl(): string {
  const base = process.env.AUTH_URL ?? '';
  return base.replace(/\/+$/, '');
}

export function mcpResourceUrl(): string {
  return `${issuerUrl()}/api/mcp`;
}

export function protectedResourceMetadataUrl(): string {
  return `${issuerUrl()}/.well-known/oauth-protected-resource`;
}
