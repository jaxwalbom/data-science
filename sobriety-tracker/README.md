# Anchor — Sobriety Companion

A private, offline-first sobriety companion you can install on your phone's home screen. No backend, no ads, no accounts — everything stays on your device, with an optional passcode lock that encrypts it there too.

## Features

- **Live sobriety clock** — days, hours, minutes, and seconds since your start date, with a progress bar toward your next milestone (1 day through multi-year, automatically)
- **Daily check-ins** — mood and craving intensity, plus an optional note, with a 14-day history
- **Craving toolkit** — a guided box-breathing exercise, an urge-surfing reminder, a random distraction-idea generator, and one-tap calling/texting for your support contacts
- **Support &amp; crisis lines** — 988, the SAMHSA National Helpline, and Crisis Text Line are always available, plus your own saved contacts
- **Compassionate slip logging** — log a slip honestly, with the choice to reset your clock or keep counting, no shame framing
- **Stats** — current vs. longest streak, total check-ins, and 14-day mood/craving charts
- **Optional passcode lock** — when enabled, all your data (check-ins, notes, contacts, history) is encrypted at rest with AES-GCM, keyed by PBKDF2 from your passcode; there's no recovery if you forget it, by design
- Installable as a Progressive Web App and works fully offline

## Run it locally

Any static file server works, e.g.:

```bash
npx http-server sobriety-tracker -p 8080
```

Then open `http://localhost:8080` in your browser.

## Install on your phone

Open the hosted page in Chrome on Android and choose **Add to Home screen** (or use the install prompt). It will launch full-screen like a native app and continue to work without a network connection.

## Privacy

All data lives in `localStorage` on your device. Nothing is sent anywhere. If you turn on the passcode lock, the same data is encrypted before it touches disk — even someone with access to your browser's storage can't read it without the passcode.
