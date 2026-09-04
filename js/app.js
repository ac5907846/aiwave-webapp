/* ============================================================================
   AI Across Industries: views and routing.

   Plain JS, no framework, no build step (same stance as paper 1's site).
   All data is baked JSON under data/; nothing here computes a statistic.
   ========================================================================= */
(function () {
  'use strict';

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const fmtPct = Charts.fmtPct;

  const INDUSTRIES = ['Construction', 'Construction machinery', 'Auto manufacturing',
                      'Software & IT services', 'Computers & chips',
                      'Pharma & biotech', 'Utilities',
                      'Retail', 'Aerospace & defense'];
  /* the industry palette from the figures: construction always #0072B2. The
     machinery band -- construction's upstream suppliers, the Caterpillar and
     Deere firms -- deliberately wears a darker member of the same blue family,
     so the kinship is visible at a glance. */
  const IND_COLOR = {
    'Construction': '--c1', 'Construction machinery': '--s4',
    'Software & IT services': '--c3', 'Computers & chips': '--ink',
    'Pharma & biotech': '--c4', 'Auto manufacturing': '--c2',
    'Utilities': '--s1', 'Retail': '--risk', 'Aerospace & defense': '--neutral',
  };
  const SHORT = {
    'Construction': 'Construction', 'Construction machinery': 'Constr. machinery',
    'Auto manufacturing': 'Auto mfg',
    'Software & IT services': 'Software & IT', 'Computers & chips': 'Computers & chips',
    'Pharma & biotech': 'Pharma & biotech',
    'Utilities': 'Utilities', 'Retail': 'Retail', 'Aerospace & defense': 'Aerospace & def',
  };
  const REPRESENTS = {
    'Construction': 'the focal industry',
    'Construction machinery': 'construction’s upstream equipment suppliers: firms EDGAR files under machinery manufacturing (Caterpillar, Deere, Terex) whose products live on construction sites',
    'Software & IT services': 'the AI producer, upper benchmark: software, IT services and the internet platforms (Alphabet, Meta)',
    'Computers & chips': 'the hardware side of the AI producer benchmark: computer makers (Apple, IBM, Dell) and the semiconductor industry (NVIDIA, Intel, AMD)',
    'Aerospace & defense': 'project-based megaproject production, closest analogue',
    'Utilities': 'regulated infrastructure',
    'Retail': 'labor-intensive consumer services',
    'Auto manufacturing': 'traditional capital-intensive manufacturing',
    'Pharma & biotech': 'R&D-intensive regulated science',
  };

  /* SIC subgroups inside each industry, so the grid reads the way paper 1's
     does for construction. Labels follow the SEC's own SIC titles. */
  function subgroup(industry, sic) {
    sic = +sic;
    if (industry === 'Construction') {
      if (sic >= 1500 && sic < 1600) return 'General building contractors';
      if (sic >= 1600 && sic < 1700) return 'Heavy construction';
      if (sic >= 1700 && sic < 1800) return 'Special trade contractors';
      return 'Engineering services';
    }
    return ({
      3523: 'Farm & agricultural machinery (crosses into construction: Deere, AGCO)',
      3531: 'Construction & mining machinery (Caterpillar, Terex)',
      3537: 'Industrial trucks & lifts',
      3711: 'Motor vehicles & car bodies', 3713: 'Truck & bus bodies',
      3714: 'Motor vehicle parts & accessories',
      7370: 'Data processing & internet platforms (Alphabet, Meta)',
      7371: 'IT services & custom programming', 7372: 'Prepackaged software',
      3570: 'Computer & office equipment (IBM)',
      3571: 'Electronic computers (Apple, Dell)',
      3674: 'Semiconductors (NVIDIA, Intel, AMD)',
      2834: 'Pharmaceutical preparations', 2836: 'Biological products',
      8731: 'Commercial physical & biological research',
      4911: 'Electric services', 4931: 'Electric & other services combined',
      5311: 'Department stores', 5411: 'Grocery stores', 5912: 'Drug stores',
      3721: 'Aircraft', 3812: 'Search, detection & navigation systems',
    })[sic] || 'SIC ' + sic;
  }

  const D = {};                       // loaded JSON lives here
  const secCompany = (cik) =>
    `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${String(cik).padStart(10, '0')}&type=10-K`;

  // ---------------------------------------------------------------- routing
  function show(view, updateHash = true) {
    $$('#nav button').forEach(b => b.classList.toggle('on', b.dataset.view === view));
    $$('.view').forEach(v => { v.hidden = v.id !== 'view-' + view; });
    // entering the site keeps a clean URL: the hash is only written on
    // navigation, or when the visitor already arrived with one
    if (updateHash && (location.hash || view !== 'filings')) location.hash = view;
    window.scrollTo({ top: 0 });
  }
  $('#nav').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (b) show(b.dataset.view);
  });
  document.addEventListener('click', (e) => {
    const g = e.target.closest('[data-goto]');
    if (g) { e.preventDefault(); show(g.dataset.goto); }
  });

  // ---------------------------------------------------------------- overview
  function seriesCfg(key, scale, fmt) {
    const s = D.series[key];
    return INDUSTRIES.filter(i => s[i]).map(i => ({
      name: SHORT[i], color: IND_COLOR[i],
      width: i === 'Construction' ? 3.4 : 1.6,
      dot: i === 'Construction' ? 3.6 : 0,
      opacity: i === 'Construction' ? 1 : .75,
      values: s[i].map(v => v === null ? null : v * scale),
    }));
  }

  function renderOverview() {
    const h = D.headline;
    $('#ov-rank').textContent = h.construction_rank_2025 + ' of 7';
    $('#ov-adopt').textContent = fmtPct(h.construction_adoption_2025, 1);
    $('#ov-filings').textContent = h.filings_total.toLocaleString('en-US');
    $('#ov-eta').textContent = Charts.fmtNum(h.eta2_year, 2).replace('0.', '.') +
      ' vs ' + Charts.fmtNum(h.eta2_industry, 2).replace('0.', '.');

    Charts.lineChart($('#ch-adoption'), {
      years: D.series.years, series: seriesCfg('adoption', 100), height: 340,
      breakAt: 2023, yFmt: v => v + '%', yLabel: 'Firms disclosing AI (%)',
      tipFmt: v => v.toFixed(1) + '% of firms', everyX: 1,
    });
    Charts.lineChart($('#ch-intensity'), {
      years: D.series.years, series: seriesCfg('intensity', 1), height: 300,
      breakAt: 2023, yFmt: v => v, yLabel: 'AI terms per 10,000 words',
      tipFmt: v => v.toFixed(2) + ' per 10k words',
    });
    Charts.lineChart($('#ch-risk'), {
      years: D.series.years, series: seriesCfg('risk_share', 100), height: 300,
      breakAt: 2023, ymax: 100, yFmt: v => v + '%',
      yLabel: 'AI mentions in Item 1A (%)', tipFmt: v => v.toFixed(0) + '% in Item 1A',
    });

    const thr = [5, 10, 25, 50];
    const rows = D.crossings.slice().sort((a, b) =>
      (a.crossed_10pct || 9e9) - (b.crossed_10pct || 9e9));
    $('#tbl-cross').innerHTML =
      '<thead><tr><th>Industry</th>' + thr.map(t => `<th class="num">${t}%</th>`).join('') +
      '<th class="num">FY2025</th></tr></thead><tbody>' +
      rows.map(r => {
        const focal = r.industry === 'Construction';
        return `<tr${focal ? ' style="font-weight:650"' : ''}>` +
          `<td><span class="seg-dot" style="background:${Charts.css(IND_COLOR[r.industry])}"></span>${SHORT[r.industry]}</td>` +
          thr.map(t => `<td class="num">${r['crossed_' + t + 'pct'] || '·'}</td>`).join('') +
          `<td class="num">${fmtPct(r.adoption_2025, 1)}</td></tr>`;
      }).join('') + '</tbody>';

    const d = D.tests.decomp;
    $('#ov-note').textContent =
      `Variance decomposition on ${d.n.toLocaleString('en-US')} operating filings: ` +
      `fiscal year explains ${fmtPct(d.eta2_year, 1)} of AI disclosure, industry ` +
      `${fmtPct(d.eta2_industry, 1)}. The diffusion is a calendar phenomenon first ` +
      `and an industry phenomenon second.`;
  }

  // ---------------------------------------------------------------- industries
  function renderIndustries() {
    const host = $('#ind-cards');
    const years = D.series.years;
    host.innerHTML = '';
    // an industry appended to the panel appears here only once its data is baked
    const byRank = INDUSTRIES.filter(i => D.series.adoption[i]).sort((a, b) => {
      const av = D.series.adoption[a], bv = D.series.adoption[b];
      return (bv[bv.length - 1] || 0) - (av[av.length - 1] || 0);
    });
    byRank.forEach(ind => {
      const cr = D.crossings.find(c => c.industry === ind) || {};
      const comp = D.composition.find(c => c.industry === ind) || {};
      const brk = D.tests.breaks.find(b => b.industry === ind && b.measure === 'intensity');
      const adopt = D.series.adoption[ind];
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML =
        `<h2><span class="seg-dot" style="background:${Charts.css(IND_COLOR[ind])}"></span>${ind}` +
        (ind === 'Construction' ? ' <span class="pill yes">focal</span>' : '') + `</h2>` +
        `<p class="sub">${REPRESENTS[ind]}</p>` +
        `<div class="kv">` +
        `<div><div class="k">firms / firm-years</div><div class="v">${comp.firms} / ${comp.firm_years}</div></div>` +
        `<div><div class="k">FY2025 adoption</div><div class="v">${fmtPct(adopt[adopt.length - 1], 1)}</div></div>` +
        `<div><div class="k">crossed 10% / 50%</div><div class="v">${cr.crossed_10pct || '·'} / ${cr.crossed_50pct || '·'}</div></div>` +
        `<div><div class="k">intensity, FY2023-25 vs FY2019-22</div><div class="v">${brk ? '&times;' + Charts.fmtNum(brk.ratio, 1) : '·'}</div></div>` +
        `</div>` +
        `<div class="chart" id="spark-${ind.replace(/\W+/g, '')}"></div>`;
      host.appendChild(card);
      Charts.lineChart($('#spark-' + ind.replace(/\W+/g, ''), card), {
        years, height: 170,
        series: [{ name: SHORT[ind], color: IND_COLOR[ind], width: 2.6, dot: 3,
                   values: adopt.map(v => v === null ? null : v * 100) }],
        breakAt: 2023, ymax: 100, yFmt: v => v + '%', everyX: 2,
        tipFmt: v => v.toFixed(1) + '% of firms',
      });
    });
  }

  // ---------------------------------------------------------------- claims
  function renderClaims() {
    const host = $('#claims-body');
    if (!D.claims) {
      host.innerHTML = '<div class="card"><p class="sub">The three-model coding ' +
        'run has not been baked into the site yet. Run the analysis, then ' +
        '<code>build_data.py</code>.</p></div>';
      return;
    }
    const C = D.claims;
    const s = C.summary;
    const stats = document.createElement('div');
    stats.className = 'stats';
    stats.innerHTML =
      `<div class="stat accent"><div class="v">${s.passages_coded.toLocaleString('en-US')}</div>` +
      `<div class="k">passages coded by all three models</div></div>` +
      `<div class="stat"><div class="v">${fmtPct(s.mean_pairwise_agreement, 0)}</div>` +
      `<div class="k">mean pairwise agreement between labs</div></div>` +
      `<div class="stat"><div class="v">${fmtPct(s.unanimous_share, 0)}</div>` +
      `<div class="k">passages with a unanimous 3-of-3 label</div></div>`;
    host.appendChild(stats);

    const order = ['DEPLOYMENT', 'EXPLORATION', 'EXPOSURE', 'GOVERNANCE', 'OTHER', 'UNCLEAR'];
    const colors = { DEPLOYMENT: '--c2', EXPLORATION: '--c1', EXPOSURE: '--risk',
                     GOVERNANCE: '--c3', OTHER: '--neutral', UNCLEAR: '--line-2' };
    const pats = { DEPLOYMENT: 'solid', EXPLORATION: 'hatch', EXPOSURE: 'cross',
                   GOVERNANCE: 'dots', OTHER: 'solid', UNCLEAR: 'solid' };

    ['2023_on', 'pre_2023'].forEach(period => {
      const rows = C.contrast.filter(r => r.period === period);
      if (!rows.length) return;
      const byInd = INDUSTRIES.filter(i => rows.some(r => r.industry === i));
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `<h2>${period === '2023_on' ? 'FY2023 on: after ChatGPT' : 'FY2014-2022: before ChatGPT'}</h2>` +
        `<p class="sub">Claim mix of the sampled passages per industry.</p><div class="chart"></div>`;
      host.appendChild(card);
      Charts.stackedBar($('.chart', card), {
        categories: byInd, labels: byInd.map(i => SHORT[i]), height: 330,
        counts: byInd.map(i => rows.find(r => r.industry === i).n_passages),
        series: order.map(c => ({
          name: c.toLowerCase(), color: colors[c], pat: pats[c],
          values: byInd.map(i => rows.find(r => r.industry === i)['share_' + c.toLowerCase()] || 0),
        })),
        yLabel: 'Share of passages',
      });
    });

    const post = C.contrast.filter(r => r.period === '2023_on');
    if (post.length) {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = '<h2>Substance against exposure</h2>' +
        '<p class="sub">Deployment passages per exposure passage, FY2023 on. ' +
        'Above 1: the industry talks more about using AI than about being ' +
        'threatened by it.</p><div class="chart"></div>';
      host.appendChild(card);
      Charts.barsH($('.chart', card), {
        labelW: 170,
        items: post.slice().sort((a, b) => b.deployment_to_exposure - a.deployment_to_exposure)
          .map(r => ({
            label: SHORT[r.industry], value: r.deployment_to_exposure,
            color: IND_COLOR[r.industry],
            display: Charts.fmtNum(r.deployment_to_exposure, 2),
            tip: `${fmtPct(r.share_deployment, 0)} deployment · ${fmtPct(r.share_exposure, 0)} exposure`,
          })),
      });
    }
  }

  // ---------------------------------------------------------------- filings grid
  /* One cell per firm-year, every cell a link to the 10-K on sec.gov. All 719
     of paper 1's filings fit on one page; 13,500 do not, so one industry
     renders at a time (searching looks across all seven), in chunks. */
  const secDoc = (cik, adsh, doc) =>
    `https://www.sec.gov/Archives/edgar/data/${cik}/${adsh.replace(/-/g, '')}/` +
    (doc || `${adsh}-index.htm`);

  const INV = { q: '', ai: false,
                ind: new URLSearchParams(location.search).get('ind') || 'Construction' };

  // ----------------------------------------------------- filing review panel
  /* Click a square with AI language: instead of jumping straight into the
     10-K, a panel lists EVERY AI sentence of that filing, each with its own
     verified deep link, plus one button for the whole document. Sentence
     files load lazily, one JSON per industry. */
  const SLUG = (ind) => ind.replace(/\W+/g, '_').replace(/^_+|_+$/g, '').toLowerCase();

  /* Two-tone highlighting in the review panel: the whole sentence sits on its
     own soft ground (css .m-txt), and the AI terms themselves pop in a second
     colour. sec.gov's own fragment highlight cannot be styled from here; this
     is the panel-side twin of it. */
  const ESCH = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const AI_RX = new RegExp(
    ['artificial[\\s-]+intelligence', 'machine[\\s-]+learning',
     'deep[\\s-]+learning', 'neural[\\s-]+network(?:s)?',
     'natural[\\s-]+language[\\s-]+processing', 'computer[\\s-]+vision',
     'predictive[\\s-]+analytics', 'generative[\\s-]*AI',
     'large[\\s-]+language[\\s-]+model(?:s)?', 'foundation[\\s-]+model(?:s)?',
     '\\bLLMs?\\b', '\\bChatGPT\\b', '\\bOpenAI\\b', 'chat\\s?bots?',
     'A\\.I\\.', '\\bAI\\b', '\\bAGI\\b', '\\bNLP\\b',
     '\\bGPT-?[3-5o]?\\b'].join('|'), 'gi');
  const hlKw = (s) => ESCH(s).replace(AI_RX, m => `<mark class="kw">${m}</mark>`);

  const sentCache = {};
  async function sentencesFor(ind) {
    if (!(ind in sentCache)) {
      sentCache[ind] = await fetch('data/sentences/' + SLUG(ind) + '.json')
        .then(r => r.ok ? r.json() : {}).catch(() => ({}));
    }
    return sentCache[ind];
  }

  /* Verified scroll-to-text anchors, one JSON per industry, loaded lazily so
     the first paint never waits for them (the monolithic anchors.json ran to
     15 MB). Until an industry's file lands, its links open the document top --
     the documented progressive-enhancement behaviour -- and the grid's hrefs
     are upgraded in place the moment the file arrives. */
  const anchLoaded = {};
  function loadAnchors(ind) {
    const slug = SLUG(ind);
    if (!anchLoaded[slug]) {
      anchLoaded[slug] = fetch('data/anchors/' + slug + '.json')
        .then(r => r.ok ? r.json() : {})
        .then(a => { Object.assign(D.anchors, a); upgradeAnchors(ind); })
        .catch(() => {});
    }
    return anchLoaded[slug];
  }
  function upgradeAnchors(ind) {
    $$('a.inv-cell[data-cik]').forEach(a => {
      if (a.dataset.ind !== ind || a.dataset.hl) return;
      const anch = D.anchors[`f:${a.dataset.cik}:${a.dataset.fy}`];
      if (anch && anch.f) { a.href = a.href.split('#')[0] + anch.f; a.dataset.hl = '1'; }
    });
  }

  const SEC_LABEL = { item1: 'Item 1 · Business', item1a: 'Item 1A · Risk Factors',
    item1b: 'Item 1B', item2: 'Item 2 · Properties', item3: 'Item 3 · Legal',
    item5: 'Item 5 · Market', item7: 'Item 7 · MD&A', item7a: 'Item 7A',
    item8: 'Item 8', item9a: 'Item 9A', full: 'unsegmented', unsegmented: 'unsegmented' };

  function closeModal() {
    const m = $('.modal-back');
    if (m) m.remove();
    document.removeEventListener('keydown', escClose);
  }
  function escClose(e) { if (e.key === 'Escape') closeModal(); }

  async function openReview(cell) {
    const { name, fy } = cell.dataset;
    const cik = cell.dataset.cik, ind = cell.dataset.ind;
    const docUrl = cell.href.split('#')[0];
    // sentence anchors ride in the industry's lazy anchor file; wait for it so
    // the per-sentence deep links are there on first open
    const [sentMap] = await Promise.all([sentencesFor(ind), loadAnchors(ind)]);
    const sents = sentMap[`${cik}:${fy}`] || [];
    const wrap = document.createElement('div');
    wrap.className = 'modal-back';
    wrap.innerHTML =
      `<div class="modal" role="dialog" aria-label="AI sentences in this filing">
        <div class="modal-head">
          <h3>${name} · FY${fy}</h3>
          <span class="m-meta">${sents.length} AI sentence${sents.length === 1 ? '' : 's'} ·
            ${cell.dataset.n} core term hit${cell.dataset.n === '1' ? '' : 's'}</span>
          <a class="modal-open" target="_blank" rel="noopener" href="${cell.href}">Open the 10-K ↗</a>
          <button class="modal-x" aria-label="Close">×</button>
        </div>
        <div class="modal-body">` +
      (sents.length ? sents.map(([sec, s], i) => {
        const anch = D.anchors && D.anchors[`s:${cik}:${fy}:${i}`];
        return `<div class="m-sent"><div class="m-txt">${hlKw(s)}</div>
          <div class="m-foot"><span>${SEC_LABEL[sec] || sec}</span>
          <a target="_blank" rel="noopener" href="${docUrl}${anch ? anch.f : ''}">
            open at this sentence${anch ? '' : ' (top of document)'} ↗</a></div></div>`;
      }).join('')
        : `<p class="m-note">The ${cell.dataset.n} AI term hit${cell.dataset.n === '1' ? '' : 's'}
           in this filing sit inside passages longer than the study's sentence
           bounds (typically a long run-on risk-factor list), so no clean
           sentence could be extracted. Open the 10-K to read them in place.</p>`) +
      `<p class="m-note">Every link opens the original filing on sec.gov; where a
        verified anchor exists the browser scrolls to the sentence and highlights
        it.</p></div></div>`;
    document.body.appendChild(wrap);
    wrap.addEventListener('click', (e) => {
      if (e.target === wrap || e.target.closest('.modal-x')) closeModal();
    });
    document.addEventListener('keydown', escClose);
  }

  function renderFilings() {
    const sel = $('#inv-ind');
    if (!sel.options.length) {
      const avail = INDUSTRIES.filter(i => D.inventory.firms.some(f => f.industry === i));
      sel.innerHTML = avail.map(i =>
        `<option${i === INV.ind ? ' selected' : ''}>${i}</option>`).join('');
      sel.addEventListener('change', () => { INV.ind = sel.value; renderFilings(); });
      $('#inv-search').addEventListener('input', (e) => {
        INV.q = e.target.value.toLowerCase().trim(); renderFilings();
      });
      $('#inv-ai').addEventListener('change', (e) => { INV.ai = e.target.checked; renderFilings(); });
      $('#inv-grid').addEventListener('mouseover', (e) => {
        const a = e.target.closest('a.inv-cell'); if (!a) return;
        const q = a.dataset.q ? `<q>${a.dataset.q}</q>` : '';
        Charts.showTip(`<b>${a.dataset.name}</b> · FY${a.dataset.fy}<br>` +
          (a.dataset.lvl === 'x' ? 'outside the operating screen this year'
            : `${a.dataset.n} core AI terms`) + q +
          (+a.dataset.n > 0
            ? `<i>click to review every AI sentence, each one a link into the 10-K</i>`
            : `<i>click to open the 10-K on sec.gov</i>`), e);
      });
      $('#inv-grid').addEventListener('mouseout', Charts.hideTip);
      $('#inv-grid').addEventListener('click', (e) => {
        const a = e.target.closest('a.inv-cell');
        if (!a || !(+a.dataset.n > 0)) return;          // no-AI cells stay direct links
        if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        Charts.hideTip();
        openReview(a);
      });
    }
    sel.disabled = !!INV.q;

    let firms = INV.q
      ? D.inventory.firms.filter(f => f.name.toLowerCase().includes(INV.q))
      : D.inventory.firms.filter(f => f.industry === INV.ind);
    if (INV.ai) firms = firms.filter(f => f.cells.some(c => c.lvl !== 'x' && c.lvl > 0));
    $('#inv-count').textContent = firms.length.toLocaleString('en-US') + ' firms';

    const years = D.inventory.years;
    const head = `<div class="inv-row inv-head"><span></span>` +
      years.map(y => `<span class="yh">'${String(y).slice(2)}</span>`).join('') +
      `<span class="yh">AI</span></div>`;

    const rowOf = (f) => {
      const byFy = {};
      f.cells.forEach(c => { byFy[c.fy] = c; });
      const total = f.cells.reduce((s, c) => s + (c.lvl === 'x' ? 0 : c.n), 0);
      const cells = years.map(y => {
        const c = byFy[y];
        if (!c) return '<span class="inv-cell"></span>';
        const q = (c.q || '').replace(/"/g, '&quot;');
        const anch = (D.anchors && D.anchors[`f:${f.cik}:${y}`]) || null;
        return `<a class="inv-cell lv-${c.lvl}" target="_blank" rel="noopener"
          href="${secDoc(f.cik, c.adsh, c.doc)}${anch ? anch.f : ''}"
          data-name="${f.name.replace(/"/g, '&quot;')}" data-cik="${f.cik}"
          data-ind="${f.industry}"
          data-fy="${y}" data-n="${c.n}" data-lvl="${c.lvl}" data-q="${q}"
          ${anch ? 'data-hl="1"' : ''}
          aria-label="${f.name} FY${y}, review its AI sentences"></a>`;
      }).join('');
      const ind = INV.q ? ` <small style="color:var(--ink-3)">· ${SHORT[f.industry]}</small>` : '';
      return `<div class="inv-row">` +
        `<a class="inv-name" style="text-decoration:none" target="_blank" rel="noopener"
           href="${secCompany(f.cik)}" title="${f.name} on EDGAR">${f.name}${ind}</a>` +
        cells +
        `<span class="inv-tot${total ? '' : ' zero'}">${total || ''}</span></div>`;
    };

    let html = head;
    if (INV.q) {                       // searching spans industries: flat list
      firms = firms.slice().sort((a, b) => a.name.localeCompare(b.name));
      html += firms.map(rowOf).join('');
    } else {                           // one industry: grouped by SIC subgroup
      const groups = new Map();
      firms.forEach(f => {
        const g = subgroup(f.industry, f.sic);
        if (!groups.has(g)) groups.set(g, []);
        groups.get(g).push(f);
      });
      [...groups.keys()].sort().forEach(g => {
        const list = groups.get(g).sort((a, b) => a.name.localeCompare(b.name));
        html += `<div class="inv-seg">${g}<span>${list.length} firms</span></div>`;
        html += list.map(rowOf).join('');
      });
    }
    $('#inv-grid').innerHTML = html;
    // fetch this industry's verified anchors (no-op if already here); the
    // grid's links upgrade in place when they land
    if (!INV.q) loadAnchors(INV.ind);
    else INDUSTRIES.forEach(loadAnchors);
  }

  // ---------------------------------------------------------------- statistics
  /* A point-with-interval (forest) chart: the one shape charts.js lacks.
     Significant intervals (excluding zero) take the accent; the rest stay
     muted, so the eye finds the real effects first. */
  function forest(host, cfg) {
    const NS = 'http://www.w3.org/2000/svg';
    host.innerHTML = '';
    const rowH = 26, labelW = cfg.labelW || 190, w = 780;
    const m = { t: 8, r: 24, b: 34, l: labelW };
    const h = cfg.items.length * rowH + m.t + m.b;
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.setAttribute('width', '100%');
    host.appendChild(svg);
    const el = (t, a) => { const e = document.createElementNS(NS, t);
      for (const k in a) e.setAttribute(k, a[k]); svg.appendChild(e); return e; };
    const lo = Math.min(0, ...cfg.items.map(d => d.lo));
    const hi = Math.max(0, ...cfg.items.map(d => d.hi));
    const pad = (hi - lo) * .08 || 1;
    const xS = v => m.l + ((v - lo + pad) / (hi - lo + 2 * pad)) * (w - m.l - m.r);
    el('line', { x1: xS(0), y1: m.t, x2: xS(0), y2: h - m.b,
                 stroke: Charts.css('--ink-3'), 'stroke-width': 1,
                 'stroke-dasharray': '3 3' });
    cfg.items.forEach((d, i) => {
      const y = m.t + i * rowH + rowH / 2;
      const sig = d.lo > 0 || d.hi < 0;
      const color = Charts.css(d.color || (sig ? '--accent' : '--ink-3'));
      el('text', { x: labelW - 10, y: y + 4, class: 'ax-txt',
                   'text-anchor': 'end',
                   style: d.bold ? 'font-weight:650' : '' }).textContent = d.label;
      el('line', { x1: xS(d.lo), y1: y, x2: xS(d.hi), y2: y, stroke: color,
                   'stroke-width': 2, 'stroke-linecap': 'round' });
      const c = el('circle', { cx: xS(d.v), cy: y, r: 4.4, fill: color,
                               stroke: Charts.css('--surface'),
                               'stroke-width': 1.2 });
      c.addEventListener('mousemove', ev => Charts.showTip(
        `<b>${d.label}</b><br>${d.tip}`, ev));
      c.addEventListener('mouseleave', Charts.hideTip);
    });
    el('text', { x: m.l + (w - m.l - m.r) / 2, y: h - 10, class: 'ax-lab',
                 'text-anchor': 'middle' }).textContent = cfg.xlab;
  }

  const AME_LABEL = {
    log_assets: 'Size (log assets)', roa: 'Profitability (ROA)',
    leverage: 'Leverage', cap_intensity: 'Capital intensity',
    rd_intensity: 'R&D intensity', has_rd: 'Reports R&D at all',
    log_words: 'Filing length (log words)',
  };

  function renderStats() {
    const host = $('#stats-body');
    if (!D.firmstats) {
      host.innerHTML = '<div class="card"><p class="sub">Run analysis 03 and ' +
        '<code>build_data.py</code> to bake this view.</p></div>';
      return;
    }
    const S = D.firmstats, sm = S.summary;
    host.innerHTML =
      `<div class="stats">
        <div class="stat accent"><div class="v">${sm.n_firm_years.toLocaleString('en-US')}</div>
          <div class="k">firm-years with XBRL financials, ${sm.n_firms.toLocaleString('en-US')} firms</div></div>
        <div class="stat"><div class="v">+${(sm.ame_log_assets * 100).toFixed(1)} pp</div>
          <div class="k">probability of disclosing AI per log-asset of size</div></div>
        <div class="stat"><div class="v">${sm.n_event_pairs}</div>
          <div class="k">adopters matched to same-industry, same-size non-disclosers</div></div>
        <div class="stat"><div class="v">p = ${sm.growth_on_ai_any_p.toFixed(2)}</div>
          <div class="k">forward revenue growth on AI disclosure, an honest null</div></div>
      </div>

      <div class="card"><h2>Who talks: what moves the probability of disclosing AI</h2>
        <p class="sub">Average marginal effects from a logit with year and industry
        fixed effects, SE clustered by firm. Blue: the 95% interval excludes zero.</p>
        <div id="st-ame" class="chart"></div></div>

      <div class="grid2">
        <div class="card"><h2>The size gradient, before and after ChatGPT</h2>
          <p class="sub">Share of firms disclosing AI by asset quintile. The wave
          did not democratize the talk: the gradient steepened.</p>
          <div id="st-grad" class="chart"></div></div>
        <div class="card"><h2>Does the talk line up with R&D?</h2>
          <p class="sub">AI intensity on R&D intensity within each industry
          (standardized), year FE. Only utilities and software line up;
          construction runs slightly negative: talk and action are separate
          things in the focal industry.</p>
          <div id="st-rd" class="chart"></div></div>
      </div>

      <div class="card"><h2>What follows the first AI disclosure</h2>
        <p class="sub">Adopters against size-matched same-industry firms not yet
        disclosing, in event time. Adopters were already healthier BEFORE
        disclosing and show no jump after: selection, not a measurable
        performance kick: forward growth on disclosure is a null
        (p = ${sm.growth_on_ai_any_p.toFixed(2)}), and risk-heavy framing predicts
        nothing either (p = ${sm.riskshare_growth_p.toFixed(2)}).</p>
        <div class="grid2">
          <div><div id="st-ev-rev" class="chart"></div></div>
          <div><div id="st-ev-roa" class="chart"></div></div>
        </div></div>`;

    forest($('#st-ame'), {
      xlab: 'Effect on P(discloses AI), percentage points',
      items: S.ame.map(r => ({
        label: AME_LABEL[r.term] || r.term, v: r.ame * 100,
        lo: r.ci_lo * 100, hi: r.ci_hi * 100,
        tip: `${(r.ame * 100).toFixed(1)} pp [${(r.ci_lo * 100).toFixed(1)}, ${(r.ci_hi * 100).toFixed(1)}]`,
      })),
    });

    const qs = [1, 2, 3, 4, 5];
    Charts.lineChart($('#st-grad'), {
      years: qs, height: 250, everyX: 1,
      series: [0, 1].map(post => ({
        name: post ? 'FY2023-2025' : 'FY2014-2022',
        color: post ? '--accent' : '--neutral', width: post ? 2.6 : 1.8,
        values: qs.map(q => {
          const r = S.size_gradient.find(g => g.post === post && g.size_q === q);
          return r ? r.pct_any_ai * 100 : null;
        }),
      })),
      ymax: 100, yFmt: v => v + '%', yLabel: 'Firms disclosing AI (%)',
      tipFmt: (v, q) => `size quintile ${q}: ${v.toFixed(0)}% disclose`,
    });

    forest($('#st-rd'), {
      labelW: 150,
      xlab: 'AI intensity per SD of R&D intensity (SD)',
      items: S.rd_link.slice().sort((a, b) => b.beta_std - a.beta_std).map(r => ({
        label: SHORT[r.industry] || r.industry, v: r.beta_std,
        lo: r.ci_lo, hi: r.ci_hi, color: IND_COLOR[r.industry],
        bold: r.industry === 'Construction',
        tip: `${r.beta_std.toFixed(2)} SD [${r.ci_lo.toFixed(2)}, ${r.ci_hi.toFixed(2)}] · ${r.n_firms} firms`,
      })),
    });

    const taus = [-2, -1, 0, 1, 2];
    const evSeries = (variable) => ['matched control', 'adopter'].map(role => ({
      name: role, color: role === 'adopter' ? '--accent' : '--neutral',
      width: role === 'adopter' ? 2.6 : 1.8,
      values: taus.map(t => {
        const r = D.firmstats.event_study.find(e =>
          e.variable === variable && e.role === role && e.tau === t);
        return r ? r.mean * 100 : null;
      }),
    }));
    Charts.lineChart($('#st-ev-rev'), {
      years: taus, height: 240, everyX: 1, series: evSeries('g_rev_fwd'),
      yFmt: v => v + '%', yLabel: 'Revenue growth into the next year (%)',
      tipFmt: (v, t) => `event year ${t}: ${v.toFixed(0)}%`,
    });
    const roaVals = evSeries('roa').flatMap(s => s.values).filter(v => v !== null);
    Charts.lineChart($('#st-ev-roa'), {
      years: taus, height: 240, everyX: 1, series: evSeries('roa'),
      ymin: Math.floor(Math.min(...roaVals) - 4),
      ymax: Math.ceil(Math.max(...roaVals) + 4),
      yFmt: v => v + '%', yLabel: 'Return on assets (%)',
      tipFmt: (v, t) => `event year ${t}: ${v.toFixed(0)}%`,
    });
    if (D.night) renderNight(host);
  }

  /* The night-batch panels (analyses 12-15): the rhetorical move mix, the
     chain letters, the explorer conversion curves, and the holdouts. */
  const MOVES = [
    ['showcase', 'Capability showcase', '--c1'],
    ['safe_harbor', 'Generic disclaimer', '--risk'],
    ['threat_narrative', 'Threat narrative', '--thr'],
    ['housekeeping', 'Housekeeping', '--neutral'],
    ['hedged_plan', 'Hedged plan', '--c3'],
    ['bandwagon', 'Industry bandwagon', '--c4'],
    ['compliance_signal', 'Governance signal', '--c2'],
  ];
  function renderNight(host) {
    const N = D.night;
    host.insertAdjacentHTML('beforeend',
      `${N.moves ? `<div class="card"><h2>The moves of AI disclosure, industry by industry</h2>
        <p class="sub">Three open-weight models coded what each sampled sentence is
        DOING: showing off, hedging, disclaiming, narrating a threat. Across all
        nine industries the showcase leads; in paper 1's construction-only view the
        threat narrative led. Sentences without a two-model majority are not shown.</p>
        <div id="nt-moves" class="chart"></div></div>` : ''}
      ${N.chains ? `<div class="grid2">
        <div class="card"><h2>Chain letters: boilerplate with a genealogy</h2>
          <p class="sub">Near-identical sentences across firms, joined into families
          (embedding cosine ≥ .93). By FY2025 a third of ALL AI sentences ride in a
          chain letter, and every great chain letter is a warning.</p>
          <div id="nt-chain" class="chart"></div></div>
        <div class="card"><h2>The six great chain letters</h2>
          <p class="sub">Carrier counts; families first seen in FY2014 were already
          circulating when the panel starts.</p>
          <div id="nt-chainlist"></div></div>
      </div>` : ''}
      ${N.explorers ? `<div class="grid2">
        <div class="card"><h2>Exploration converts, eventually</h2>
          <p class="sub">Of firms whose 10-K first said "we are exploring AI", the
          share that has carried deployment language k years on. 82% of pre-ChatGPT
          explorers got there within eight years; post-ChatGPT cohorts are converting
          faster.</p>
          <div id="nt-conv" class="chart"></div></div>
        <div class="card"><h2>The holdouts: who still says nothing</h2>
          <p class="sub">${(N.holdouts.summary.silent_share_2025 * 100).toFixed(0)}% of
          FY2025 operating filers carry NO AI language. The biggest silents, by
          assets:</p>
          <div id="nt-hold"></div></div>
      </div>` : ''}`);

    if (N.moves) {
      const TINY = { 'Construction': 'Constr.', 'Construction machinery': 'Mach.',
                     'Auto manufacturing': 'Auto', 'Software & IT services': 'Software',
                     'Computers & chips': 'Chips', 'Pharma & biotech': 'Pharma',
                     'Utilities': 'Util.', 'Retail': 'Retail',
                     'Aerospace & defense': 'Aero' };
      const rows = N.moves.by_industry;
      const inds = INDUSTRIES.filter(i => rows.some(r => r.industry === i));
      Charts.stackedBar($('#nt-moves'), {
        categories: inds, labels: inds.map(i => TINY[i]), height: 300,
        counts: inds.map(i => rows.find(r => r.industry === i).n_passages),
        yLabel: 'share of coded AI sentences',
        series: MOVES.map(([key, name, color]) => ({
          name, color,
          values: inds.map(i => rows.find(r => r.industry === i)[`pct_${key}`] || 0),
        })),
      });
    }
    if (N.chains) {
      const ys = N.chains.share.map(r => r.fy);
      Charts.lineChart($('#nt-chain'), {
        years: ys, height: 240,
        series: [{ name: 'in a chain letter', color: '--risk', width: 2.4,
                   values: N.chains.share.map(r => r.share_chain * 100) }],
        ymax: 40, yFmt: v => v + '%', yLabel: 'AI sentences in a chain letter (%)',
        tipFmt: (v, y) => `FY${y}: ${v.toFixed(0)}% of AI sentences`,
      });
      $('#nt-chainlist').innerHTML = N.chains.top.map(t =>
        `<div class="m-sent"><div class="m-txt" style="font-style:italic">
          “${t.exemplar.replace(/</g, '&lt;')}…”</div>
         <div class="m-foot"><span><b>${t.n_firms} firms</b> ·
          ${t.n_industries} industries · since ${t.first_fy <= 2014 ? '≤ FY2014' : 'FY' + t.first_fy}</span>
         </div></div>`).join('');
    }
    if (N.explorers) {
      const ks = [0, 1, 2, 3, 4, 5, 6, 7, 8];
      const curve = (era) => ks.map(k => {
        const r = N.explorers.conversion.find(c => c.era === era && c.k === k);
        return r ? r.converted * 100 : null;
      });
      Charts.lineChart($('#nt-conv'), {
        years: ks, height: 240, everyX: 1,
        series: [
          { name: 'pre-ChatGPT explorer cohorts', color: '--ink', width: 2.4,
            values: curve('pre_chatgpt') },
          { name: 'post-ChatGPT cohorts', color: '--c3', width: 2.4,
            values: curve('post_chatgpt') }],
        ymax: 100, yFmt: v => v + '%',
        yLabel: 'has carried deployment talk (%)',
        tipFmt: (v, k) => `${k} yr after first exploring: ${v.toFixed(0)}%`,
      });
    }
    if (N.holdouts) {
      $('#nt-hold').innerHTML = N.holdouts.roster.map(r =>
        `<div class="m-sent"><div class="m-foot">
          <span><b>${r.name}</b> · <span class="seg-dot"
            style="background:${Charts.css(IND_COLOR[r.industry])}"></span>${SHORT[r.industry] || r.industry}</span>
          <span>$${(r.assets / 1e9).toFixed(1)} bn assets</span>
         </div></div>`).join('');
    }
  }

  // ---------------------------------------------------------------- firms
  const F = { q: '', ind: '', ai: false, shown: 60 };
  function renderFirms() {
    const sel = $('#f-ind');
    if (!sel.options.length) {
      sel.innerHTML = '<option value="">All industries</option>' +
        INDUSTRIES.map(i => `<option>${i}</option>`).join('');
      sel.addEventListener('change', () => { F.ind = sel.value; F.shown = 60; renderFirms(); });
      $('#f-search').addEventListener('input', (e) => {
        F.q = e.target.value.toLowerCase(); F.shown = 60; renderFirms();
      });
      $('#f-ai').addEventListener('change', (e) => { F.ai = e.target.checked; F.shown = 60; renderFirms(); });
      $('#f-more').addEventListener('click', () => { F.shown += 120; renderFirms(); });
    }
    let rows = D.firms;
    if (F.ind) rows = rows.filter(f => f.industry === F.ind);
    if (F.ai) rows = rows.filter(f => f.first_ai);
    if (F.q) rows = rows.filter(f => f.name.toLowerCase().includes(F.q) ||
                                     String(f.state || '').toLowerCase() === F.q);
    rows = rows.slice().sort((a, b) => (a.first_ai || 9e9) - (b.first_ai || 9e9) ||
                                       b.int_last - a.int_last);
    $('#f-count').textContent = rows.length.toLocaleString('en-US') + ' firms';
    $('#f-more').hidden = rows.length <= F.shown;

    $('#tbl-firms').innerHTML =
      '<thead><tr><th>Company</th><th>Industry</th><th class="num">Years</th>' +
      '<th class="num">First AI year</th><th>AI intensity over time</th></tr></thead><tbody>' +
      rows.slice(0, F.shown).map(f =>
        `<tr><td><a href="${secCompany(f.cik)}" target="_blank" rel="noopener">${f.name}</a></td>` +
        `<td><span class="seg-dot" style="background:${Charts.css(IND_COLOR[f.industry])}"></span>${SHORT[f.industry]}</td>` +
        `<td class="num">${f.years[0]}–${String(f.years[f.years.length - 1]).slice(2)}</td>` +
        `<td class="num">${f.first_ai || '·'}</td>` +
        `<td>${Charts.spark(f.spark, { color: IND_COLOR[f.industry], w: 150 })}</td></tr>`
      ).join('') + '</tbody>';
  }

  // ---------------------------------------------------------------- boot
  /* Two phases, so the landing view paints as soon as ITS data is here rather
     than after every byte of the site's data:
       1. inventory.json alone (the filings grid, the landing view) -- the
          selected view shows immediately, with a loading note until then;
       2. the small per-view files in parallel, then the other views.
     Anchors never block anything: they stream in per industry (loadAnchors)
     and upgrade links in place. */
  async function boot() {
    D.anchors = {};
    const start = location.hash.replace('#', '');
    show(['overview', 'filings', 'industries', 'claims', 'stats', 'firms', 'method']
         .includes(start) ? start : 'filings', false);
    const smallP = Promise.all(
      ['headline', 'series', 'crossings', 'tests', 'composition', 'firms', 'claims',
       'firmstats']
        .map(n => fetch('data/' + n + '.json').then(r => r.json())));
    // the night-batch statistics view degrades gracefully when absent
    const nightP = fetch('data/night.json')
      .then(r => r.ok ? r.json() : null).catch(() => null);
    try {
      D.inventory = await fetch('data/inventory.json').then(r => r.json());
    } catch (e) {
      $('#main').insertAdjacentHTML('afterbegin',
        '<div class="card callout"><b>Could not load data/.</b> This page uses ' +
        '<code>fetch</code>, which browsers block on <code>file://</code>. Serve the ' +
        'folder instead: <code>python -m http.server 8765</code> and open ' +
        '<code>http://localhost:8765</code>.</div>');
      throw e;
    }
    renderFilings();
    // ?review=<cik>:<fy> deep-links straight into a filing's review panel
    const rv = new URLSearchParams(location.search).get('review');
    if (rv) {
      const [cik, fy] = rv.split(':');
      const cell = $(`a.inv-cell[data-cik="${cik}"][data-fy="${fy}"]`);
      if (cell) openReview(cell);
    }
    const files = await smallP;
    [D.headline, D.series, D.crossings, D.tests, D.composition, D.firms, D.claims,
     D.firmstats] = files;
    D.night = await nightP;
    renderOverview();
    renderIndustries();
    renderClaims();
    renderStats();
    renderFirms();
    // idle prefetch: the remaining industries' anchors, one at a time, so a
    // later industry switch or review click finds them already cached
    for (const ind of INDUSTRIES) await loadAnchors(ind);
  }
  boot();
})();
