"""Bake the site's data/*.json from 02_analysis outputs.

This script NEVER recomputes a statistic. Every value is copied from an
analysis output, so the site and the manuscript cannot disagree. If a number
here looks wrong, it is wrong in the analysis, and that is where to fix it.

Run:  python build_data.py     (re-run after any analysis re-run)
"""
import json
import re
import sys
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
A01 = next(p for p in sorted((ROOT / "02_analysis").iterdir())
           if p.name.startswith("01_")) / "outputs"
A02 = next((p for p in sorted((ROOT / "02_analysis").iterdir())
            if p.name.startswith("02_")), None)
A02 = A02 / "outputs" if A02 else None
DATA = HERE / "data"
DATA.mkdir(exist_ok=True)

INDUSTRIES = ["Construction", "Auto manufacturing", "Software & IT services",
              "Pharma & biotech", "Utilities", "Retail", "Aerospace & defense"]


def jput(obj, name):
    def clean(o):
        if isinstance(o, dict):
            return {k: clean(v) for k, v in o.items()}
        if isinstance(o, (list, tuple)):
            return [clean(v) for v in o]
        if isinstance(o, (np.integer,)):
            return int(o)
        if isinstance(o, (np.floating, float)):
            return None if (o != o or np.isinf(o)) else round(float(o), 5)
        if isinstance(o, (np.bool_, bool)):
            return bool(o)
        return o
    p = DATA / f"{name}.json"
    p.write_text(json.dumps(clean(obj), separators=(",", ":")), encoding="utf-8")
    print(f"  {name}.json  {p.stat().st_size/1024:.0f} KB")


def main():
    # ------------------------------------------------------------- headline
    summary = json.loads((A01 / "summary.json").read_text(encoding="utf-8"))
    jput(summary, "headline")

    # ------------------------------------------------------------- series
    y = pd.read_csv(A01 / "yearly_adoption_by_industry.csv")
    y = y[y["sample"] == "operating"].sort_values("fy")
    years = sorted(y.fy.unique().tolist())
    fr = pd.read_csv(A01 / "risk_share_by_industry_year.csv")
    cum = pd.read_csv(A01 / "cumulative_adoption_by_industry.csv")

    def series_of(df, col):
        out = {}
        for ind in INDUSTRIES:
            g = df[df.industry == ind].set_index("fy")[col]
            out[ind] = [None if fy not in g.index or pd.isna(g[fy])
                        else float(g[fy]) for fy in years]
        return out

    jput({"years": years,
          "adoption": series_of(y, "pct_any_ai"),
          "intensity": series_of(y, "mean_intensity"),
          "risk_share": series_of(fr, "risk_share"),
          "cumulative": series_of(cum, "cum_pct_ever_disclosed")}, "series")

    # ------------------------------------------------------------- crossings
    cross = pd.read_csv(A01 / "adoption_crossings.csv")
    jput(cross.to_dict("records"), "crossings")

    decomp = pd.read_csv(A01 / "variance_decomposition.csv").iloc[0].to_dict()
    brk = pd.read_csv(A01 / "structural_break_by_industry.csv")
    jput({"decomp": decomp, "breaks": brk.to_dict("records")}, "tests")

    comp = pd.read_csv(A01 / "sample_composition.csv")
    jput(comp.to_dict("records"), "composition")

    # ------------------------------------------------------------- firms
    panel = pd.read_csv(A01 / "panel_all_filings.csv")
    op = panel[panel.is_operating == 1]
    firms = []
    for cik, g in op.sort_values("fy").groupby("cik"):
        hit = g[g.ai_any == 1]
        last = g.iloc[-1]
        firms.append({
            "cik": int(cik), "name": g.name.iloc[-1],
            "industry": g.industry.iloc[-1], "state": last.get("state"),
            "years": [int(v) for v in g.fy], "n_years": len(g),
            "first_ai": int(hit.fy.min()) if len(hit) else None,
            "int_last": float(last.ai_intensity),
            "words_total": int(g.n_words.sum()),
            "spark": [float(v) for v in g.ai_intensity],
        })
    jput(firms, "firms")

    # ------------------------------------------------------------- inventory
    # The landing grid: one cell per firm-year, each linking to its 10-K on
    # sec.gov. Like paper 1, the accession and document name are stored and
    # the URL is rebuilt in JS, which halves the file. The hover preview is
    # the filing's first AI sentence.
    first_sent = {}
    sents = pd.read_csv(A01 / "ai_sentences.csv")
    for (cik, fy), g in sents.groupby(["cik", "fy"]):
        s = str(g.sentence.iloc[0])
        first_sent[(int(cik), int(fy))] = s[:240] + ("…" if len(s) > 240 else "")

    inv_firms = []
    for (cik, ind), g in panel.groupby(["cik", "industry"]):
        g = g.sort_values("fy")
        cells = []
        for r in g.itertuples():
            doc = ""
            if isinstance(r.primary_doc_url, str) and "/" in r.primary_doc_url:
                doc = r.primary_doc_url.rsplit("/", 1)[1]
            n = int(r.ai_core_count)
            lvl = ("x" if not r.is_operating else
                   0 if n == 0 else 1 if n <= 4 else 2 if n <= 14 else 3)
            cells.append({"fy": int(r.fy), "lvl": lvl, "n": n,
                          "adsh": r.adsh, "doc": doc,
                          "q": first_sent.get((int(cik), int(r.fy)))})
        inv_firms.append({"cik": int(cik), "name": g.name.iloc[-1],
                          "industry": ind, "sic": int(g.sic.iloc[-1]),
                          "state": g.state.iloc[-1]
                          if isinstance(g.state.iloc[-1], str) else None,
                          "cells": cells})
    jput({"years": sorted(panel.fy.unique().tolist()),
          "firms": inv_firms}, "inventory")

    # ------------------------------------------------------------- sentences
    # Every AI sentence of every filing, for the grid's review panel: one
    # lazily-loaded file per industry, keyed "cik:fy", each sentence in
    # document order so its index matches the s:<cik>:<fy>:<i> anchors.
    sd = DATA / "sentences"
    sd.mkdir(exist_ok=True)
    ind_of = panel.set_index(["cik", "fy"]).industry.to_dict()
    per_ind = {}
    for (cik, fy), g in sents.groupby(["cik", "fy"], sort=False):
        ind = ind_of.get((int(cik), int(fy)))
        if ind is None:
            continue
        per_ind.setdefault(ind, {})[f"{int(cik)}:{int(fy)}"] = [
            [r.section, str(r.sentence)[:600]] for r in g.itertuples()]
    for ind, m in per_ind.items():
        slug = re.sub(r"\W+", "_", ind).strip("_").lower()
        p = sd / f"{slug}.json"
        p.write_text(json.dumps(m, separators=(",", ":")), encoding="utf-8")
        print(f"  sentences/{slug}.json  {p.stat().st_size/1024:.0f} KB")

    # ------------------------------------------------------------- firm statistics (analysis 03)
    A03 = next((p for p in sorted((ROOT / "02_analysis").iterdir())
                if p.name.startswith("03_")), None)
    if A03 and (A03 / "outputs" / "determinants_ame.csv").exists():
        o3 = A03 / "outputs"
        ev = pd.read_csv(o3 / "event_study.csv")
        jput({"ame": pd.read_csv(o3 / "determinants_ame.csv").to_dict("records"),
              "size_gradient": pd.read_csv(o3 / "size_gradient.csv").to_dict("records"),
              "rd_link": pd.read_csv(o3 / "rd_link_by_industry.csv").to_dict("records"),
              "event_study": ev[ev.variable.isin(["g_rev_fwd", "roa"])]
              .to_dict("records"),
              "outcomes": pd.read_csv(o3 / "reg_outcomes.csv").to_dict("records"),
              "summary": json.loads((o3 / "summary.json")
                                    .read_text(encoding="utf-8"))}, "firmstats")
    else:
        jput(None, "firmstats")

    # ------------------------------------------------------------- claims (analysis 02)
    if A02 and (A02 / "claim_contrast.csv").exists():
        contrast = pd.read_csv(A02 / "claim_contrast.csv")
        mix = pd.read_csv(A02 / "claim_mix_by_industry_year.csv")
        agree = pd.read_csv(A02 / "model_agreement.csv")
        s2 = json.loads((A02 / "summary.json").read_text(encoding="utf-8"))
        jput({"contrast": contrast.to_dict("records"),
              "mix": mix.to_dict("records"),
              "agreement": agree.to_dict("records"),
              "summary": s2}, "claims")
    else:
        jput(None, "claims")

    # -------------------------------------------- the night batch (analyses 12-15)
    def adir(prefix):
        p = next((d for d in sorted((ROOT / "02_analysis").iterdir())
                  if d.name.startswith(prefix)), None)
        return p / "outputs" if p else None

    night = {}
    a12 = adir("12_")
    if a12 and (a12 / "rhetoric_by_industry.csv").exists():
        rb = pd.read_csv(a12 / "rhetoric_by_industry.csv")
        rt = pd.read_csv(a12 / "rhetoric_totals.csv")
        night["moves"] = {"by_industry": rb.to_dict("records"),
                          "totals": rt.to_dict("records")}
    a13 = adir("13_")
    if a13 and (a13 / "chain_share_by_year.csv").exists():
        cs = pd.read_csv(a13 / "chain_share_by_year.csv")
        tf = pd.read_csv(a13 / "template_families.csv").head(6)
        tf["exemplar"] = tf.exemplar.str.slice(0, 180)
        night["chains"] = {"share": cs.to_dict("records"),
                           "top": tf[["family", "n_firms", "n_industries",
                                      "first_fy", "exemplar"]].to_dict("records")}
    a14 = adir("14_")
    if a14 and (a14 / "conversion_curves.csv").exists():
        cv = pd.read_csv(a14 / "conversion_curves.csv")
        s14 = json.loads((a14 / "summary.json").read_text(encoding="utf-8"))
        night["explorers"] = {"conversion": cv.to_dict("records"),
                              "summary": s14}
    a15 = adir("15_")
    if a15 and (a15 / "silent_share_by_industry_year.csv").exists():
        ml = pd.read_csv(a15 / "silent_share_by_industry_year.csv")
        bh = pd.read_csv(a15 / "biggest_holdouts_2025.csv")
        # Clearway Inc + LLC are one corporate group: collapse near-duplicate names
        bh = bh[~bh.name.str.slice(0, 12).duplicated()].head(10)
        s15 = json.loads((a15 / "summary.json").read_text(encoding="utf-8"))
        night["holdouts"] = {"melt": ml.to_dict("records"),
                             "roster": bh[["name", "industry",
                                           "assets"]].to_dict("records"),
                             "summary": s15}
    jput(night or None, "night")

    print("done")


if __name__ == "__main__":
    main()
