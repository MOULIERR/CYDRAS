# Cydras — Going Live

## Part 1: Accounts Angel needs to open

Open these in your business name (your LLC), with your business email.
Prices are what each company lists as of Oct 2026. Check their sites before paying.

| # | Account | What it's for | Cost |
|---|---|---|---|
| 1 | **Supabase** (supabase.com) | The database, logins, photo storage | Free while testing. **$25/month** (Pro) when real shops use it |
| 2 | **Apple Developer** (developer.apple.com) | Put Cydras in the iPhone App Store | **$99/year** (enroll as an organization, needs a D-U-N-S number — free, takes about a week) |
| 3 | **Google Play Console** (play.google.com/console) | Put Cydras in the Android Play Store | **$25 one time** |
| 4 | **Expo** (expo.dev) | Builds the iPhone and Android apps, sends push notifications | Free plan works to start. About $19/month later for faster builds |
| 5 | **Stripe** (stripe.com) | Card payments, Tap to Pay, and charging shops for Cydras | No monthly fee. Shops' card fees are per payment. Connect: **$2 per active shop/month + 0.25% + 25¢ per payout** |
| 6 | **Twilio** (twilio.com) | Texting customers | Number about **$1.15/month** each. Texts about **1¢ each** incl. carrier fees. 10DLC: brand **$4.50–$46 once**, campaign **$15 once**, then **$1.50–$10/month** |
| 7 | **Domain** (e.g. cydras.app) | Your web address for the office website | About $12–20/year |
| 8 | **Website hosting** (Vercel, Netlify, or Cloudflare Pages) | Hosts the office website | Free to start |
| 9 | **Lawyer** | Review the Terms, Privacy Policy, texting consent, and payment policies | Varies — get a quote |

**Rough monthly cost to run (first shops):** about $50–80/month, plus per-text and per-payout fees.

### Things that take time — start these first
- **Apple organization enrollment:** needs a D-U-N-S number (about 1 week).
- **Twilio 10DLC registration:** carriers approve your texting campaign (a few days to 2 weeks). Texts don't send until approved.
- **Apple Tap to Pay entitlement:** you request it from Apple inside your developer account (can take a few weeks).
- **Stripe account review:** have your EIN and bank account ready.

---

## Part 2: Turning it on (for whoever does the tech setup)

### 1. Database
```
npm i -g supabase
supabase login
supabase link --project-ref <your-project-ref>
supabase db push            # creates every table and security rule
```

### 2. Secrets for the server functions
```
supabase secrets set \
  STRIPE_SECRET_KEY=sk_live_... \
  STRIPE_WEBHOOK_SECRET=whsec_... \
  STRIPE_CONNECT_WEBHOOK_SECRET=whsec_... \
  STRIPE_PRICE_SOLO=price_... STRIPE_PRICE_TEAM=price_... STRIPE_PRICE_PRO=price_... \
  APP_URL=https://office.cydras.app \
  TWILIO_ACCOUNT_SID=AC... TWILIO_AUTH_TOKEN=... \
  FUNCTIONS_URL=https://<ref>.supabase.co/functions/v1 \
  DB_WEBHOOK_SECRET=<make up a long random string>
supabase functions deploy
```
(`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set by Supabase automatically.)

### 3. Stripe
- Products: make 3 monthly prices — Solo $49, Team $125, Pro $249. Put their IDs in the secrets above.
- Turn on **Connect** (Express accounts) and **Terminal**.
- Webhooks → add endpoint `https://<ref>.supabase.co/functions/v1/stripe-webhook`:
  - Your account events: `customer.subscription.created/updated/deleted`, `invoice.payment_failed`
  - Connected account events (second endpoint, same URL): `payment_intent.succeeded`, `charge.refunded`, `account.updated`
- Billing portal: turn on plan changes and cancel.

### 4. Twilio
- Register the 10DLC brand + campaign (use case: "Customer Care" — appointment reminders, on-my-way, invoices).
- Buy a number for each shop. Set its **incoming message webhook** to
  `https://<ref>.supabase.co/functions/v1/twilio-inbound` (POST).
- Save the number on the shop: `update companies set sms_number = '+1...' where id = ...`

### 5. Push notifications (tech gets assigned a job)
Supabase → Database → Webhooks → new webhook:
- Table `job_assignments`, event Insert
- URL `https://<ref>.supabase.co/functions/v1/notify`
- Header `x-webhook-secret: <DB_WEBHOOK_SECRET>`

### 6. Office website
```
cd apps/office
cp .env.example .env     # fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run build            # upload the dist/ folder to Vercel/Netlify/Cloudflare
```

### 7. Phone apps
```
cd apps/mobile
npm i --legacy-peer-deps
# put supabaseUrl, supabaseAnonKey, officeUrl in app.json → expo.extra
npx eas login
npx eas build --platform all --profile production
npx eas submit --platform ios
npx eas submit --platform android
```

### 8. Backups and security (already built in)
- Every table has row-level security: a shop can only ever see its own data; techs only see their jobs.
- Payments are never deleted — only voided or refunded, with a reason, and logged.
- Money and people changes are written to an audit log.
- Turn on **Point-in-Time Recovery** in Supabase (Pro add-on) for minute-by-minute backups. Pro includes daily backups.
- Turn on 2-step login for every account above.

### Run the tests
```
npm install
npm test        # 42 tests: security rules, money, texting rules, offline sync
```
