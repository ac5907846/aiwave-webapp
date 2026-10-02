# Web app: Backed Claims (Paper A companion)

Static companion site of the Paper A manuscript (SMJ submission): AI resources
and AI talk in the 10-Ks of nine US sectors, FY2014 to 2025. Plain HTML/CSS/JS,
no build step, hand-rolled SVG charts reading the palette from CSS custom
properties, data baked from the analysis outputs. Rebuilt 2026-09-30 for the
Paper A framing (H1 alignment, H2 congruence, H3a/H3b litigation); the earlier
construction-benchmark site's data files are parked in `_archive_data_2026-09-30/`.

## Running locally

```bash
cd 04_web_app
python -m http.server 8765     # fetch is blocked on file:// URLs
# open http://localhost:8765
```

## Rebuilding the data

```bash
python build_data.py           # reads the d19/d20 analysis outputs, writes data/*.json
```

`build_data.py` **never recomputes a statistic**: every value is copied from an
analysis output (d19_* results, the master dataset, passages_coded.csv), so the
site and the manuscript cannot disagree. The only derivations are display
transforms the paper itself uses (95% bands drawn as estimate plus or minus
1.96 SE in the browser).

## Views (5 tabs)

| View | What it does |
|---|---|
| **Overview** | the research question, headline counts, the four verdicts with their p-values, and the diffusion chart (share of 10-Ks with C/G/F/any AI per sector-year, outcome toggle) |
| **Findings** | H1 as three mini-forests (C vs the G/F falsification rows, within and between firms), H2 interaction forests, H3 marginal-effect curves over litigation exposure with 95% bands (design toggle), and per-sector H1 slopes with the Wald test (resource and design toggles) |
| **Sectors** | one card per sector from Table 1: counts, disclosure shares, resources, litigation exposure, build-vs-buy pill, and a C-diffusion sparkline |
| **Filings** | one square per company-year colored by coded AI language; hover previews the filing's best coded sentence (top-scoring specific claim where one exists), click opens the 10-K on sec.gov; clicking a company name opens its firm profile (sparklines of C, R&D / revenue, AI patent stock, AI-worker share from `firms.json`); search spans all sectors |
| **Method** | pipeline prose (lexicon, three coders, 2-of-3 vote, six specificity points, two designs), the coder-agreement table, "The variables, one by one" (a card per model variable: the raw material it starts as, source, unit, distribution histogram and the Table-4 stats from `variables.json`), and "Score a claim yourself": a rough six-point rubric sketch that also reveals the coders' own score on real example claims |

Deploy as before: push the folder to a Pages branch; the shared domain mounts
each paper as a sub-site (CNAME kept).
