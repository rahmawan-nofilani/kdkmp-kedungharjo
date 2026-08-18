# PWA Installability

The web app now uses Next.js App Router metadata conventions:
- `src/app/manifest.ts`
- `src/app/icon.svg`

## Scope
- standalone home-screen install experience after the production site is served over HTTPS
- start URL `/dashboard`
- application scope `/`
- Indonesian app metadata

## Deliberate safety boundary
No transaction pages or authenticated financial data are cached for offline use. No service worker is added merely to simulate offline support.

Current Next.js guidance states that a valid web app manifest plus HTTPS is sufficient for home-screen installation in modern browsers; offline support is optional. For this financial application, any future offline transaction mode must be designed as a separate synchronization/idempotency project rather than introduced through generic page caching.

## Verification after deployment
- open the HTTPS production URL on Android Chrome and desktop Chromium
- confirm the manifest is loaded and icon/name are correct
- install/add to home screen
- launch from the installed app and confirm authentication redirects correctly
- verify navigation and logout
- do not mark offline financial operations supported

Android APK/Capacitor packaging remains after the production web URL has passed live UAT.
