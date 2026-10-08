# Google Play launch kit

Everything needed to publish. Assets live in [`docs/store/`](store/). Regenerate them from the live app with
`npm run build && npm run preview` and then `PW_CHROMIUM_PATH=… node scripts/store-assets.mjs`.

## 1. Before you start (owner-only steps)

| Step | Where | Notes |
|---|---|---|
| Google Play developer account | play.google.com/console | $25 one-time fee, identity verification takes 1–3 days |
| Upload key + GitHub secrets | [docs/android.md](android.md#signing-for-google-play-one-time) | CI then builds a signed `app-release.aab` on every push |
| Payments profile | Play Console → Settings → Payments profile | Required to sell subscriptions |
| Final app name | Play Console → Store presence | See naming note below |

**Naming:** "Day Planner" describes the app well but is crowded in search and hard to trademark. A distinctive brand with
the keyword after it ranks and converts better, for example **Dayline: Day Planner & Timeline**,
**Tempo: Daily Planner**, or **Plotday — Day Planner**. Check the name in Play search and with a trademark search first. Changing the
display name later is fine. The package id `com.phacharapol.dayplanner` can never change.

## 2. Store listing

**App name** (≤30): `Day Planner: Timeline & Focus`

**Short description** (≤80):
`Plan your day on a timeline. Time-block, protect free time, and stay focused.`

**Full description** (≤4000):

```
Your day, as a timeline.

Day Planner shows your whole day as one calm, visual timeline: what's now, what's next, and how much free time you really have. Drag things into place until the day fits, then let gentle nudges keep you on track.

PLAN IN SECONDS
• Type it like you'd say it: "Gym tomorrow 6pm 45m", "Taxes 2h !!", "Standup 9:30 every weekday"
• Brain-dump several things at once, by typing or by voice
• Share from any app straight into your inbox
• Drag tasks onto the timeline, resize them with your finger, draw a block on empty time

SEE YOUR REAL DAY
• Your Google, Outlook and Samsung calendar events right on the timeline (read-only, stays on your phone)
• Free time is labelled, so you can see the gaps
• Week strip shows how full each day is

STAY ON TRACK
• A heads-up before each block
• Live Now card in your notifications: countdown, Done, +15 min
• Home-screen widgets: Now & next, and Today at a glance
• Focus mode: one thing at a time, with steps and a countdown ring
• Fell behind? One tap re-plans what slipped into the rest of your day

BUILD THE HABIT
• Morning "Plan my day" in under a minute: clear loose ends, pick what matters, choose your one thing
• Evening "Shut down": move leftovers, check in on how the day felt, write tomorrow's first step
• Planning streaks and weekly insights show where your time actually goes

PRIVATE BY DESIGN
No account. No ads. No tracking. Your plan lives on your device.

DAY PLANNER PRO
Unlock Auto-plan, your phone's calendars, widgets, the live Now card, unlimited routines and weekly insights. Try it free for 7 days, then monthly or yearly. Cancel anytime in Google Play.
```

**Category:** Productivity · **Tags:** Planner, Calendar, To-do list, Time management, Habit tracker

**Contact:** an email address you monitor, plus `https://github.com/Phacharapol18/Day-planer/issues`

**Privacy policy URL:** `https://phacharapol18.github.io/Day-planer/privacy.html`

## 3. Graphics (in `docs/store/`)

| Asset | File | Play requirement |
|---|---|---|
| App icon 512×512 | `public/icon-512.png` | 32-bit PNG ✓ |
| Feature graphic | `feature-graphic.png` (1024×500) | ✓ |
| Phone screenshots | `1-timeline.png` … `6-dark.png` (1080×2160) | 2–8 required, 9:16–1:2 ✓ |

The order of screenshots 1–6 is the order to upload them. The first two do most of the converting.

Native Android captures from the CI emulator (Now card in the shade, widgets in light/dark/locked) are in [`docs/store/android/`](store/android/). For a full design review of every screen and state (phone light/dark + desktop), run `npm run build && npm run preview`, then `PW_CHROMIUM_PATH=… npm run tour` (writes `screen-tour/`).

## 4. Subscriptions (Monetize → Products → Subscriptions)

Create **one** subscription. The IDs must match the code (`src/pro/entitlement.ts`):

| Field | Value |
|---|---|
| Product ID | `dayplanner_pro` |
| Base plan 1 | `monthly`: auto-renewing, 1 month, **$4.99** |
| Base plan 2 | `yearly`: auto-renewing, 1 year, **$29.99** (shows as "Save 50%") |
| Offer on `yearly` | Free trial, 7 days, eligibility: new customers |
| Grace period | 7 days (keeps Pro during payment retries; the app honours it) |

Prices are suggestions. Set local prices per country (Play's "Set prices" auto-converts). The paywall always shows Play's real
localized price and trial length, so nothing in the app needs changing.

**Test before launch:** add your Google account under *Settings → License testing*. Test purchases renew every few minutes and
cost nothing. Confirm: purchase → Pro unlocks; cancel → Pro remains until expiry; *Restore purchases* on a reinstall.

## 5. App content (Policy → App content)

| Form | Answer |
|---|---|
| Privacy policy | URL above |
| Ads | No ads |
| App access | All features available without login (Pro is a purchase, not an account) |
| Content rating | Questionnaire → Utility/Productivity, no objectionable content → **Everyone** |
| Target audience | 18+ (keeps you out of Families policy scope) |
| Data safety | **No data collected, no data shared.** Calendar events are read on device only ("processed ephemerally on device" is not collection). Purchases are handled by Google Play. |
| Exact alarms | The app uses `SCHEDULE_EXACT_ALARM` (user-granted), not `USE_EXACT_ALARM`, so no declaration needed |
| Calendar permission | Declare core use: "Show the user's existing calendar events on their day timeline" |

## 6. Release checklist

- [ ] Signing secrets added; CI run shows `app-release-aab` artifact
- [ ] Internal testing track: upload AAB, add testers, install from Play
- [ ] On a real phone: widgets added from the launcher, Now card, exact-alarm prompt, calendar import, share-to-inbox, purchase with a license-test account
- [ ] Closed testing with ≥12 testers for 14 days (Google requires this for new personal developer accounts before production)
- [ ] Production rollout at 20%, watch Android vitals (crashes/ANRs), then 100%
