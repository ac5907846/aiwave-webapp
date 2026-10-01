"""Bake the site's data/*.json from 02_analysis outputs (Paper A, rebuilt 2026-09-30).

This script NEVER recomputes a statistic. Every value is copied from an analysis
output (d19_* results, the master dataset, passages_coded.csv), so the site and
the manuscript cannot disagree. If a number here looks wrong, it is wrong in the
analysis, and that is where to fix it. The only derivations allowed are display
transforms the paper itself uses: per-10,000-word rates already stored in the
master, and 95% bands drawn in the browser as estimate +/- 1.96 SE.

Run:  python build_data.py     (re-run after any analysis re-run)
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT / "02_analysis" / "_shared"))
import core  # noqa: E402

DATA = HERE / "data"
DATA.mkdir(exist_ok=True)

SLUG = {"Software & IT services": "software_it_services", "Computers & chips": "computers_chips",
        "Aerospace & defense": "aerospace_defense", "Auto manufacturing": "auto_manufacturing",
        "Pharma & biotech": "pharma_biotech", "Retail": "retail", "Utilities": "utilities",
        "Construction": "construction", "Construction machinery": "construction_machinery"}


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
    print(f"  {name}.json  {p.stat().st_size / 1024:.0f} KB")


def main():
    M = pd.read_parquet(core.results("20") / "master_firm_year.parquet")
    T1 = pd.read_csv(core.out("d19_T1_by_industry.csv")).set_index("industry")
    P = pd.read_csv(core.out("passages_coded.csv"),
                    usecols=["cik", "fy", "industry", "section", "sentence_index", "sentence",
                             "about", "is_ai", "is_C", "is_G", "is_F", "spec_score"])
    D = pd.read_csv(core.out("d19_models.csv"))
    SL = pd.read_csv(core.out("d19_sector_slopes.csv"))
    WD = pd.read_csv(core.out("d19_wald.csv"))
    ME = pd.read_csv(core.out("d19_marginal_effects.csv"))
    DF = pd.read_csv(core.out("d19_disclosure_diffusion.csv"))
    AG = pd.read_csv(core.out("coder_agreement.csv"))

    # ------------------------------------------------------------- headline
    al = T1.loc["All"]
    ai = P[P.is_ai == 1]
    jput(dict(
        n10k=len(M), firms=int(M.cik.nunique()), sectors=int(M.industry.nunique()),
        fy0=int(M.fy.min()), fy1=int(M.fy.max()),
        nsent=len(P), nai=len(ai), ndropped=int((P.about == "NOT_AI").sum()),
        nC=int(ai.is_C.sum()), nG=int(ai.is_G.sum()), nF=int(ai.is_F.sum()),
        nvague=int(((ai.is_C == 0) & ai.spec_score.notna() & (ai.is_G == 0) & (ai.is_F == 0)).sum()),
        nsamp=int(al.firm_years), fsamp=int(al.firms),
        anyC25=float(DF[(DF.industry == "All sectors") & (DF.fy == DF.fy.max())].any_C.iloc[0]),
        anyG25=float(DF[(DF.industry == "All sectors") & (DF.fy == DF.fy.max())].any_G.iloc[0]),
    ), "headline")

    # ------------------------------------------------------------- diffusion
    fys = sorted(DF.fy.unique().tolist())
    series = []
    for ind, g in DF.groupby("industry"):
        g = g.set_index("fy").reindex(fys)
        series.append(dict(name=ind, mode=None if g["mode"].isna().all() else g["mode"].dropna().iloc[0],
                           n=g.n.tolist(),
                           C=g.any_C.tolist(), G=g.any_G.tolist(), F=g.any_F.tolist(), AI=g.AI_ANY.tolist()))
    jput(dict(years=fys, series=series), "diffusion")

    # ------------------------------------------------------------- findings: models
    def rows(table_like):
        out = []
        for _, r in table_like.iterrows():
            out.append(dict(model=r.model, term=r.term, fe=r.fe, y=r.y, coef=r.coef, se=r.se,
                            p=r.p, n=int(r.n), firms=int(r.firms)))
        return out
    keep = D[(D.table != "R1") & D.term.isin(
        ["L1_RD_SALES0", "L1_LOG_AI_PAT_STOCK", "L1_AI_WORKER", "RxM", "RxL", "HIGH_AIIE", "INTERNAL_DEV"])]
    wald = [dict(resource=r.resource, fe=r.fe, spec=r.spec, kind=r["kind"], p=r.p, industries=int(r.industries))
            for _, r in WD.iterrows()]
    jput(dict(models=rows(keep), wald=wald), "models")

    # ------------------------------------------------------------- findings: marginal effects (fig 4 data)
    me = []
    for (res, fe), g in ME.groupby(["resource", "fe"]):
        g = g.sort_values("suit_rate")
        me.append(dict(resource=res, fe=fe, x=g.suit_rate.tolist(), q=g["quantile"].tolist(),
                       eff=g.effect.tolist(), lo=g.lo.tolist(), hi=g.hi.tolist(), n=int(g.n.iloc[0])))
    jput(me, "marginal")

    # ------------------------------------------------------------- findings: sector slopes (fig 5 data)
    sl = []
    for _, r in SL[SL.spec.isin(["H1 slopes", "H3 slopes"])].iterrows():
        sl.append(dict(resource=r.resource, fe=r.fe, spec=r.spec, kind=r["kind"], industry=r.industry,
                       mode=r["mode"], coef=r.coef, se=r.se, p=r.p,
                       per_sd_suit=None if pd.isna(r.per_sd_suit) else r.per_sd_suit,
                       firms=int(r.firms_with_resource), n=int(r.n_model)))
    jput(sl, "slopes")

    # ------------------------------------------------------------- sectors (Table 1)
    sec = []
    for ind, r in T1.iterrows():
        if ind == "All":
            continue
        sec.append(dict(name=ind, slug=SLUG[ind], mode=r["mode"], firms=int(r.firms), fy=int(r.firm_years),
                        anyC=r.any_C, anyG=r.any_G, anyF=r.any_F, meanC=r.mean_C,
                        rd_med=r.rd_rev_median, rd_pos=r.rd_positive, pat=r.ai_pat_any,
                        hi_aiie=None if pd.isna(r.high_aiie) else r.high_aiie,
                        suit=r.suit_rate_mean))
    jput(sec, "sectors")

    # ------------------------------------------------------------- coder agreement (method)
    jput([dict(field=r.field, pair=r.pair, n=int(r.n), agree=r.agreement) for _, r in AG.iterrows()], "agreement")

    # ------------------------------------------------------------- filings grid + firm search
    # one record per firm; per year: [fy, operating&coded, n AI sentences, nC, nG, nF, C per 10k words, adsh]
    Ms = M.sort_values(["name", "fy"])
    firms = []
    for cik, g in Ms.groupby("cik", sort=False):
        years = []
        for _, r in g.iterrows():
            years.append([int(r.fy), int(r.is_operating == 1 and r.coded == 1), int(r.n_ai),
                          int(r.n_C), int(r.n_G), int(r.n_F),
                          None if pd.isna(r.C) else round(float(r.C), 3), r.adsh])
        firms.append(dict(cik=int(cik), name=str(g["name"].iloc[-1]), ind=g["industry"].iloc[-1], years=years))
    firms.sort(key=lambda f: f["name"])
    jput(firms, "firms")

    # ------------------------------------------------------------- hero: one record per filing, packed small
    # y: fiscal year - 2014; s: sector index into "sectors"; l: 0 outside the operating screen, 1 coded with no AI
    # language, 2 AI language without a specific claim, 3 at least one specific claim
    sec_order = list(SLUG)
    hy, hs, hl = [], [], []
    for r in M.itertuples():
        hy.append(int(r.fy) - 2014); hs.append(sec_order.index(r.industry))
        op = int(r.is_operating == 1 and r.coded == 1)
        hl.append(0 if not op else 1 if r.n_ai == 0 else 2 if r.n_C == 0 else 3)
    T1x = pd.read_csv(core.out("d19_T1_by_industry.csv")).set_index("industry")
    jput(dict(sectors=sec_order, inhouse=[int(T1x.loc[s, "mode"] == "in-house") for s in sec_order],
              fy0=2014, y=hy, s=hs, l=hl,
              counts=dict(n10k=len(M), firms=int(M.cik.nunique()),
                          nai=int((M.n_ai > 0)[(M.is_operating == 1) & (M.coded == 1)].sum()),
                          nC10k=int((M.n_C > 0)[(M.is_operating == 1) & (M.coded == 1)].sum()))), "hero")

    # ------------------------------------------------------------- example sentences per sector
    # for each filing with coded AI sentences: the best sentence to preview
    # (the specific claim with the most points, else the first AI sentence)
    P2 = P[P.is_ai == 1].copy()
    P2["rank_c"] = (P2.is_C == 1).astype(int) * 100 + P2.spec_score.fillna(0)
    P2 = P2.sort_values(["rank_c", "sentence_index"], ascending=[False, True])
    best = P2.groupby(["cik", "fy"]).first().reset_index()
    sdir = DATA / "sentences"
    sdir.mkdir(exist_ok=True)
    for ind, g in best.groupby("industry"):
        obj = {f"{int(r.cik)}_{int(r.fy)}": dict(s=str(r.sentence)[:360], sec=str(r.section),
                                                 c=int(r.is_C), pts=None if pd.isna(r.spec_score) else int(r.spec_score))
               for _, r in g.iterrows()}
        p = sdir / f"{SLUG[ind]}.json"
        p.write_text(json.dumps(obj, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
        print(f"  sentences/{p.name}  {p.stat().st_size / 1024:.0f} KB")

    print("done")


if __name__ == "__main__":
    main()
