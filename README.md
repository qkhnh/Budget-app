# Budget

A personal monthly budget tracker I built to fit my own needs. It runs as an app on my iPhone, works offline, and keeps all data on the phone.

**Live:** https://qkhnh.github.io/Budget-app/

## What it does

- Tracks a monthly budget that runs from the 28th to the next 28th (because I pay my rent on the 28th lol)
- Quick spend logging with a keypad and reusable notes
- Separate accounts for budget, salary and other expenses, with transfers between them
- A set amount from each month's salary kept aside for stocks
- Rent reminders, a spending chart, and past months to sort out

## Privacy

There is no server, database or account. The app is plain static files. Everything you enter is stored only in your phone's browser storage, so anyone opening the link gets an empty app. Use Settings > Export backup to keep a copy of your data.

## Install on iPhone

1. Open the live link in Safari
2. Share > Add to Home Screen
3. Open it from the Home Screen (it has its own storage, separate from Safari)

## Run locally

```
npx http-server -a 127.0.0.1 -p 8000 -c-1
node --test
```

No build step. `budget-core.js` holds all the money logic as pure functions; the other files only draw the screens.
