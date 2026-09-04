"""Verify every deep link on the site against the filing it points into.

Deliberate copy of paper 1's build_anchors.py (the anchor grammar, the
block-text model of the browser's matcher, and the verification replay are
identical); only the link surfaces differ:

    f:<cik>:<fy>     a square on the landing grid, at that filing's first AI
                     sentence
    p:<passage_id>   a passage coded by the three models (analysis 02)

An anchor that does not verify is not written: the site then links to the
filing unanchored, and the reader loses the scroll but never the document.
The filing HTML is cached gzipped under ~/.cache, outside OneDrive.

Run:  python build_anchors.py            # fetch what is missing, then build
      python build_anchors.py --offline  # build from the cache only
Output: data/anchors.json
"""
import gzip
import json
import re
import sys
import time
import warnings
from pathlib import Path
from urllib.parse import quote

import pandas as pd
import requests
from bs4 import BeautifulSoup, NavigableString, Tag, XMLParsedAsHTMLWarning

warnings.filterwarnings("ignore", category=XMLParsedAsHTMLWarning)

HERE = Path(__file__).resolve().parent
ANALYSIS = HERE.parent / "02_analysis"
DATA = HERE / "data"
CACHE = Path.home() / ".cache" / "ai10k_paper2" / "filing_html"

USER_AGENT = "FGCU Construction AI Research (zulablewis@gmail.com)"
RATE_SLEEP = 0.15


def afolder(prefix):
    return next(p for p in sorted(ANALYSIS.iterdir()) if p.name.startswith(prefix))


def out(prefix, name):
    return pd.read_csv(afolder(prefix) / "outputs" / name)


# ============================================================================
# THE AI LEXICON  (identical to the analysis, copied not imported)
# ============================================================================
CORE = {
    "artificial_intelligence": r"artificial[\s\-]+intelligence",
    "ai_abbrev":               r"(?<![A-Za-z0-9])A\.?I\.?(?![A-Za-z0-9])",
    "machine_learning":        r"machine[\s\-]+learning",
    "deep_learning":           r"deep[\s\-]+learning",
    "neural_network":          r"neural[\s\-]+net(work)?s?",
    "generative_ai":           r"generative[\s\-]+(a\.?i\.?|artificial intelligence)",
    "large_language_model":    r"large[\s\-]+language[\s\-]+model|\bLLMs?\b|\bGPT[\s\-]?\d?\b|chatgpt",
    "nlp":                     r"natural[\s\-]+language[\s\-]+processing",
    "computer_vision":         r"computer[\s\-]+vision|image[\s\-]+recognition",
}
ANY_CORE = re.compile("|".join(f"(?:{p})" for p in CORE.values()), re.I)
SENT_SPLIT = re.compile(r"(?<=[\.\?\!])\s+(?=[A-Z\"'(“])")


# ============================================================================
# THE FILING AS THE BROWSER SEES IT  (identical to paper 1)
# ============================================================================
_WS = re.compile(r"\s+")
_WORDCH = re.compile("[0-9A-Za-zÀ-ɏ]")
_INVISIBLE = dict.fromkeys(
    map(ord, "​‌‍⁠﻿­"), None)

BLOCK = {"address", "article", "aside", "blockquote", "body", "br", "caption",
         "dd", "details", "dialog", "div", "dl", "dt", "fieldset", "figcaption",
         "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "header",
         "hgroup", "hr", "html", "li", "main", "nav", "ol", "option", "p", "pre",
         "section", "table", "tbody", "td", "textarea", "tfoot", "th", "thead",
         "tr", "ul"}
DROP = {"script", "style", "head", "title", "noscript"}
HIDDEN = re.compile(r"display\s*:\s*none|visibility\s*:\s*hidden", re.I)
PRIVATE_USE = re.compile("[-\U000f0000-\U0010fffd]")


def normalise(s):
    s = str(s).replace(" ", " ").translate(_INVISIBLE)
    return _WS.sub(" ", s).strip()


def fold(s):
    return normalise(s).lower()


def block_texts(html):
    soup = BeautifulSoup(html, "lxml")
    for t in list(soup.find_all(True)):
        if not t.name:
            continue
        if t.name in DROP:
            t.decompose()
            continue
        if ":" in t.name and t.name.split(":")[-1] == "header":
            t.decompose()
            continue
        style = t.get("style") or ""
        if not isinstance(style, str):
            style = " ".join(style)
        if HIDDEN.search(style) or t.has_attr("hidden"):
            t.decompose()

    blocks, cur = [], []

    def flush():
        if cur:
            t = normalise("".join(cur))
            if t:
                blocks.append(t)
            cur.clear()

    # Iterative traversal with an explicit stack: some filings nest their
    # markup thousands of elements deep, past Python's recursion limit. The
    # FLUSH sentinel closes a block box exactly where the recursive version
    # flushed on the way out.
    FLUSH = object()
    todo = list(soup.children)[::-1]
    while todo:
        n = todo.pop()
        if n is FLUSH:
            flush()
            continue
        if isinstance(n, NavigableString):
            cur.append(str(n))
        elif isinstance(n, Tag):
            if n.name in BLOCK:
                flush()
                todo.append(FLUSH)
            todo.extend(list(n.children)[::-1])
    flush()
    return blocks


def find_bounded(hay, needle, start=0):
    n = len(needle)
    if not n:
        return -1
    i = hay.find(needle, start)
    while i != -1:
        if i == 0 or not _WORDCH.match(hay[i - 1]):
            j = i + n
            if j >= len(hay) or not _WORDCH.match(hay[j]):
                return i
        i = hay.find(needle, i + 1)
    return -1


def resolve(folded, start_term, end_term=None):
    s = fold(start_term)
    e = fold(end_term) if end_term is not None else None
    for bi, b in enumerate(folded):
        at = find_bounded(b, s)
        if at == -1:
            continue
        if e is None:
            return bi
        if find_bounded(b, e, at + len(s)) != -1:
            return bi
        if any(find_bounded(b2, e) != -1 for b2 in folded[bi + 1:]):
            return bi
        return -1
    return -1


def directive(start_term, end_term=None):
    enc = lambda t: quote(normalise(t), safe="").replace("-", "%2D")
    return "#:~:text=" + (enc(start_term) if end_term is None
                          else enc(start_term) + "," + enc(end_term))


# ============================================================================
# CHOOSING WHAT TO HIGHLIGHT  (identical to paper 1)
# ============================================================================
MIN_LEN, MAX_LEN = 40, 1500
LONG_SENTENCE = 600
CLAUSE_SPLIT = re.compile("(?<=[;•])\\s+")
WORD = re.compile(r"[A-Za-z0-9]+")


def sentences(text):
    out_ = []
    for s in SENT_SPLIT.split(text):
        s = s.strip()
        if not s:
            continue
        if len(s) > LONG_SENTENCE:
            out_.extend(x.strip() for x in CLAUSE_SPLIT.split(s) if x.strip())
        else:
            out_.append(s)
    return out_


def words_of(s):
    return {w.lower() for w in WORD.findall(str(s))}


def overlap(a, s):
    b = words_of(s)
    return len(a & b) / max(1, len(a | b)) if b else 0.0


def matchable(sent):
    if not PRIVATE_USE.search(sent):
        return sent
    return max(PRIVATE_USE.split(sent), key=len).strip()


def ordered_passages(blocks, want, ai_only):
    w = words_of(want) if isinstance(want, str) and want else set()
    scored = []
    for bi, b in enumerate(blocks):
        if ai_only and not ANY_CORE.search(b):
            continue
        for s in sentences(b):
            if ai_only and not ANY_CORE.search(s):
                continue
            if MIN_LEN <= len(s) <= MAX_LEN:
                scored.append((-(overlap(w, s) if w else 0.0), bi, s))
    scored.sort(key=lambda t: (t[0], t[1]))
    return [(bi, s) for _, bi, s in scored]


def head_tail(sent, n):
    ws = sent.split(" ")
    if len(ws) < 2 * n + 1:
        return None
    return " ".join(ws[:n]), " ".join(ws[-n:])


def candidates(sent):
    sent = matchable(sent)
    out_, ws = [], sent.split(" ")
    for n in (12, 9, 7, 5, 4):
        ht = head_tail(sent, n)
        if ht:
            out_.append((ht[0], ht[1], f"range{n}"))
    if len(sent) <= 420:
        out_.append((sent, None, "whole"))
    m = ANY_CORE.search(sent)
    if m:
        left = len(WORD.findall(sent[:m.start()]))
        for span in (14, 10, 7):
            frag = " ".join(ws[max(0, left - span // 2):][:span])
            if len(frag.split(" ")) >= 4:
                out_.append((frag, None, f"around{span}"))
    for n in (16, 12, 9, 6):
        if len(ws) >= n:
            out_.append((" ".join(ws[:n]), None, f"head{n}"))
    seen, uniq = set(), []
    for c in out_:
        k = (c[0].lower(), (c[1] or "").lower())
        if k not in seen:
            seen.add(k)
            uniq.append(c)
    return uniq


def anchor_for(blocks, folded, want, ai_only):
    passages = ordered_passages(blocks, want, ai_only)
    if not passages:
        return None, None, "no-passage", 0
    for bi, sent in passages:
        fs = fold(sent)
        for i in range(bi + 1):
            if fs in folded[i]:
                bi = i
                break
        for start, end, kind in candidates(sent):
            if PRIVATE_USE.search(start + (end or "")):
                continue
            if resolve(folded, start, end) == bi:
                s = fold(start)
                hits = sum(find_bounded(b, s) != -1 for b in folded)
                return directive(start, end), matchable(sent), kind, hits
    return None, matchable(passages[0][1]), "unverifiable", 0


# ============================================================================
# WHAT THE SITE LINKS TO
# ============================================================================
def collect_requests():
    """Every deep link the site needs, as (key, cik, fy, adsh, url, quote, ai_only)."""
    panel = out("01_", "panel_all_filings.csv")

    req = []

    # 1. the landing grid: the first AI sentence of every filing that has one
    sents = out("01_", "ai_sentences.csv")
    first = {}
    for r in sents.itertuples():
        first.setdefault((int(r.cik), int(r.fy)), r.sentence)
    for r in panel[panel.ai_core_count > 0].itertuples():
        if not isinstance(r.primary_doc_url, str):
            continue
        k = (int(r.cik), int(r.fy))
        req.append((f"f:{k[0]}:{k[1]}", k[0], k[1], r.adsh, r.primary_doc_url,
                    first.get(k), True))

    # 2. the passages the three models coded (analysis 02), when present
    try:
        cp = out("02_", "coded_passages.csv")
        for r in cp.itertuples():
            if isinstance(r.primary_doc_url, str):
                req.append((f"p:{r.passage_id}", int(r.cik), int(r.fy), r.adsh,
                            r.primary_doc_url, r.sentence, False))
    except (StopIteration, FileNotFoundError):
        pass

    # 3. EVERY AI sentence, indexed in document order: the grid's review
    # panel links each sentence into the filing. Same documents as surface 1,
    # so this adds no fetching, only verification work.
    doc = {(int(r.cik), int(r.fy)): (r.adsh, r.primary_doc_url)
           for r in panel.itertuples() if isinstance(r.primary_doc_url, str)}
    idx = {}
    for r in sents.itertuples():
        k = (int(r.cik), int(r.fy))
        if k not in doc:
            continue
        i = idx[k] = idx.get(k, -1) + 1
        adsh, url = doc[k]
        req.append((f"s:{k[0]}:{k[1]}:{i}", k[0], k[1], adsh, url, r.sentence, True))

    seen, uniq = set(), []
    for r in req:
        if r[0] not in seen:
            seen.add(r[0])
            uniq.append(r)
    return uniq


# ============================================================================
# THE DOCUMENTS  (identical to paper 1)
# ============================================================================
def cache_path(cik, fy, adsh):
    return CACHE / f"{int(cik)}_{int(fy)}_{adsh}.html.gz"


def fetch_missing(filings, refresh=False):
    CACHE.mkdir(parents=True, exist_ok=True)
    todo = [(k, u) for k, u in filings.items()
            if refresh or not cache_path(*k).exists()
            or cache_path(*k).stat().st_size < 1000]
    if not todo:
        print(f"  every document already cached in {CACHE}")
        return 0
    print(f"  downloading {len(todo)} of {len(filings)} documents to {CACHE}",
          flush=True)
    s = requests.Session()
    s.headers.update({"User-Agent": USER_AGENT, "Accept-Encoding": "gzip, deflate"})
    failed = 0
    for i, (k, url) in enumerate(todo, 1):
        try:
            resp = s.get(url, timeout=240)
            resp.raise_for_status()
            with gzip.open(cache_path(*k), "wb") as fh:
                fh.write(resp.content)
        except Exception as e:                                    # noqa: BLE001
            failed += 1
            print(f"    FAILED {k}: {type(e).__name__} {e}", flush=True)
        time.sleep(RATE_SLEEP)
        if i % 100 == 0:
            print(f"    [{i}/{len(todo)}]", flush=True)
    return failed


def main():
    offline = "--offline" in sys.argv
    refresh = "--refresh" in sys.argv

    req = collect_requests()
    filings = {}
    for key, cik, fy, adsh, url, quote_, ai_only in req:
        if adsh and isinstance(url, str):
            filings[(int(cik), int(fy), adsh)] = url
    print(f"Deep links to verify: {len(req)} across {len(filings)} filings")
    for prefix, label in (("f:", "landing grid"), ("p:", "coded passages"),
                          ("s:", "review sentences")):
        print(f"    {label:<16} {sum(k.startswith(prefix) for k, *_ in req)}")

    if not offline:
        fetch_missing(filings, refresh=refresh)

    by_filing = {}
    for r in req:
        by_filing.setdefault((int(r[1]), int(r[2]), r[3]), []).append(r)

    anchors, rows, t0 = {}, [], time.time()
    for i, (key3, group) in enumerate(sorted(by_filing.items(),
                                             key=lambda kv: str(kv[0])), 1):
        p = cache_path(*key3) if key3[2] else None
        blocks = folded = None
        if p is not None and p.exists():
            with gzip.open(p, "rb") as fh:
                blocks = block_texts(fh.read())
            folded = [fold(b) for b in blocks]
        for key, cik, fy, adsh, url, want, ai_only in group:
            if folded is None:
                rows.append({"key": key, "cik": cik, "fy": fy, "kind": "no-document",
                             "verified": 0, "n_matches": 0})
                continue
            frag, quote_, kind, hits = anchor_for(blocks, folded, want, ai_only)
            ov = (overlap(words_of(want), quote_)
                  if isinstance(want, str) and want and quote_ else None)
            # s: and p: promise THE sentence, not merely an AI sentence: an
            # anchor that verified onto different wording would highlight the
            # wrong passage, which is worse than no scroll at all. Drop it.
            if frag and key[:2] in ("s:", "p:") and ov is not None and ov < .55:
                frag, kind = None, "low-overlap"
            if frag:
                # s: keys skip the quote text: the review panel already holds
                # the sentence, and 40k+ of them would triple the file
                anchors[key] = ({"f": frag} if key.startswith("s:")
                                else {"f": frag, "q": quote_})
            rows.append({"key": key, "cik": cik, "fy": fy, "kind": kind,
                         "verified": int(frag is not None), "n_matches": hits,
                         "overlap": ov})
        if i % 100 == 0:
            print(f"    {i}/{len(by_filing)} filings  ({time.time() - t0:.0f}s)",
                  flush=True)

    DATA.mkdir(exist_ok=True)
    # One file per industry (f:/s: keys, looked up lazily by the app so the
    # first paint never waits for anchors -- the monolith ran to 15 MB) plus
    # passages.json for the p: keys, which no view reads yet.
    inv = json.loads((DATA / "inventory.json").read_text(encoding="utf-8"))
    ind_of = {str(f["cik"]): f["industry"] for f in inv["firms"]}
    slug = lambda ind: re.sub(r"^_+|_+$", "", re.sub(r"\W+", "_", ind)).lower()
    split = {}
    for key, v in anchors.items():
        name = ("passages" if key.startswith("p:")
                else slug(ind_of.get(key.split(":")[1], "unknown")))
        split.setdefault(name, {})[key] = v
    adir = DATA / "anchors"
    adir.mkdir(exist_ok=True)
    total = 0
    for name, d_ in sorted(split.items()):
        p = adir / f"{name}.json"
        p.write_text(json.dumps(d_, separators=(",", ":")), encoding="utf-8")
        total += p.stat().st_size

    d = pd.DataFrame(rows)
    ok = int(d.verified.sum())
    print(f"\n  data/anchors/    {len(split)} files, {total / 1024:.1f} KB")
    print(f"  verified         : {ok} / {len(d)}")
    for prefix, label in (("f:", "landing grid"), ("p:", "coded passages"),
                          ("s:", "review sentences")):
        g = d[d.key.str.startswith(prefix)]
        print(f"    {label:<16} {int(g.verified.sum())} / {len(g)}")
    print("\nBy anchor kind:")
    print(d.kind.value_counts().to_string())


if __name__ == "__main__":
    main()
