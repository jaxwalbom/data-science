# Compass — Daily Planner

A private, offline-first hub for the everyday stuff — tasks, mood, and goals — that you can install on your phone's home screen. No backend, no ads, no tracking — everything is stored locally with `localStorage`.

## Features

- **Today** — a single screen with today's tasks, a quick mood check-in, and a glance at your active goals
- **Tasks** — one-off tasks with due dates and priority, plus daily/weekly recurring tasks, grouped into Today / Upcoming / Anytime / Completed
- **Journal** — a one-tap mood log (😄🙂😐😕😣) with optional notes, one entry per day
- **Goals** — longer-term goals broken into checklist steps with a progress bar
- Installable as a Progressive Web App and works fully offline

## Run it locally

Any static file server works, e.g.:

```bash
npx http-server life-hub -p 8080
```

Then open `http://localhost:8080` in your browser.

## Install on your phone

Open the hosted page in Chrome on Android and choose **Add to Home screen** (or use the install prompt). It will launch full-screen like a native app and continue to work without a network connection.
