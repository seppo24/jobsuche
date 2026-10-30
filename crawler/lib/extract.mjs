// Ruft eine Karriereseite mit einem echten Browser (Playwright/Chromium) ab und erkennt die Stellenliste.
import { pageScript, consentScript, discoverScript, searchFormScript } from './pagescript.mjs';
import { evaluate } from './validate.mjs';
import { crawlWorkday, isWorkday } from './adapters.mjs';

const settle = async (page, ms = 6000) => { try { await page.waitForLoadState('networkidle', { timeout: ms }); } catch { /* weiter */ } };

async function autoScroll(page) {
  try {
    await page.evaluate(async () => {
      for (let i = 0; i < 4; i++) { window.scrollTo(0, document.body.scrollHeight); await new Promise(r => setTimeout(r, 350)); }
      window.scrollTo(0, 0);
    });
  } catch { /* Seite hat sich geändert */ }
}

export async function crawlPage(context, startUrl, { maxPages = 12, maxLoadMore = 90, budgetMs = 90000, maxItems = 800 } = {}) {
  const deadline = Date.now() + budgetMs;
  const page = await context.newPage();
  const all = new Map();
  let httpStatus = 0, finalUrl = startUrl, method = '', hint = null, text = '', pages = 0, error = '', searchSubmitted = false;
  try {
    const resp = await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
    httpStatus = resp ? resp.status() : 0;
    await settle(page);
    if (await page.evaluate(consentScript).catch(() => false)) await settle(page, 3000);
    finalUrl = page.url();
    const visited = new Set([finalUrl]);
    for (let p = 0; p < maxPages; p++) {
      pages++;
      await autoScroll(page);
      let res = await page.evaluate(pageScript);
      // Keine Liste, aber eine Suchmaske? Leer abschicken – viele Seiten zeigen dann alle Stellen.
      if (p === 0 && !res.items.length && await page.evaluate(searchFormScript).catch(() => false)) {
        const before = page.url();
        const sb = page.locator('[data-jobsuche-submit="1"]').first();
        if (await sb.click({ timeout: 3000 }).then(() => true).catch(() => false)) {
          await page.waitForTimeout(900); await settle(page, 6000);
          await autoScroll(page);
          const r2 = await page.evaluate(pageScript);
          if (r2.items.length) { res = r2; searchSubmitted = true; if (page.url() !== before) finalUrl = page.url(); }
        }
      }
      // Weitere Stellen nachladen: „Mehr laden“-Schaltflächen anklicken bzw. bei endlosem Scrollen nach unten scrollen
      const firstCount = res.items.length;
      const target = res.hint && res.hint > firstCount ? Math.min(res.hint, 2000) : 0;
      let prevCount = firstCount, stall = 0;
      for (let k = 0; k < maxLoadMore && Date.now() < deadline; k++) {
        if ((target && res.items.length >= target) || res.items.length >= maxItems) break;
        let acted = false;
        if (res.hasMore) {
          const btn = page.locator('[data-jobsuche-more="1"]').first();
          if (await btn.isVisible().catch(() => false)) {
            await btn.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
            acted = await btn.click({ timeout: 3000 }).then(() => true).catch(() => false);
          }
        }
        if (!acted) await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
        await page.waitForTimeout(acted ? 700 : 900);
        await settle(page, 3500);
        res = await page.evaluate(pageScript);
        if (res.items.length > prevCount) { prevCount = res.items.length; stall = 0; }
        else if (++stall >= (acted ? 2 : 2)) break;
      }
      if (p === 0) { text = res.text; hint = res.hint; method = res.method; }
      if (!method && res.method) method = res.method;
      let added = 0;
      for (const it of res.items) if (!all.has(it.url)) { all.set(it.url, it); added++; }
      if (!added || Date.now() > deadline) break;
      if (!res.next && !res.hasNextBtn && !res.hasMore && res.method === 'successfactors' && res.items.length >= 10) {
        // SuccessFactors-Suche: Folgeseiten über „startrow“ (auch wenn kein „Weiter“-Link erkennbar ist)
        const u = new URL(page.url()); const size = res.items.length;
        u.searchParams.set('startrow', String((p + 1) * size)); res.next = u.href;
      }
      if (res.next && !visited.has(res.next)) {
        visited.add(res.next);
        const r2 = await page.goto(res.next, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null);
        if (!r2) break;
        await settle(page, 4000);
      } else if (res.hasNextBtn) { // Seitenwechsel per Schaltfläche (ohne eigene Adresse)
        const nb = page.locator('[data-jobsuche-next="1"]').first();
        if (!(await nb.isVisible().catch(() => false)) || !(await nb.click({ timeout: 3000 }).then(() => true).catch(() => false))) break;
        await page.waitForTimeout(700); await settle(page, 4000);
      } else break;
    }
  } catch (e) {
    error = /net::ERR|Timeout|ERR_/.test(e.message) ? e.message.split('\n')[0] : e.message;
  } finally { await page.close().catch(() => {}); }
  return { items: [...all.values()], httpStatus, finalUrl, method, hint, text, pages, error, searchSubmitted };
}

/** Sucht auf der Startseite der Domain nach der aktuellen Karriere-/Stellenseite. */
export async function discoverCareerUrls(context, url) {
  const page = await context.newPage();
  try {
    const origin = new URL(url).origin;
    await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await settle(page, 4000);
    await page.evaluate(consentScript).catch(() => {});
    return await page.evaluate(discoverScript);
  } catch { return []; } finally { await page.close().catch(() => {}); }
}

export async function fetchDescription(context, url) {
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await settle(page, 5000);
    await page.evaluate(consentScript).catch(() => {});
    return await page.evaluate(() => {
      const ld = [...document.querySelectorAll('script[type="application/ld+json"]')].map(s => { try { return JSON.parse(s.textContent); } catch { return null; } }).flat().filter(Boolean);
      const jp = ld.find(x => x && ([].concat(x['@type'] || []).includes('JobPosting')));
      if (jp && jp.description) { const d = document.createElement('div'); d.innerHTML = jp.description; return (d.innerText || d.textContent || '').trim().slice(0, 12000); }
      const main = document.querySelector('main, [role="main"], article, #content, .content') || document.body;
      return (main.innerText || '').replace(/\n{3,}/g, '\n\n').trim().slice(0, 12000);
    });
  } catch { return ''; } finally { await page.close().catch(() => {}); }
}

/** Einsatzort aus der Detailseite einer Stelle lesen: strukturierte Daten, beschriftete Felder, Orts-Symbole (Pin) – sonst Kandidaten für die Ortsliste. */
export async function fetchJobLocation(context, url) {
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await settle(page, 4000);
    await page.evaluate(consentScript).catch(() => {});
    return await page.evaluate(() => {
      const clean = t => (t || '').replace(/\s+/g, ' ').trim();
      const vis = el => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
      const res = (location, how) => ({ location: clean(location).slice(0, 120), how, candidates: [] });
      // 1. JSON-LD JobPosting
      for (const sc of document.querySelectorAll('script[type="application/ld+json"]')) {
        try {
          const walk = n => Array.isArray(n) ? n.flatMap(walk) : n && typeof n === 'object' ? [n, ...walk(n['@graph'] || [])] : [];
          const jp = walk(JSON.parse(sc.textContent)).find(x => [].concat(x['@type'] || []).includes('JobPosting'));
          if (jp) {
            const locs = [].concat(jp.jobLocation || []).map(l => { const a = (l && l.address) || {}; return typeof a === 'string' ? a : [a.postalCode, a.addressLocality, a.addressRegion, a.addressCountry && (a.addressCountry.name || a.addressCountry)].filter(Boolean).join(' '); }).filter(Boolean);
            if (locs.length) return res([...new Set(locs)].join('; '), 'jsonld');
          }
        } catch { /* weiter */ }
      }
      // 2. Microdaten
      const mi = document.querySelector('[itemprop="addressLocality"], [itemprop="jobLocation"]');
      if (mi && clean(mi.textContent)) return res(mi.textContent, 'itemprop');
      // 3. Orts-Symbol (Pin, map-marker, location) – der Ort steht direkt daneben
      const ICON = /(map-?marker|map-?pin|location|geo-?alt|\bpin\b|place|standort|ort\b)/i;
      const h1 = document.querySelector('h1');
      const scope = h1 ? (h1.closest('main, article, section, [class*="job" i], [class*="detail" i]') || document.body) : document.body;
      for (const ic of scope.querySelectorAll('i, svg, span[class*="icon" i], img[alt], [class*="icon" i]')) {
        const key = [ic.className && ic.className.baseVal !== undefined ? ic.className.baseVal : ic.className, ic.getAttribute('aria-label'), ic.getAttribute('title'), ic.getAttribute('alt'), ic.getAttribute('data-icon'), (ic.querySelector && ic.querySelector('use')) ? (ic.querySelector('use').getAttribute('href') || ic.querySelector('use').getAttribute('xlink:href')) : ''].join(' ');
        if (!ICON.test(key) || /(mail|phone|email|share)/i.test(key)) continue;
        const holder = ic.parentElement; if (!holder) continue;
        let t = clean(holder.innerText || holder.textContent);
        if (t.length > 80 || !t) { const sib = ic.nextElementSibling || ic.nextSibling; t = clean(sib && (sib.innerText || sib.textContent)); }
        if (t && t.length <= 80 && !/(vollzeit|teilzeit|unbefristet|handwerk|berufserfahr)/i.test(t)) return res(t.replace(/^(standort|ort|location|einsatzort)\s*[:·-]?\s*/i, ''), 'icon');
      }
      // 4. Beschriftete Felder: „Einsatzort: …“, Tabellen/Definitionslisten
      for (const lab of scope.querySelectorAll('dt, th, td, strong, b, label, span, div')) {
        const lt = clean(lab.childElementCount ? '' : lab.textContent);
        if (!/^(standort|einsatzort|arbeitsort|dienstort|ort|location|work location|city|stadt)\s*:?$/i.test(lt)) continue;
        const val = lab.nextElementSibling ? clean(lab.nextElementSibling.innerText || lab.nextElementSibling.textContent) : clean((lab.parentElement && lab.parentElement.innerText || '').replace(lt, ''));
        if (val && val.length <= 80) return res(val, 'feld');
      }
      const body = (document.body.innerText || '').slice(0, 20000);
      const m = body.match(/(?:Standort|Einsatzort|Arbeitsort|Dienstort|Location|Work location|Ort)\s*[:\n]\s*([^\n]{3,80})/i);
      if (m) return res(m[1], 'text');
      const meta = document.querySelector('meta[name="geo.placename"], meta[property="og:locality"], meta[name="job-location"]');
      if (meta && meta.content) return res(meta.content, 'meta');
      // 5. Kandidaten: kurze Zeilen nahe der Überschrift (werden in Node gegen die Ortsliste geprüft)
      const cand = [];
      const lines = (scope.innerText || '').split('\n').map(clean).filter(l => l.length >= 3 && l.length <= 45);
      const hi = h1 ? lines.findIndex(l => clean(h1.textContent).startsWith(l.slice(0, 20))) : 0;
      for (const l of lines.slice(Math.max(hi, 0), Math.max(hi, 0) + 25)) cand.push(l);
      return { location: '', how: '', candidates: cand };
    });
  } catch { return { location: '', how: '', candidates: [] }; } finally { await page.close().catch(() => {}); }
}

/** Eine Quelle komplett abarbeiten: Abruf → Erkennung → Bewertung (+ Adress-Vorschläge). */
export async function crawlEmployer(context, emp, { discover = true, altContext = null } = {}) {
  const t0 = Date.now();
  let raw;
  try {
    if (isWorkday(emp.url) && emp.adapter !== 'generic') raw = await crawlWorkday(emp.url);
    else {
      raw = await crawlPage(context, emp.url);
      if (raw.error && /ERR_HTTP2|ERR_SPDY|ERR_QUIC/.test(raw.error) && altContext) raw = await crawlPage(await altContext(), emp.url); // zweiter Versuch ohne HTTP/2
    }
  } catch (e) { raw = { items: [], error: e.message, httpStatus: 0, finalUrl: emp.url, method: '', text: '' }; }

  const test = evaluate({ ...raw, startUrl: emp.url });
  const suggestions = [];
  if (raw.finalUrl && raw.finalUrl !== emp.url) {
    const a = new URL(raw.finalUrl), b = new URL(emp.url);
    if (a.hostname !== b.hostname || a.pathname.replace(/\/$/, '') !== b.pathname.replace(/\/$/, '')) suggestions.push({ url: raw.finalUrl, label: 'Weiterleitung der bisherigen Adresse' });
  }
  if (discover && ['fehler', 'unsicher', 'blockiert'].includes(test.status) && !isWorkday(emp.url)) {
    for (const d of await discoverCareerUrls(context, emp.url)) if (d.url !== emp.url && d.score > 0) suggestions.push({ url: d.url, label: d.label || 'Karriere-Link auf der Startseite' });
  }
  return {
    items: raw.items,
    test: {
      ...test, method: raw.method || '', httpStatus: raw.httpStatus, finalUrl: raw.finalUrl, checkedAt: new Date().toISOString(), durationMs: Date.now() - t0,
      sample: raw.items.slice(0, 6).map(i => ({ title: i.title, url: i.url, location: i.location || '' })), suggestions: suggestions.slice(0, 4), url: emp.url,
    },
  };
}
