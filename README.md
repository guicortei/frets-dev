# frets.dev

Open source fretboard training tools built with Next.js.

`frets.dev` starts with a note trainer focused on fast, repeatable practice:

- random note generation
- bilingual voice output (English and Portuguese - Brazil)
- metronome with configurable beat count and shift
- live waveform and cycle pointer feedback
- note audio preloading for smoother playback

## Routes

- `/` - manifesto-style landing page
- `/tools` - tools catalog page
- `/read-and-locate` - interactive fretboard note name trainer
- `/name-the-note` - note memory trainer
- `/api/tts` - TTS proxy endpoint used by the trainer

## Google Drive Backup (Name the Note)

The Name the Note trainer supports secure OAuth and sync with Google Drive.

Environment variables required:

```bash
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
GOOGLE_OAUTH_SCOPES=https://www.googleapis.com/auth/drive.file
GOOGLE_OAUTH_AUTH_URL=https://accounts.google.com/o/oauth2/v2/auth
GOOGLE_OAUTH_TOKEN_URL=https://oauth2.googleapis.com/token
# Recommended in production (falls back to GOOGLE_CLIENT_SECRET if omitted)
GOOGLE_OAUTH_COOKIE_SECRET=generate-a-long-random-secret
```

## Getting Started

Install dependencies and run locally:

```bash
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

## Production Build

```bash
npm run build
npm run start
```

## PWA (Installable Web App)

This project now includes a baseline PWA setup:

- Web App Manifest at `/manifest.webmanifest` (from `app/manifest.js`)
- Service Worker at `/sw.js` with runtime caching and offline fallback
- Offline page at `/offline.html`
- Placeholder app icons in `public/icons/`

To test installability locally:

```bash
npm run build
npm run start
```

Then open Chrome DevTools > Application:

- Manifest (validate icons/start URL/display mode)
- Service Workers (confirm `/sw.js` is active)
- Lighthouse (PWA + Installable checks)

## Deploy

This project is ready to deploy on Vercel with default Next.js settings.

## Tech Stack

- Next.js (App Router)
- React
- Tailwind CSS
- Web Audio API
- Browser Speech Synthesis API

## Contributing

Issues and pull requests are welcome. Keep changes focused, test locally, and include clear descriptions of behavioral changes.

## License

No license file has been defined yet. Add a license before accepting external contributions.
