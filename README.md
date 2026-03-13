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
- `/fret-notes` - interactive fretboard note name trainer
- `/api/tts` - TTS proxy endpoint used by the trainer

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
