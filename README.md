# Web app: AI Across Industries (paper 2)

Static sub-site of the disclosure-series domain, modeled on paper 1's app:
plain HTML/CSS/JS, no build step, hand-rolled SVG charts reading the validated
palette from CSS custom properties, data baked from `02_analysis/*/outputs/`.

## Running locally

```bash
cd 04_web_app
python -m http.server 8765     # fetch is blocked on file:// URLs
# open http://localhost:8765
```

## Rebuilding the data

```bash
python build_data.py           # reads 02_analysis outputs, writes data/*.json
```

`build_data.py` **never recomputes a statistic** -- every value is copied from
an analysis output, so the site and the manuscript cannot disagree.
`data/claims.json` bakes to `null` until analysis 02's three-model coding has
run; the Claims view says so instead of breaking.

## Views

| View | What it does |
|---|---|
| **Overview** | the benchmark question: adoption/intensity/framing curves for all seven industries, threshold-crossing table, variance decomposition |
| **Filings** | the landing grid from paper 1's site: one cell per firm-year, coloured by AI language, hover previews the filing's first AI sentence, click opens the 10-K on sec.gov (one industry at a time; search spans all seven). Links open the document top -- paper 1's verified scroll-to-text anchors are a later port (`build_anchors.py` needs its own EDGAR fetch + verification pass) |
| **Industries** | one card per industry: sample size, crossings, post-ChatGPT intensity ratio, its own adoption curve |
| **Claims** | the three-model claim coding: claim mix per industry before/after ChatGPT, deployment-to-exposure ratio |
| **Statistics** | analysis 03 as live charts: the determinants forest (AMEs with CIs), the pre/post size gradient, the R&D-link forest per industry, and the first-disclosure event study with its honest nulls |
| **Firms** | every operating firm, searchable/filterable, AI-intensity sparkline, each name linking to its filings on sec.gov |
| **Method** | how it was measured and what the study is not |

Deploy like paper 1's: push the folder to a Pages branch; the shared domain
mounts each paper as a sub-site.
