# Android Packaging Decision

## Current release architecture
KDKMP is a server-rendered Next.js application deployed through OpenNext to Cloudflare Workers. The operational UI depends on server-side rendering, Supabase Auth, Cloudflare D1 bindings, and protected server actions.

## Why an immediate Capacitor wrapper is NOT shipped
Capacitor expects `webDir` to contain compiled web assets including an `index.html`. KDKMP does not produce a standalone static SPA export because its authenticated financial workflows require the server runtime.

Capacitor also provides `server.url` for loading an external URL into the native WebView, but the Capacitor configuration reference explicitly documents that option for live-reload servers and says it is not intended for production.

Therefore this repository deliberately does not create a production Android APK that merely embeds the live website through `server.url`. Doing so would produce a misleading package with weaker operational guarantees than the verified HTTPS PWA.

## Supported mobile path for this release
1. Deploy the web application to HTTPS production.
2. Pass `/readiness`, live smoke tests, synthetic-data UAT, backup/restore verification, and reconciliation checks.
3. Verify the installable PWA on Android Chrome.
4. Use the PWA as the supported mobile release while native requirements are evaluated.

## Future Android options
A native package should start only after the production URL is stable. The implementation must choose one explicit architecture:
- build a real static/native client that calls controlled APIs while keeping financial writes on protected server boundaries; or
- adopt a standards-based Android wrapper strategy suitable for a verified PWA, with domain ownership/signing verification.

The chosen path must preserve authentication, maker-checker controls, idempotency, append-only financial history, and no unsafe offline transaction replay.

## Release boundary
Android packaging is NOT a blocker for the primary web/teller go-live. It is a separate release track after production web/PWA UAT.
