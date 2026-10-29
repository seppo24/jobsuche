// Direkte Schnittstellen (ohne Browser): Workday und Bundesagentur für Arbeit.
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function jfetch(url, opt = {}, timeout = 25000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { ...opt, signal: ctl.signal, headers: { 'User-Agent': UA, Accept: 'application/json', ...(opt.headers || {}) } });
    return r;
  } finally { clearTimeout(t); }
}

export const isWorkday = url => /\.myworkdayjobs\.com/i.test(url);

/** Workday: https://{tenant}.wd3.myworkdayjobs.com/{locale}/{site} */
export async function crawlWorkday(startUrl, { maxJobs = 600 } = {}) {
  const u = new URL(startUrl);
  const tenant = u.hostname.split('.')[0];
  const segs = u.pathname.split('/').filter(Boolean);
  const locale = /^[a-z]{2}(-[A-Z]{2})?$/.test(segs[0]) ? segs[0] : null;
  const site = locale ? segs[1] : segs[0];
  if (!site) throw new Error('Workday-Adresse ohne Seitenname');
  const api = `${u.origin}/wday/cxs/${tenant}/${site}/jobs`;
  const items = [];
  let total = null, status = 200;
  for (let offset = 0; offset < maxJobs; offset += 20) {
    const r = await jfetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appliedFacets: {}, limit: 20, offset, searchText: '' }) });
    status = r.status;
    if (!r.ok) { if (offset === 0) return { items: [], httpStatus: r.status, finalUrl: startUrl, method: 'workday', text: await r.text().catch(() => '') }; break; }
    const j = await r.json();
    total = j.total ?? total;
    for (const p of j.jobPostings || []) items.push({ title: p.title, url: `${u.origin}/${locale ? locale + '/' : ''}${site}${p.externalPath}`, location: p.locationsText || '', meta: p.postedOn || '' });
    if (!(j.jobPostings || []).length || (total != null && offset + 20 >= total)) break;
  }
  return { items, hint: total, httpStatus: status, finalUrl: startUrl, method: 'workday', text: '' };
}

/** Bundesagentur für Arbeit – offizielle Jobsuche-API (kostenlos, mit festem öffentlichen API-Key). */
export async function crawlBA({ queries, ort, radius, maxPerQuery = 150 }) {
  const items = new Map();
  let httpStatus = 200, total = 0;
  for (const q of queries.length ? queries : ['']) {
    for (let page = 1; page <= Math.ceil(maxPerQuery / 50); page++) {
      const url = `https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4/jobs?was=${encodeURIComponent(q)}&wo=${encodeURIComponent(ort)}&umkreis=${radius}&angebotsart=1&size=50&page=${page}`;
      const r = await jfetch(url, { headers: { 'X-API-Key': 'jobboerse-jobsuche' } });
      httpStatus = r.status;
      if (!r.ok) break;
      const j = await r.json();
      total += (j.maxErgebnisse ? 0 : 0);
      for (const s of j.stellenangebote || []) {
        const loc = s.arbeitsort || {};
        const id = s.refnr;
        if (items.has(id)) continue;
        items.set(id, {
          title: s.titel || s.beruf, employer: s.arbeitgeber || '', url: `https://www.arbeitsagentur.de/jobsuche/jobdetail/${encodeURIComponent(id)}`,
          location: [loc.plz, loc.ort].filter(Boolean).join(' '), distanceKm: loc.entfernung != null ? Math.round(parseFloat(String(loc.entfernung).replace(',', '.'))) : undefined,
          meta: s.beruf && s.beruf !== s.titel ? s.beruf : '', postedAt: (s.aktuelleVeroeffentlichungsdatum || '').slice(0, 10), query: q,
        });
      }
      if ((j.stellenangebote || []).length < 50) break;
    }
  }
  return { items: [...items.values()], httpStatus, finalUrl: 'https://www.arbeitsagentur.de/jobsuche/', method: 'ba', text: '' };
}
