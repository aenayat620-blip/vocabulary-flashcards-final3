# Vocabulary Flashcards (دفتر واژگان)

A production-quality, mobile-first Progressive Web App for serious English vocabulary learning.
Primary UI language: **Persian (Farsi)** with full RTL layout.
Optimized for iPhone Safari and installable via Share → Add to Home Screen.
Works fully offline after the first successful load. All data stays on the device (IndexedDB).

## Features

- Robust IndexedDB persistence (survives refresh, close, restart, PWA install)
- LaTeX-style import parser (`\voccategory`, `\vword`, `\vwordpair`)
- Stressed pronunciation display, irregular plurals / V2 / V3
- Spaced repetition with three-level answers (Known / Unsure / Unknown)
- Smart Review, due reviews, weak words, starred words
- Session resume
- Backup / Restore (JSON, merge or replace)
- Quiz modes (multiple choice + type answer)
- PWA with service worker & offline caching
- Notebook / academic journal visual design

## Run locally

```bash
cd vocabulary-flashcards
npm install
npm run dev
```

Open the URL shown (usually http://localhost:5173).

## Build for production

```bash
npm run build
npm run preview
```

Serve the `dist/` folder with any static host (or the Vite preview).

## Testing persistence

1. Import a category (paste sample LaTeX).
2. Close the tab / refresh / restart the phone.
3. Re-open the app — categories and learning progress must still be there.
4. Start a study session, answer some cards, close the app, re-open → resume prompt appears.

## Install on iPhone

1. Open the app in Safari.
2. Tap the Share button.
3. Choose **Add to Home Screen**.
4. Launch from the home screen icon — it opens in standalone mode (no Safari chrome).
5. After the first load you can turn on Airplane Mode; the app continues to work.

## Create a backup

1. Go to **پشتیبان و بازیابی**.
2. Tap **تولید پشتیبان**.
3. Tap **کپی** or **دانلود**.
4. Store the JSON somewhere safe.

## Restore a backup

1. Paste the JSON into the text area (or load the file).
2. Choose **ادغام** (merge) or **جایگزینی کامل** (replace — requires confirmation).
3. Tap **بازیابی**.

## Sample import text

```
\voccategory{Basic Verbs}{افعال پایه}
\vword{go (went, gone)}{(گو)}{رفتن}
\vword{child (children)}{(چای)لد}{کودک}
\vwordpair{cat}{(کَ)ت}{گربه}{dog}{(دا)گ}{سگ}
\vword{mother}{(ما)ذِر}{مادر}
```

## Data safety

- No login, no cloud, no external database.
- All mutations are written to IndexedDB immediately.
- Destructive actions require confirmation.
- Backup schema version is included for future migrations.

## Tech

- React 19 + TypeScript + Vite
- Native IndexedDB
- SpeechSynthesis for pronunciation
- Screen Wake Lock during study (when supported)
- Vazirmatn font, custom notebook theme (`#241B2F` / `#FBF7F0` / `#C9A24B`)
