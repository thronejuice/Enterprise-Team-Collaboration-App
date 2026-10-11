import { NextRequest, NextResponse } from 'next/server';

/** Cheap pre-check: without a session cookie, go straight to the login page. The API remains the authority. */
export function proxy(req: NextRequest) {
  if (!req.cookies.has('sid')) {
    // Behind Caddy the request URL carries the internal origin, so rebuild the public one.
    const proto = req.headers.get('x-forwarded-proto') ?? 'https';
    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
    const next = encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(`${proto}://${host}/login?next=${next}`);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!login|api|livekit|_next|icon.svg|favicon.ico).*)'],
};
