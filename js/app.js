import { h, fmtRel } from './util.js';
import { S, on, list, seedEmployers, loadCachedJobs, pull } from './store.js';
import * as dbx from './dropbox.js';
import { seedPortals } from './portals.js';
import { toast } from './ui.js';
import './install.js';
import { VERSION } from './changelog.js';
import { followUpState } from './views/applications.js';
import * as Jobs from './views/jobs.js';
import * as Employers from './views/employers.js';
import * as Applications from './views/applications.js';
import * as Documents from './views/documents.js';
import * as Info from './views/info.js';

const NS = 'http://www.w3.org/2000/svg';
const icon = d => { const s = document.createElementNS(NS, 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); d.split('|').forEach(x => { const p = document.createElementNS(NS, 'path'); p.setAttribute('d', x); s.appendChild(p); }); return s; };
const ROUTES = [
  ['stellen', 'Stellen', Jobs, 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z|M21 21l-5-5'],
  ['arbeitgeber', 'Arbeitgeber', Employers, 'M4 21V7l8-4 8 4v14|M9 21v-6h6v6|M9 10h.01M15 10h.01'],
  ['bewerbungen', 'Bewerbungen', Applications, 'M5 3h10l4 4v14H5z|M14 3v5h5|M8 13h8M8 17h5'],
  ['dokumente', 'Dokumente', Documents, 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'],
  ['info', 'Info', Info, 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z|M12 11v5|M12 8h.01'],
];

const main = h('main', { id: 'main', tabindex: '-1' });
const syncBtn = h('button', { class: 'sync', type: 'button', onclick: () => { if (dbx.isConnected()) pull().then(() => toast('Abgeglichen', 'ok')).catch(e => toast(e.message, 'bad')); else location.hash = '#/info'; } }, h('i'), h('span'));
const nav = h('nav', { class: 'tabs', 'aria-label': 'Hauptmenü' }, ROUTES.map(([k, l, , d]) => h('a', { href: '#/' + k, dataset: { r: k } }, icon(d), h('span', null, l), k === 'bewerbungen' ? h('span', { class: 'badge', hidden: true, id: 'due-badge' }) : null)));
const brand = h('div', { class: 'brand' }, (() => { const s = icon('M3 17h18|M6 17v-4M10 17v-6M14 17v-4M18 17v-8|M3 8l6-4 4 3 8-4'); return s; })(), 'Jobsuche');
const shell = h('div', { id: 'app' }, h('header', { class: 'topbar' }, brand, h('span', { class: 'spacer' }), syncBtn), nav, main);

function parseHash() {
  const [path, qs] = (location.hash.replace(/^#\/?/, '') || 'stellen').split('?');
  return { route: ROUTES.find(r => r[0] === path) ? path : 'stellen', params: Object.fromEntries(new URLSearchParams(qs || '')) };
}
let current = null;
function route() {
  const { route: r, params } = parseHash();
  current = r;
  const def = ROUTES.find(x => x[0] === r);
  nav.querySelectorAll('a').forEach(a => { if (a.dataset.r === r) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  def[2].render(main, params);
  document.title = def[1] + ' · Jobsuche';
  updateBadge();
}
function updateBadge() {
  const n = list('applications').filter(followUpState).length, b = document.getElementById('due-badge');
  if (b) { b.hidden = !n; b.textContent = n; }
}
function paintSync() {
  const s = S.sync, c = dbx.isConnected();
  syncBtn.className = 'sync ' + (c ? s.state : '');
  syncBtn.lastChild.textContent = !c ? 'Nur auf diesem Gerät' : s.state === 'syncing' ? 'Gleicht ab …' : s.state === 'error' ? 'Abgleich fehlgeschlagen' : s.lastSync ? 'Abgeglichen ' + fmtRel(s.lastSync) : 'Dropbox verbunden';
  syncBtn.title = s.msg || '';
}
const busy = () => document.querySelector('dialog[open]') || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
let prevState = '';
on(kind => {
  if (kind === 'sync') { paintSync(); if (prevState === 'syncing' && S.sync.state === 'ok' && !busy()) route(); prevState = S.sync.state; }
  else if (kind === 'jobs' && !busy()) route();
  else if (kind === 'db') updateBadge();
});
window.addEventListener('hashchange', route);

async function start() {
  document.body.appendChild(shell);
  try { await dbx.handleRedirect(); } catch (e) { toast(e.message, 'bad'); }
  await loadCachedJobs();
  await seedEmployers();
  seedPortals();
  paintSync(); route();
  if (dbx.isConnected()) { try { await pull(); } catch (e) { toast('Abgleich: ' + e.message, 'bad'); } }
  setInterval(paintSync, 60000);
  registerSw();
}

function registerSw() {
  if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
  navigator.serviceWorker.register('sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) {
          const bar = h('div', { class: 'banner', style: 'position:fixed;left:1rem;right:1rem;bottom:80px;z-index:90;margin:0' }, `Neue Version verfügbar. `, h('button', { class: 'btn small primary', type: 'button', onclick: () => { w.postMessage('skip'); } }, 'Jetzt aktualisieren'));
          document.body.appendChild(bar);
        }
      });
    });
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded) { reloaded = true; location.reload(); } });
  }).catch(() => { /* ohne Offline-Funktion weiter */ });
}

start();
console.info('Jobsuche', VERSION);
