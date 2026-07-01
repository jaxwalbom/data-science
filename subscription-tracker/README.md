# Renewals — Subscriptions & Vault

A tiny, private, offline-first subscription tracker you can install on your phone's home screen. No backend, no ads, no tracking — everything is stored locally with `localStorage`.

## Features

- Track subscriptions with cost, billing cycle, and next renewal date
- See a running "$X/mo" total and a countdown badge per subscription (turns amber, then red, as renewal approaches)
- Tap "Renewed" to roll a subscription's renewal date forward by its billing cycle
- Optionally save a username, password, and notes per subscription in an **encrypted local vault**
- Installable as a Progressive Web App and works fully offline

## How the vault works

Saved logins are encrypted with **AES-256-GCM**, using a key derived from a master password via **PBKDF2 (250,000 iterations, SHA-256)**. The master password itself is never stored — only a random salt and a small verification blob live in `localStorage`, both useless without the password.

The encryption key only ever exists in memory for the current browser tab session — it's never persisted, and is cleared whenever you tap the lock icon or reload the page.

**There is no password recovery.** If you forget your master password, the saved logins cannot be decrypted or recovered — this is the same tradeoff every real password manager makes.

## Run it locally

Any static file server works, e.g.:

```bash
npx http-server subscription-tracker -p 8080
```

Then open `http://localhost:8080` in your browser. The Web Crypto API used by the vault requires a secure context (HTTPS, or `localhost`).

## Install on your phone

Open the hosted page in Chrome on Android and choose **Add to Home screen** (or use the install prompt). It will launch full-screen like a native app and continue to work without a network connection.
