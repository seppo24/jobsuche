// Gesamttest: db.json → crawl.mjs → jobs.json (lokal, ohne Dropbox/Internet).
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
const spawnAsync = (cmd, args, opts) => new Promise(res => { const c = spawn(cmd, args, opts); let stdout = '', stderr = ''; c.stdout.on('data', d => stdout += d); c.stderr.on('data', d => stderr += d); c.on('close', () => res({ stdout, stderr })); });
import { fileURLToPath } from 'node:url';
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const map = { '/sf': 'sf1.html', '/sf2.html': 'sf2.html', '/cards': 'cards.html', '/empty': 'empty.html', '/marketing': 'marketing.html', '/': 'home.html' };
const server = http.createServer((req, res) => {
  const p = new URL(req.url, 'http://x').pathname;
  if (p.startsWith('/job/') || p.startsWith('/stelle/')) { res.end('<h1>x</h1>'); return; }
  if (!map[p]) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(dir, map[p])));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jobs-'));
const T = '2026-10-29T00:00:00Z';
const db = { settings: { profile: { ort: 'Schwelm', radiusKm: 50, queries: ['Projektleiter'], home: { lat: 51.2867, lon: 7.295 } } },
  employers: {
    a: { id: 'a', name: 'Alpha (SF)', url: base + '/sf', kind: 'arbeitgeber', updatedAt: T },
    b: { id: 'b', name: 'Beta (Karten)', url: base + '/cards', kind: 'arbeitgeber', updatedAt: T },
    c: { id: 'c', name: 'Gamma (leer)', url: base + '/empty', kind: 'arbeitgeber', updatedAt: T },
    d: { id: 'd', name: 'Delta (Marketing)', url: base + '/marketing', kind: 'arbeitgeber', updatedAt: T },
    e: { id: 'e', name: 'Epsilon (aus)', url: base + '/sf', crawl: false, updatedAt: T },
    s: { id: 's', name: 'Stepstone', url: 'https://www.stepstone.de/', kind: 'portal', portalType: 'stepstone', updatedAt: T },
  },
  savedJobs: {} };
fs.writeFileSync(path.join(tmp, 'db.json'), JSON.stringify(db));
const run = () => spawnAsync('node', [path.join(dir, '..', '..', 'crawl.mjs')], { env: { ...process.env, LOCAL_DIR: tmp, CONCURRENCY: '2' }, encoding: 'utf8' });
let r = await run(); console.log(r.stdout, r.stderr.slice(0, 500));
const out = JSON.parse(fs.readFileSync(path.join(tmp, 'jobs.json'), 'utf8'));
let fails = 0; const expect = (n, c, i = '') => { console.log((c ? '✔ ' : '✖ ') + n + (i ? ' → ' + i : '')); if (!c) fails++; };
expect('Stellen von Alpha (10) und Beta (8)', out.jobs.filter(j => j.employerId === 'a').length === 10 && out.jobs.filter(j => j.employerId === 'b').length === 8);
expect('Epsilon (crawl=false) wird nicht abgerufen', !out.sources.e && !out.jobs.some(j => j.employerId === 'e'));
expect('Gamma ist „leer“', out.sources.c.status === 'leer');
expect('Delta liefert keine Stellen', out.jobs.filter(j => j.employerId === 'd').length === 0 && out.sources.d.status === 'unsicher');
expect('Stepstone = nur Link', out.sources.s.status === 'nur-link');
const w = out.jobs.find(j => j.title.startsWith('Technischer Projektleiter') && j.employerId === 'a');
expect('Entfernung Wuppertal berechnet', w && w.distanceKm >= 5 && w.distanceKm <= 15, w && w.distanceKm + ' km');
const first = out.jobs.find(j => j.employerId === 'a').firstSeen;
await new Promise(r => setTimeout(r, 1200));
r = await run();
const out2 = JSON.parse(fs.readFileSync(path.join(tmp, 'jobs.json'), 'utf8'));
expect('Zweiter Lauf behält „firstSeen“', out2.jobs.find(j => j.id === out.jobs.find(x => x.employerId === 'a').id).firstSeen === first);
// Einzelquelle
r = await spawnAsync('node', [path.join(dir, '..', '..', 'crawl.mjs')], { env: { ...process.env, LOCAL_DIR: tmp, ONLY: 'c' }, encoding: 'utf8' });
const out3 = JSON.parse(fs.readFileSync(path.join(tmp, 'jobs.json'), 'utf8'));
expect('ONLY=c lässt andere Quellen unangetastet', out3.jobs.filter(j => j.employerId === 'a').length === 10 && out3.sources.a.status === 'ok');
server.close(); fs.rmSync(tmp, { recursive: true });
console.log(fails ? 'FEHLER' : 'Gesamttest bestanden'); process.exit(fails ? 1 : 0);
