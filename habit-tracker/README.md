# Streaks — Habit Tracker

A tiny, private, offline-first habit tracker you can install on your phone's home screen. No backend, no ads, no tracking — everything is stored locally with `localStorage`.

## Features

- Add a habit with a name and an icon
- Tap once to mark today done and build a streak
- Tap any of the last 7 days to fill in or correct past history
- See your current streak per habit and a daily completion summary
- Installable as a Progressive Web App and works fully offline

## Run it locally

Any static file server works, e.g.:

```bash
npx http-server habit-tracker -p 8080
```

Then open `http://localhost:8080` in your browser.

## Install on your phone

Open the hosted page in Chrome on Android and choose **Add to Home screen** (or use the install prompt). It will launch full-screen like a native app and continue to work without a network connection.
