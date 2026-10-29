// Ruft eine Karriereseite mit einem echten Browser (Playwright/Chromium) ab und erkennt die Stellenliste.
import { pageScript, consentScript, discoverScript } from './pagescript.mjs';
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

export async function crawlPage(context, startUrl, { maxPages = 12, maxLoadMore = 12 } = {}) {
  const page = await context.newPage();
  const all = new Map();
  let httpStatus = 0, finalUrl = startUrl, method = '', hint = null, text = '', pages = 0, error = '';
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
      // „Mehr laden“-Schaltfläche
      for (let k = 0; k < maxLoadMore && res.hasMore; k++) {
        const btn = page.getByRole('button', { name: /mehr (laden|anzeigen|stellen|jobs)|load more|show more|weitere (stellen|jobs|ergebnisse)/i }).first();
        if (!(await btn.isVisible().catch(() => false))) break;
        const before = res.items.length;
        await btn.click({ timeout: 3000 }).catch(() => {});
        await settle(page, 4000);
        res = await page.evaluate(pageScript);
        if (res.items.length <= before) break;
      }
      if (p === 0) { text = res.text; hint = res.hint; method = res.method; }
      if (!method && res.method) method = res.method;
      let added = 0;
      for (const it of res.items) if (!all.has(it.url)) { all.set(it.url, it); added++; }
      if (!res.next || visited.has(res.next) || !added) break;
      visited.add(res.next);
      const r2 = await page.goto(res.next, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null);
      if (!r2) break;
      await settle(page, 4000);
    }
  } catch (e) {
    error = /net::ERR|Timeout|ERR_/.test(e.message) ? e.message.split('\n')[0] : e.message;
  } finally { await page.close().catch(() => {}); }
  return { items: [...all.values()], httpStatus, finalUrl, method, hint, text, pages, error };
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

/** Eine Quelle komplett abarbeiten: Abruf → Erkennung → Bewertung (+ Adress-Vorschläge). */
export async function crawlEmployer(context, emp, { discover = true } = {}) {
  const t0 = Date.now();
  let raw;
  try {
    if (isWorkday(emp.url) && emp.adapter !== 'generic') raw = await crawlWorkday(emp.url);
    else raw = await crawlPage(context, emp.url);
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
