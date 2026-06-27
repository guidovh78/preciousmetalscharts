# preciousmetalscharts — site bundle

A working, technically GEO/SEO-ready mockup of the site. Everything that AI engines and
search crawlers need to read is in the HTML itself (server-rendered); JavaScript only
*enhances* it (charts, currency switch, portfolio, alerts, accordions).

## Files

| File | What it is |
|------|------------|
| `index.html` | Homepage — live prices, main chart, gold/silver ratio, "since your last visit" pulse, private portfolio tracker, premiums, performance comparison, FAQ, alerts. |
| `gold-ira.html` | Gold IRA comparison page (the monetisation page) — top picks, comparison table, scoring method, provider reviews, suitability, FAQ. |
| `robots.txt` | Allows traditional **and** AI crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, …) and points to the sitemap. |
| `llms.txt` | Plain-language map + key quotable facts for AI answer engines. |
| `sitemap.xml` | Lists all pages with `lastmod`. |

## What's baked in (technical GEO/SEO)

**Crawlable content (the big one).** The price cards, premium table, comparison table,
provider reviews and all FAQ answers are real HTML in the page source — not injected by
JavaScript. AI engines and Google read the page without running JS. JS then hydrates the
same content and adds interactivity. This is the single most important fix: AI engines can
only cite text they can read.

**Per-page `<head>`:** unique title + meta description, `canonical`, `robots`
(`max-image-preview:large`), Open Graph + Twitter cards (controls how AI/social previews look).

**Structured data (JSON-LD):**
- `index.html`: Organization, WebSite, WebPage (`dateModified`), and a **FAQPage**.
- `gold-ira.html`: Organization, WebSite, **BreadcrumbList**, **Article** (with `datePublished`
  + `dateModified` + author), and a **FAQPage**.

**Answer blocks.** Each FAQ answer is a self-contained 50–70-word paragraph that starts with
the key phrase and avoids opening pronouns — so an engine can lift it cleanly. This is the
format that gets quoted.

**Freshness + authority.** Visible "Last updated" + "Reviewed by" line, and `dateModified`
in schema. Refresh these when you actually update the page.

**Affiliate hygiene.** Every outbound provider link uses `rel="sponsored nofollow"`.

## Deploy (any static host: Netlify, Vercel, Cloudflare Pages, GitHub Pages, S3)

1. Upload the folder as-is. `index.html` is the homepage.
2. Put `robots.txt`, `llms.txt` and `sitemap.xml` at the **domain root**
   (`/robots.txt`, `/llms.txt`, `/sitemap.xml`).
3. Pretty URLs: the nav links to `/ratio`, `/premiums`, `/alerts` — create those pages, or
   for now point them at sections on the homepage. `gold-ira.html` can be served at `/gold-ira`.
4. Submit `sitemap.xml` in Google Search Console and Bing Webmaster Tools.
5. **Cloudflare users:** confirm the AI-bot block is OFF, or AI crawlers won't reach the site.

## Wire up real data (later)

- The numbers are illustrative placeholders. Feed live prices from a free metals API
  (e.g. gold-api.com, goldapi.io, metals-api.com) into the price cards / charts.
- Re-generate the static price snapshot server-side on each request (or every few minutes)
  so the HTML a crawler sees is current, then let the client JS keep it live.
- In `gold-ira.html`, replace every score/fee/minimum with figures you've **independently
  verified**, and confirm your own affiliate terms. Don't publish invented numbers about
  real companies.

## GEO/SEO checklist (post-launch)

- [ ] robots.txt live at root; AI bots allowed; Cloudflare AI-block off
- [ ] sitemap.xml submitted to Search Console + Bing
- [ ] Each page: unique title, meta description, canonical, JSON-LD validates
      (use Google Rich Results Test + Schema.org validator)
- [ ] Core Web Vitals green (fast, mobile-first)
- [ ] FAQ answer blocks on every key page; H2/H3 phrased as real questions
- [ ] One original data point per money page (e.g. live ratio, your premium table)
- [ ] Named author + visible "updated" date; refresh on real changes
- [ ] Off-site: honest participation in r/Gold, r/Silverbugs, YouTube — AI engines lean on
      these heavily
- [ ] Track **mention rate** and **citation rate** weekly across ChatGPT, Perplexity,
      Google AI Overviews for ~15–25 target questions
