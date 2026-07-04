/**
 * Adds a NextRequest-style `cookies` API (parsed from the raw cookie header)
 * to a plain fetch Request, so route handlers that call authenticateRequest —
 * which reads `req.cookies.get(...)` — work in tests without constructing a
 * real NextRequest.
 */
export function withCookiesShim(req: Request): Request {
  const raw = req.headers.get('cookie') ?? '';
  const jar = new Map(
    raw
      .split(';')
      .map((p) => p.trim())
      .filter((p) => p.includes('='))
      .map((p) => {
        const idx = p.indexOf('=');
        return [p.slice(0, idx), p.slice(idx + 1)] as const;
      }),
  );
  Object.defineProperty(req, 'cookies', {
    value: {
      get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    },
    configurable: true,
  });
  return req;
}
