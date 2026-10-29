// Läuft IM BROWSER (page.evaluate). Muss in sich geschlossen sein – keine Importe, keine Außenreferenzen.
// Erkennt Stellenlisten auf beliebigen Karriereseiten:
//   1. SuccessFactors-Listen (a.jobTitle-link)  2. JSON-LD (JobPosting)  3. wiederkehrende Link-Muster.
export function pageScript() {
  const JOBWORDS = /(\(?\b[mwdfgxi]\s*[\/|]\s*[mwdfgxi](\s*[\/|]\s*[mwdfgxi])?\b\)?|all genders|\bgn\b|ingenieur|manager|leiter|leitung|entwickl|techniker|monteur|konstrukt|mechaniker|mechatroniker|sachbearbeiter|referent|berater|engineer|specialist|assistent|projekt|ausbildung|praktik|werkstudent|fachkraft|einkäufer|einkaeufer|elektr|mitarbeiter|developer|technician|operator|head of|lead\b|director|buyer|controller|analyst|consultant|architect|spezialist|experte|expert|planer|disponent|meister|schlosser|fahrer|koordinator|trainee|vertrieb|sales|support|administrator|buchhalt|kaufmann|kauffrau|zerspan|bediener|helfer|techn\.|bauleiter|polier|designer|tester|qualit|logistik|lager|fertigung|produktion|instandhalt|service|inbetriebnahme|verwaltung|junior|senior|intern\b)/i;
  const BAD = /^(login|log in|anmelden|registrieren|datenschutz|impressum|kontakt|cookie|cookies|alle jobs|alle stellen|zurück|weiter|more|mehr|home|startseite|suche|search|filter|newsletter|bewerben|jetzt bewerben|apply|apply now|details|mehr erfahren|read more|zur stelle|zum job|alle anzeigen|show all|skip to content|zum inhalt|menü|menu|karriere|jobs|stellenangebote|offene stellen|zurücksetzen|reset|sprache|language|deutsch|english|drucken|teilen|share|merken|speichern|initiativbewerbung|talent pool|talentpool)$/i;
  const NAV = /(datenschutz|impressum|cookie|agb|barrierefrei|newsletter|login|logout|signin|sign-in|register|facebook|instagram|twitter|linkedin\.com\/company|xing\.com\/companies|youtube|kununu|mailto:|tel:|javascript:)/i;

  const abs = (h) => { try { return new URL(h, location.href).href; } catch { return ''; } };
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const vis = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  const out = { method: '', items: [], clusterSize: 0, candidates: 0, jsonLd: 0, hint: null, text: '', next: null, title: document.title || '' };
  const body = document.body ? document.body.innerText || '' : '';
  out.text = body.slice(0, 3000);
  out.bodyLen = body.length;

  // Hinweis „123 Stellen/Jobs/Treffer“
  const hm = body.match(/(\d{1,4}(?:[.,]\d{3})?)\s*(?:offene\s+)?(?:Stellenangebote|Stellenanzeigen|Stellen\b|Jobs\b|Treffer|Ergebnisse|results|positions|vacancies|open positions)/i);
  if (hm) out.hint = parseInt(hm[1].replace(/[.,]/g, ''), 10);

  // ---- 1. JSON-LD ----
  const ld = [];
  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const walk = (n) => {
        if (!n) return;
        if (Array.isArray(n)) return n.forEach(walk);
        if (typeof n !== 'object') return;
        const t = [].concat(n['@type'] || []);
        if (t.includes('JobPosting')) ld.push(n);
        if (n['@graph']) walk(n['@graph']);
        if (n.itemListElement) walk(n.itemListElement);
        if (n.item) walk(n.item);
      };
      walk(JSON.parse(s.textContent));
    } catch { /* ignorieren */ }
  }
  if (ld.length) {
    out.jsonLd = ld.length;
    const items = ld.map(j => {
      const loc = [].concat(j.jobLocation || [])[0];
      const a = loc && loc.address ? [loc.address.addressLocality, loc.address.addressRegion].filter(Boolean).join(', ') : '';
      return { title: clean(j.title), url: abs(j.url || (j.hiringOrganization && j.hiringOrganization.sameAs) || location.href), location: clean(a), meta: clean(j.employmentType || ''), postedAt: (j.datePosted || '').slice(0, 10) };
    }).filter(x => x.title);
    if (items.length >= 1) { out.method = 'jsonld'; out.items = items; }
  }

  // ---- 2. SuccessFactors ----
  if (!out.items.length) {
    const sf = [...document.querySelectorAll('a.jobTitle-link, a.jobTitle, .data-row a[href*="/job/"]')].filter(a => clean(a.textContent));
    if (sf.length) {
      const seen = new Set();
      out.method = 'successfactors';
      out.items = sf.map(a => {
        const row = a.closest('tr, li, .data-row') || a.parentElement;
        const loc = row ? clean((row.querySelector('.jobLocation, .colLocation, .jobFacility, [class*="location" i]') || {}).textContent) : '';
        const date = row ? clean((row.querySelector('.jobDate, .colDate, [class*="date" i]') || {}).textContent) : '';
        return { title: clean(a.textContent), url: abs(a.getAttribute('href')), location: loc, meta: date };
      }).filter(x => x.url && !seen.has(x.url) && seen.add(x.url));
    }
  }

  // ---- 3. wiederkehrende Link-Muster ----
  if (!out.items.length) {
    const sigOf = (el) => {
      const parts = [];
      let n = el, depth = 0;
      while (n && n.tagName && n.tagName !== 'BODY' && depth < 5) {
        const cls = [...n.classList].filter(c => c.length < 28 && !/\d{3,}|^[a-z]{1,2}[A-Z0-9_-]{5,}$|^(css|jsx|sc)-/.test(c)).sort().slice(0, 3).join('.');
        parts.push(n.tagName.toLowerCase() + (cls ? '.' + cls : ''));
        n = n.parentElement; depth++;
      }
      return parts.join('<');
    };
    const anchors = [...document.querySelectorAll('a[href]')].filter(a => {
      const href = a.getAttribute('href') || '';
      if (!href || href.startsWith('#') || NAV.test(href)) return false;
      if (a.closest('header, footer, nav, [role="navigation"], [class*="cookie" i], [id*="cookie" i], [class*="consent" i]')) return false;
      return vis(a);
    });
    out.candidates = anchors.length;
    const groups = new Map();
    for (const a of anchors) {
      const lines = (a.innerText || a.textContent || '').split('\n').map(clean).filter(Boolean);
      const heading = a.querySelector('h1,h2,h3,h4,h5,h6,[class*="title" i],[class*="job-name" i],[class*="jobname" i]');
      let title = heading ? clean(heading.textContent) : (lines[0] || '');
      if (title.length < 6 || title.length > 160 || BAD.test(title)) continue;
      const meta = lines.filter(l => l !== title).slice(0, 4).join(' · ');
      const row = a.closest('tr, li, article, [class*="job" i], [class*="card" i], [class*="result" i], [class*="item" i]');
      const rowText = row ? clean(row.innerText) : '';
      const sig = sigOf(a);
      const g = groups.get(sig) || { sig, items: [], jobish: 0, seen: new Set() };
      const url = abs(a.getAttribute('href'));
      if (!url || g.seen.has(url)) continue;
      g.seen.add(url);
      const hasWord = JOBWORDS.test(title);
      g.items.push({ title, url, meta: meta || (rowText && rowText !== title ? rowText.replace(title, '').trim().slice(0, 160) : ''), hasWord });
      if (hasWord) g.jobish++;
      groups.set(sig, g);
    }
    let best = null, bestScore = 0;
    for (const g of groups.values()) {
      if (g.items.length < 2) continue;
      if (g.jobish < 2 && !g.items.some(i => /\(\s*[mwdfgx]\s*[\/|]/i.test(i.title))) continue;
      const ratio = g.jobish / g.items.length;
      const score = g.jobish * (0.4 + ratio);
      if (score > bestScore) { bestScore = score; best = g; }
    }
    if (best) {
      out.method = 'liste';
      out.clusterSize = best.items.length;
      out.items = best.items.filter(i => i.hasWord || best.jobish / best.items.length > 0.5).map(({ hasWord, ...r }) => r);
    }
  }

  // Ort aus Zusatztext herausziehen (PLZ + Ort oder „Standort: …“)
  for (const it of out.items) {
    if (it.location) continue;
    const t = it.meta || '';
    const m = t.match(/\b(\d{5})\s+([A-ZÄÖÜ][\wäöüß.\-]+(?:[ \-][A-ZÄÖÜ][\wäöüß.\-]+)?)/) || t.match(/(?:Standort|Ort|Location|Einsatzort)\s*[:·]\s*([^·|\n]{3,50})/i);
    if (m) it.location = clean(m[2] ? m[1] + ' ' + m[2] : m[1]);
  }

  // ---- Weiter-Link / „Mehr laden“ ----
  const nextA = [...document.querySelectorAll('a[href]')].find(a => {
    const t = clean(a.textContent) + ' ' + (a.getAttribute('aria-label') || '') + ' ' + (a.getAttribute('title') || '');
    return (a.rel && /next/i.test(a.rel)) || /^(weiter|next|nächste( seite)?|›|»|>|vor)\s*$/i.test(clean(a.textContent)) || /(next page|nächste seite)/i.test(t);
  });
  if (nextA && !/#$/.test(nextA.getAttribute('href') || '#')) out.next = abs(nextA.getAttribute('href'));
  // „Mehr laden“ (Schaltfläche, Link ohne neue Seite, Eingabefeld) – wird für Playwright markiert
  document.querySelectorAll('[data-jobsuche-more],[data-jobsuche-next]').forEach(n => { n.removeAttribute('data-jobsuche-more'); n.removeAttribute('data-jobsuche-next'); });
  const MORE = /(mehr\s+(jobs|stellen|ergebnisse|angebote|anzeigen|laden)|weitere\s+(jobs|stellen|ergebnisse|angebote|anzeigen|laden)|(jobs|stellen|ergebnisse|angebote)\s+(laden|nachladen|anzeigen)|(load|show|view|see|display)\s+(more|all)|more\s+(jobs|results|positions|vacancies|openings)|alle\s+(stellen|jobs)\s+(laden|anzeigen)|^\s*(mehr|more|weitere|weitere laden|laden)\s*[+▾▼↓⌄]?\s*$)/i;
  const NEXTB = /^\s*(weiter|next|nächste( seite)?|naechste( seite)?|›|»|>|→|vor)\s*$/i;
  const samePage = (a) => { const h = a.getAttribute('href'); if (!h || h === '#' || /^javascript:/i.test(h)) return true; try { const u = new URL(h, location.href); return u.origin === location.origin && u.pathname === location.pathname && !u.search; } catch { return false; } };
  const clickables = [...document.querySelectorAll('button, a, [role="button"], input[type="button"], input[type="submit"], [class*="load-more" i], [class*="loadmore" i], [class*="show-more" i], [class*="more-jobs" i], [class*="pagination" i] [class*="next" i]')]
    .filter(b => vis(b) && !b.disabled && b.getAttribute('aria-disabled') !== 'true' && !b.closest('header, footer, [class*="cookie" i], [id*="cookie" i], [class*="consent" i]'));
  const label = (b) => clean(b.value || b.innerText || b.textContent) + ' ' + (b.getAttribute('aria-label') || '');
  const more = clickables.find(b => { const t = clean(b.value || b.innerText || b.textContent); return t.length <= 50 && MORE.test(t + ' ' + (b.getAttribute('aria-label') || '')) && (b.tagName !== 'A' || samePage(b)); });
  out.hasMore = !!more;
  if (more) more.setAttribute('data-jobsuche-more', '1');
  const nextB = !more && clickables.find(b => (b.tagName !== 'A' || samePage(b)) && (NEXTB.test(clean(b.innerText || b.textContent)) || /(^|\b)(next|weiter|nächste|naechste)\b/i.test(b.getAttribute('aria-label') || '')) && clean(b.innerText || b.textContent).length <= 20);
  out.hasNextBtn = !!nextB;
  if (nextB) nextB.setAttribute('data-jobsuche-next', '1');
  return out;
}

/** Klickt Cookie-Banner weg (läuft im Browser). */
export function consentScript() {
  const re = /^(alle (cookies )?akzeptieren|alles akzeptieren|akzeptieren|zustimmen|alle zulassen|einverstanden|accept all( cookies)?|accept|i agree|agree|ok|verstanden|alle annehmen|annehmen)$/i;
  const btn = [...document.querySelectorAll('button, a[role="button"], input[type="button"], input[type="submit"], a.btn, [class*="accept" i]')]
    .find(b => (b.offsetWidth || b.offsetHeight) && re.test((b.innerText || b.value || '').replace(/\s+/g, ' ').trim()));
  if (btn) { btn.click(); return true; }
  return false;
}

export function discoverScript() {
  const re = /(karriere|career|jobs?\b|stellenangebot|stellenmarkt|offene stellen|jobbörse|jobboerse|vacanc|arbeiten bei|join us)/i;
  const out = [];
  for (const a of document.querySelectorAll('a[href]')) {
    const t = (a.textContent || '').replace(/\s+/g, ' ').trim();
    const h = a.getAttribute('href') || '';
    if (!(re.test(t) || re.test(h))) continue;
    let url; try { url = new URL(h, location.href).href; } catch { continue; }
    if (/^(mailto|tel|javascript):/i.test(url)) continue;
    let score = 0;
    if (/stellenangebot|offene stellen|jobbörse|jobboerse|job-?suche|alle (jobs|stellen)|current vacancies|search jobs/i.test(t + ' ' + h)) score += 3;
    if (/karriere|career/i.test(h)) score += 2;
    if (/jobs/i.test(h)) score += 1;
    if (/(ausbildung|praktik|student|schüler|presse|news|blog)/i.test(h + t)) score -= 2;
    out.push({ url, label: t.slice(0, 80), score });
  }
  const seen = new Set();
  return out.filter(x => !seen.has(x.url) && seen.add(x.url)).sort((a, b) => b.score - a.score).slice(0, 5);
}
