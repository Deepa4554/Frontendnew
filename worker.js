/**
 * Cloudflare Worker entry point for the web build.
 *
 * Two jobs, and BOTH are load-bearing — dropping either one breaks the live app
 * in a way that doesn't look like a routing bug from the outside:
 *
 * 1. Proxy /api/* and /hubs/* to the backend. The browser talks to the app's own
 *    origin (see connect-src in public/index.html's CSP, and the matching rewrites
 *    in vercel.json), so without this the static asset server answers those itself:
 *    POST /api/auth/login comes back 405, and every login fails.
 *
 * 2. Serve the SPA shell for client-side routes. /dashboard is not a built file, so
 *    the assets service 404s it; React Navigation can only resolve that path once
 *    index.html has actually loaded.
 *
 * The order matters and is the whole reason the fallback lives here rather than in
 * `not_found_handling`: an unconditional "serve index.html when no asset matches"
 * would also swallow GET /api/settings and answer it with HTML at status 200. The
 * app reads hasCompletedOnboarding off that response, gets undefined, and sends a
 * fully onboarded cafe back through onboarding on every screen.
 */

const BACKEND_ORIGIN = 'https://cafeposapi-et7f.onrender.com';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/hubs/')) {
      return fetch(new Request(BACKEND_ORIGIN + url.pathname + url.search, request));
    }

    const asset = await env.ASSETS.fetch(request);

    // Only GETs are navigations worth falling back for. A 404 on anything else is a
    // genuine missing file and should stay a 404 rather than become an HTML page.
    if (asset.status === 404 && request.method === 'GET') {
      // "/" and not "/index.html": asking the assets service for the filename gets a
      // 307 back to the directory, and forcing that redirect to 200 serves a
      // zero-byte body with a stray Location header — a blank page on every
      // client-side route, which looks exactly like the app failing to boot.
      const shell = await env.ASSETS.fetch(new Request(new URL('/', url), request));
      return new Response(shell.body, { status: 200, headers: shell.headers });
    }

    return asset;
  },
};
