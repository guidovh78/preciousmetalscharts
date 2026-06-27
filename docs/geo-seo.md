# GEO / SEO implementation

**GEO = Generative Engine Optimization:** getting cited by AI answer engines (ChatGPT,
Perplexity, Google AI Overviews, Gemini, Claude), on top of classic SEO. Rationale (Princeton
"GEO" study, KDD 2024): citing sources, adding statistics, and quotable phrasing materially lift
how often a page is surfaced by generative engines.

## #1 lever: server-side rendering
The citeable content (prices, tables, FAQ answers, comparison data) must exist in the HTML
**without JS**. AI engines and crawlers read the page without running JS; JS may only enhance.
The current pages bake content into the HTML and let JS hydrate — preserve this property in any
migration.

## Technical (built — keep intact)
- **`robots.txt`** explicitly allows AI crawlers: GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot,
  Claude-Web, anthropic-ai, PerplexityBot, Perplexity-User, Google-Extended, Applebot(-Extended),
  CCBot, cohere-ai, Meta-ExternalAgent + a sitemap line.
  **Cloudflare users: ensure the AI-bot block is OFF**, or crawlers never reach the site.
- **`llms.txt`** at root: plain-language site map + key quotable facts/definitions.
- **`sitemap.xml`** at root; submit to Google Search Console + Bing Webmaster Tools.
- Per page: unique `<title>`, meta description, `canonical`, robots (`max-image-preview:large`),
  Open Graph + Twitter cards.
- **Deploy `robots.txt`, `llms.txt`, `sitemap.xml` at the domain ROOT** (`/robots.txt`, etc.).

## Structured data (JSON-LD)
- Home: `Organization`, `WebSite`, `WebPage` (`dateModified`), **`FAQPage`**.
- Gold-IRA: `Organization`, `WebSite`, **`BreadcrumbList`**, **`Article`** (datePublished,
  dateModified, author), **`FAQPage`**.
- Validate with Google Rich Results Test + the Schema.org validator on every change.

## Content patterns (what actually gets cited)
- **Self-contained answer blocks:** ~40–80 words, directly answering a question, starting with the
  key phrase (no "it/this" openers), under **question-style H2/H3**.
- **Tables** for comparisons (engines lift tables near-verbatim).
- **Freshness:** visible "Updated" + a named **author/reviewer**; keep `dateModified` honest.
  Recently-updated pages are cited more.
- **Front-load:** put the most quotable facts in the **first ~30%** of the page.
- **One original data point per money page** (your live ratio, your premium table) — original data
  earns citations.

## Off-site & measurement
- AI engines lean heavily on **Reddit** (r/Gold, r/Silverbugs) and **YouTube**. Participate
  honestly; get the brand/data mentioned in third-party content.
- **Measure weekly:** pick ~15–25 target questions; track **mention rate** and **citation rate**
  across ChatGPT, Perplexity, and Google AI Overviews. Iterate on what gets cited.

## Supporting UX facts (why speed/mobile matter)
First impressions form in ~50ms; a 1s delay can cut conversions ~7%; >50% of traffic is mobile.
Design mobile-first and fast; Core Web Vitals green.
