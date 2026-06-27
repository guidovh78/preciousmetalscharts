# Product — information architecture, page specs, retention

## Information architecture
| Path | Page | Status |
|---|---|---|
| `/` | Homepage / charts hub | Built (`index.html`) |
| `/gold-ira` | Gold-IRA comparison (money page) | Built (`gold-ira.html`) |
| `/ratio` | Gold-to-silver ratio (deep page) | To build |
| `/premiums` | Dealer premiums over spot | To build |
| `/alerts` | Price-alert signup / management | To build |

Sub-pages reuse the same header, tokens, schema patterns, and section-nav behavior.

### Homepage sections (index.html)
`live` (spot cards + main chart) · `today` ("since your last visit" pulse) · `ratio` ·
`portfolio` (private tracker) · `premiums` · `compare` (performance) · `faq` · `alerts`.

### Gold-IRA page sections (gold-ira.html)
`picks` (top 3) · `comparison` (full table + mobile cards) · `method` (scoring) · `reviews`
(per provider, strengths/trade-offs) · `suitability` (who it's for / think twice) · `faq`.

## Retention model — the "Hook" loop
Map features to Trigger → Action → Reward → Investment so visitors return:
- **Trigger:** price alerts + newsletter (external triggers that bring them back).
- **Action:** one-tap "set an alert"; fast chart interaction (the simplest valuable act).
- **Variable reward:** the **"Since your last visit" market pulse** (what moved, the ratio,
  notable changes) — different every visit.
- **Investment:** the **private portfolio / stack tracker** — once a user enters holdings, the
  site is personalized and worth returning to (the moat). Optional light, *ethical* stacking
  streak. No dark patterns.
- **Personalization:** remember preferred metal, currency, timeframe.
- **Data storytelling:** one plain-language line per chart ("gold is up X% this month; the ratio
  is historically high") so a number becomes a takeaway.

Design implication: mobile-first, fast, calm. Retention comes from genuine utility + a reason to
return, not from manipulation.
