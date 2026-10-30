// Selbsttest des Crawlers gegen lokale Beispielseiten (kein Internet nötig).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { crawlEmployer } from '../lib/extract.mjs';
import { crawlWorkday } from '../lib/adapters.mjs';
import { evaluate } from '../lib/validate.mjs';
import { fetchJobLocation } from '../lib/extract.mjs';
import { scanTarif } from '../lib/tarif.mjs';
import { employeesFrom, sizeLabel, collectEmployers, homepageFor } from '../lib/discover.mjs';
import { distanceFor, lookupBuiltin, isForeign, knownPlace, setGazetteer } from '../lib/geo.mjs';
import { unzipTxt, parseGazetteer } from '../lib/gazetteer.mjs';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const wd = JSON.parse('{"total":45,"jobPostings":[]}');
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname.startsWith('/wday/cxs/')) { // Workday-Attrappe
    let body = ''; req.on('data', c => body += c); req.on('end', () => {
      const off = JSON.parse(body).offset;
      const jp = Array.from({ length: Math.max(0, Math.min(20, 45 - off)) }, (_, i) => ({ title: `Projektleiter Nr. ${off + i} (m/w/d)`, externalPath: `/job/Leverkusen/Projektleiter_JR-${off + i}`, locationsText: 'Leverkusen', postedOn: 'Posted Today' }));
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ total: 45, jobPostings: jp }));
    }); return;
  }
  if (u.pathname.startsWith('/job/') || u.pathname.startsWith('/stelle/') || u.pathname.startsWith('/p/')) { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<h1>Detail</h1>'); return; }
  if (u.pathname === '/sfs') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end('<!doctype html><html><head><meta charset="utf-8"><title>Karriere</title></head><body><header><nav><a href="/">Start</a></nav></header><h1>Karriere bei uns</h1><p>Finden Sie Ihren Job.</p><form action="/sfs/search" method="get"><input type="text" name="q" placeholder="Stichwort"><input type="text" name="locationsearch" placeholder="Ort"><button type="submit" class="btn">Suchen</button></form></body></html>'); return; }
  if (u.pathname === '/sfs/search') { // SuccessFactors-Suche: 25 Stellen, 10 je Seite, Folgeseiten nur über startrow (kein „Weiter“-Link)
    const start = +(u.searchParams.get('startrow') || 0); const T = ['Projektleiter', 'Teamleiter', 'Konstrukteur', 'Servicetechniker', 'Projektmanager'];
    const rows = Array.from({ length: Math.max(0, Math.min(10, 25 - start)) }, (_, i) => `<tr class="data-row"><td><span class="jobTitle"><a href="/job/${start + i}/" class="jobTitle-link">${T[(start + i) % 5]} Nr. ${start + i} (m/w/d)</a></span></td><td><span class="jobLocation">Wuppertal, DE</span></td></tr>`).join('');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(`<!doctype html><html><head><meta charset="utf-8"><title>Suche</title></head><body><h1>Stellenangebote</h1><span class="paginationLabel">Ergebnisse ${start + 1} – ${Math.min(start + 10, 25)} von 25</span><table><tbody>${rows}</tbody></table></body></html>`); return;
  }
  const map = { '/': 'home.html', '/sf': 'sf1.html', '/sf2.html': 'sf2.html', '/cards': 'cards.html', '/ld': 'ld.html', '/old': 'old1.html', '/old2.html': 'old2.html', '/empty': 'empty.html', '/js': 'js.html', '/d1': 'detail-icon.html', '/d2': 'detail-plain.html', '/d3': 'detail-dl.html', '/d4': 'detail-addr.html', '/loc': 'loc.html', '/more2': 'more2.html', '/scroll': 'scroll.html', '/nextbtn': 'nextbtn.html', '/marketing': 'marketing.html', '/sfsize': 'sf-size.html', '/sfarrow': 'sf-arrow.html', '/bstart': 'b-start.html', '/bres': 'b-res.html', '/hboge': 'h-boge.html', '/hdh': 'h-dh.html', '/hacc': 'h-acc.html', '/hziel': 'h-ziel.html', '/hyear': 'h-year.html', '/karriere': 'marketing.html' };
  const f = map[u.pathname];
  if (u.pathname === '/gone') { res.writeHead(404, { 'Content-Type': 'text/html' }); res.end(fs.readFileSync(path.join(dir, '404.html'))); return; }
  if (u.pathname === '/moved') { res.writeHead(302, { Location: '/cards' }); res.end(); return; }
  if (!f) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(dir, f)));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
const ctx = await browser.newContext({ locale: 'de-DE' });

let fails = 0;
const expect = (name, cond, info = '') => { console.log((cond ? '  ✔ ' : '  ✖ ') + name + (info ? '  → ' + info : '')); if (!cond) fails++; };

const cases = [
  ['SuccessFactors-Liste (2 Seiten)', '/sf', r => r.items.length === 10 && r.test.method === 'successfactors' && r.test.status === 'ok' && r.items[0].location.startsWith('Wuppertal')],
  ['Karten ohne Klassen + Cookie-Banner', '/cards', r => r.items.length === 8 && r.test.method === 'liste' && ['ok', 'unsicher'].includes(r.test.status) && r.items[0].title.startsWith('Technischer Projektleiter')],
  ['JSON-LD', '/ld', r => r.items.length === 4 && r.test.method === 'jsonld' && r.items[1].location.includes('Schwelm')],
  ['Alte Tabelle mit „›“-Seitenwechsel', '/old', r => r.items.length === 10 && r.test.status !== 'fehler'],
  ['Leere Karriereseite', '/empty', r => r.items.length === 0 && r.test.status === 'leer'],
  ['Per JavaScript geladen + „Mehr laden“', '/js', r => r.items.length === 10 && r.test.status !== 'fehler'],
  ['„Weitere Jobs anzeigen“ als Link (90 Stellen)', '/more2', r => r.items.length === 90 && r.test.status === 'ok'],
  ['Endloses Scrollen (60 Stellen)', '/scroll', r => r.items.length === 60 && r.test.status === 'ok'],
  ['Seitenwechsel per Schaltfläche (40 Stellen)', '/nextbtn', r => r.items.length === 40 && r.test.status === 'ok'],
  ['Suchmaske leer abschicken + startrow-Seiten (25 Stellen)', '/sfs', r => r.items.length === 25 && r.test.status === 'ok'],
  ['Einsatzort aus Karten (Klasse, „Standort:“, PLZ, „DE-“, Zeilen)', '/loc', r => { const L = r.items.map(i => i.location); return L[0] === 'Wuppertal' && L[1] === 'Hagen' && /Wuppertal/.test(L[2]) && /K.ln/.test(L[3]) && L[4] === 'Remscheid' && /^Dortmund/.test(L[5]) && !L[6]; }],
  ['Überschriften-Karten + „Mehr erfahren“ (Boge)', '/hboge', r => r.items.length === 8 && r.items[0].url.includes('/stelle/0') && r.test.status !== 'leer'],
  ['Karten ohne Links, Standort-Überschriften (D+H)', '/hdh', r => r.items.length === 8 && r.items.some(i => /Hamburg/.test(i.location || '')) && r.test.status !== 'leer'],
  ['Akkordeon mit #-Links (Fluitronics)', '/hacc', r => r.items.length === 6 && !r.items.some(i => /Initiativ/i.test(i.title))],
  ['Stellen als Überschriften ohne Links (Ziel)', '/hziel', r => r.items.length === 5 && r.items[0].url.includes('#')],
  ['Jahreszahl ist keine Stellenzahl', '/hyear', r => r.items.length === 8 && r.test.status === 'ok'],
  ['SuccessFactors: „Einträge pro Seite“ auf Maximum (40 Stellen)', '/sfsize', r => r.items.length === 40],
  ['Seitenwechsel über Pfeil-Bild (30 Stellen)', '/sfarrow', r => r.items.length === 30],
  ['„Alle Jobs anzeigen“ führt auf eigene Seite (30 Stellen)', '/bstart', r => r.items.length === 30 && r.test.status === 'ok'],
  ['Seite ohne Stellenliste', '/marketing', r => (r.items.length === 0 && r.test.status === 'unsicher') || r.test.confidence === 'niedrig'],
  ['Alte Adresse 404 → Vorschlag', '/gone', r => r.test.status === 'fehler' && r.test.suggestions.some(s => s.url.endsWith('/karriere/stellenangebote') || s.url.includes('karriere'))],
  ['Weiterleitung wird gemeldet', '/moved', r => r.test.suggestions.some(s => s.url.endsWith('/cards'))],
];
for (const [name, p, check] of cases) {
  console.log(name);
  const r = await crawlEmployer(ctx, { id: 't', name, url: base + p });
  expect('Erwartung erfüllt', check(r), `${r.items.length} Stellen · ${r.test.status}/${r.test.confidence} · ${r.test.method} · ${r.test.message || ''}`);
  if (process.env.VERBOSE) console.log(JSON.stringify(r.test.checks), r.items.slice(0, 2));
}

console.log('Einsatzort aus der Detailseite');
{
  const t1 = await fetchJobLocation(ctx, base + '/d1'); expect('Pin-Symbol neben „Essen“ (Minimax)', t1.location === 'Essen', JSON.stringify(t1));
  const t2 = await fetchJobLocation(ctx, base + '/d2'); expect('Ohne Symbol: Kandidat „Hagen“ aus der Ortsliste', !t2.location && t2.candidates.some(c => lookupBuiltin(c)), JSON.stringify(t2.candidates));
  const t4 = await fetchJobLocation(ctx, base + '/d4'); expect('Adresszeile „41564 Kaarst“ weit unten (SVT)', t4.candidates[0] === '41564 Kaarst', JSON.stringify(t4.candidates.slice(0, 2)));
  const t3 = await fetchJobLocation(ctx, base + '/d3'); expect('Definitionsliste „Standort“', t3.location === 'Gevelsberg', JSON.stringify(t3));
}
console.log('Workday-Schnittstelle (Attrappe)');
const w = await crawlWorkday(base + '/de-DE/extern');
expect('45 Stellen über 3 Seiten', w.items.length === 45 && w.items[0].url.includes('/de-DE/extern/job/Leverkusen/'), `${w.items.length} · ${w.items[0]?.url}`);
const ev = evaluate({ ...w, startUrl: base });
expect('Bewertung „ok“', ev.status === 'ok', ev.status + '/' + ev.confidence);

console.log('Bewertung / Entfernungen');
expect('HTTP 403 → blockiert', evaluate({ httpStatus: 403, text: 'Access Denied' }).status === 'blockiert');
expect('Fehler → fehler', evaluate({ error: 'net::ERR_NAME_NOT_RESOLVED' }).status === 'fehler');
expect('Hinweis „120 Stellen“ aber 5 erkannt → unsicher', evaluate({ items: Array.from({ length: 5 }, (_, i) => ({ title: 'Ingenieur (m/w/d)', url: 'https://a.de/' + i })), method: 'liste', hint: 120, startUrl: 'https://a.de/' }).status === 'unsicher');
const home = { lat: 51.2867, lon: 7.295 };
const d1 = await distanceFor('42279 Wuppertal, DE', home, {}, { online: false });
const d2 = await distanceFor('München', home, {}, { online: false });
expect('Wuppertal ≈ 10 km', d1 >= 5 && d1 <= 15, d1 + ' km');
expect('München > 400 km', d2 > 400, d2 + ' km');
expect('„Wuppertal, Nordrhein-Westfalen, Deutschland“', (await distanceFor('Wuppertal, Nordrhein-Westfalen, Deutschland', home, {}, { online: false })) < 20);
expect('„Hybrid | Köln / Hagen (DE)“ → nächster', (await distanceFor('Hybrid | Köln / Hagen (DE)', home, {}, { online: false })) < 20);
expect('„Remote“ allein → unbekannt', (await distanceFor('Remote', home, {}, { online: false })) === null);
expect('Ausland erkannt', isForeign('Veghel, Netherlands') && !isForeign('Köln, Germany') && !isForeign('Hagen'));
expect('Mehrere Orte → nächster', (await distanceFor('Hamburg / Hagen', home, {}, { online: false })) < 20);
;{ const a = scanTarif('Wir zahlen nach dem Tarifvertrag der Metall- und Elektroindustrie NRW, Entgeltgruppe 11.'); expect('Tarif: IG Metall + EG 11', a && /IG Metall/.test(a.name) && a.eg === '11', JSON.stringify(a)); expect('Tarif: nichts erwähnt → null', scanTarif('Attraktive Vergütung und 30 Tage Urlaub') === null); }
{ const d = await distanceFor('BSH 89407 Dillingen an der Donau DE', home, {}, { online: false }); expect('PLZ-Notnagel: 89407 Dillingen ≈ 375 km Luftlinie (nicht im Umkreis)', d > 330 && d < 420, d + ' km'); }
expect('Unbekannter Ort offline → leer', (await distanceFor('Kleindorfhausen', home, {}, { online: false })) === null);


// ---- Ortsverzeichnis, Ausland, Entfernungen ----
{
  const gz = parseGazetteer(unzipTxt(fs.readFileSync(path.join(dir, 'de-mini.zip'))));
  setGazetteer(gz);
  const H = { lat: 51.2867, lon: 7.295 };
  const d = async (t) => distanceFor(t, H, {}, { online: false });
  const kaarst = await d('41564 Kaarst'); expect('Kaarst (PLZ-Verzeichnis) ≈ 45 km', kaarst > 30 && kaarst < 60, kaarst + ' km');
  const bit = await d('Bitburg'); expect('Bitburg (Ortsverzeichnis) > 50 km', bit > 120 && bit < 180, bit + ' km');
  const dil = await d('BSH 89407 Dillingen an der Donau DE'); expect('Dillingen an der Donau ≈ 375 km', dil > 330 && dil < 420, dil + ' km');
  expect('Österreich „Puch bei Hallein, 5, AT, 5412“ → Ausland, keine Distanz', isForeign('Puch bei Hallein, 5, AT, 5412') && (await d('Puch bei Hallein, 5, AT, 5412')) === null);
  expect('USA „Northville, Michigan, MI, Vereinigte Staaten von Amerika“ → Ausland', isForeign('Northville, Michigan, MI, Vereinigte Staaten von Amerika') && (await d('Northville, Michigan, MI, Vereinigte Staaten von Amerika')) === null);
  expect('„Köln, DE“ nicht Ausland', !isForeign('Köln, DE') && !isForeign('Dortmund'));
  expect('Ort bekannt (strikt): „Kaarst“ ja, „Berufserfahrene“ nein', knownPlace('Kaarst', true) && !knownPlace('Berufserfahrene', true) && !knownPlace('Minimax GmbH', true));
  setGazetteer(null);
}

// ---- Arbeitgebersuche (BA-Schnittstelle als Attrappe) ----
{
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (u) => {
    u = String(u);
    const J = o => ({ ok: true, status: 200, json: async () => o, text: async () => JSON.stringify(o) });
    if (u.includes('/jobdetails/')) return J({ titel: 'x', externeUrl: 'https://www.stepstone.de/job/1', arbeitgeberHomepage: 'https://www.muster-technik.de/karriere/abc' });
    if (u.includes('/jobs?')) return J({ stellenangebote: [
      { refnr: 'A1', titel: 'Projektleiter Anlagenbau', arbeitgeber: 'Muster Technik GmbH', arbeitsort: { ort: 'Hagen', entfernung: '9' } },
      { refnr: 'A2', titel: 'Teamleiter Montage', arbeitgeber: 'Muster Technik GmbH', arbeitsort: { ort: 'Gevelsberg', entfernung: '3' } },
      { refnr: 'B1', titel: 'Projektleiter', arbeitgeber: 'Randstad Deutschland GmbH & Co. KG', arbeitsort: { ort: 'Essen' } },
      { refnr: 'C1', titel: 'Konstrukteur', arbeitgeber: 'Zweite AG', arbeitsort: { ort: 'Witten', entfernung: '12' } } ] });
    return realFetch(u);
  };
  const c = await collectEmployers({ ort: 'Schwelm', radius: 50, queries: ['Projektleiter'], maxPages: 1 });
  expect('Arbeitgeber gesammelt und nach Stellenzahl sortiert', c.length === 3 && c[0].name.startsWith('Muster') && c[0].count === 2 && c[0].minKm === 3, c.map(x => x.name + ':' + x.count).join(', '));
  expect('Personaldienstleister erkannt', c.find(x => /Randstad/.test(x.name)).agency === true);
  expect('Homepage aus BA-Detail (Stepstone wird ignoriert)', (await homepageFor('A1')) === 'https://www.muster-technik.de');
  globalThis.fetch = realFetch;
  expect('Größe aus Text', employeesFrom('Wir sind über 1.200 Mitarbeitende an 5 Standorten') === 1200 && sizeLabel(1200) === 'großes Unternehmen' && employeesFrom('Kein Hinweis') === null);
}
await browser.close(); server.close();
console.log(fails ? `\n${fails} Prüfung(en) fehlgeschlagen` : '\nAlle Prüfungen bestanden');
process.exit(fails ? 1 : 0);
