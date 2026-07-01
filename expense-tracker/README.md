# Spendy — Expense Tracker

A tiny, private, offline-first expense tracker you can install on your phone's home screen. No backend, no ads, no tracking — everything is stored locally with `localStorage`.

## Features

- Log an expense in two taps (amount, category, optional note, date)
- Monthly total and category breakdown
- Transaction list grouped by day, with month navigation
- Installable as a Progressive Web App and works fully offline

## Run it locally

Any static file server works, e.g.:

```bash
npx http-server expense-tracker -p 8080
```

Then open `http://localhost:8080` in your browser.

## Install on your phone

Open the hosted page in Chrome on Android and choose **Add to Home screen** (or use the install prompt). It will launch full-screen like a native app and continue to work without a network connection.
