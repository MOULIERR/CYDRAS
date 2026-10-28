# Cydras

Field service app for HVAC shops: phone app for techs, office website for owners and supervisors.

| Folder | What it is |
|---|---|
| `supabase/migrations` | Database tables + security rules (who can see and change what) |
| `supabase/functions` | Server code: Stripe payments & billing, Twilio texting, push notifications |
| `packages/core` | Shared code: offline sync, money math, time & pay math |
| `apps/mobile` | iPhone + Android app (Expo / React Native) |
| `apps/office` | Office website (React + Vite) |
| `tests` | Database security tests |
| `docs/SETUP.md` | **Start here** — accounts to open, costs, and how to turn it on |

What works for real:
- Logins, sign-up with a 14-day free trial, invite codes for techs
- Jobs, dispatch, customers, price book, invoices
- Clock in/out with GPS (only while clocked in), timesheets with approval and reasons for fixes
- Cash/check/Zelle payments, Tap to Pay and pay links through Stripe, refunds, voids
- Texting with consent, STOP/START, quiet hours for marketing
- Push notification when a tech is put on a job
- Offline mode: the phone app saves everything and sends it when signal comes back
- Truck inventory (parts come out of the truck when used on a job)
- Cydras monthly billing (Solo / Team / Pro)
