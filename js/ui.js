// Gemeinsame Oberflächen-Bausteine.
import { h, clear } from './util.js';

let toastTimer;
export function toast(msg, kind = '') {
  let t = document.getElementById('toast');
  if (!t) { t = h('div', { id: 'toast', role: 'status', 'aria-live': 'polite' }); document.body.appendChild(t); }
  t.className = 'toast show ' + kind;
  t.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), kind === 'bad' ? 6000 : 3200);
}

/** Öffnet ein Fenster („Sheet“). build(close) liefert den Inhalt. */
export function sheet(title, build, { wide = false, onClose } = {}) {
  const dlg = h('dialog', { class: 'sheet' + (wide ? ' wide' : '') });
  const close = () => { if (dlg.open) dlg.close(); };
  const body = h('div', { class: 'sheet-body' });
  const head = h('header', { class: 'sheet-head' }, h('h2', null, title), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Schließen', onclick: close }, '✕'));
  dlg.append(head, body);
  dlg.addEventListener('close', () => { dlg.remove(); onClose && onClose(); });
  dlg.addEventListener('click', e => { if (e.target === dlg) close(); });
  document.body.appendChild(dlg);
  const content = build(close, body);
  if (content) body.appendChild(content);
  dlg.showModal();
  return { close, body, dlg };
}

export function confirmDialog(message, { ok = 'Löschen', danger = true } = {}) {
  return new Promise(res => {
    let done = false;
    const s = sheet('Bitte bestätigen', (close) => h('div', null,
      h('p', null, message),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn', type: 'button', onclick: () => { done = true; res(false); close(); } }, 'Abbrechen'),
        h('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), type: 'button', onclick: () => { done = true; res(true); close(); } }, ok))),
      { onClose: () => { if (!done) res(false); } });
    return s;
  });
}

export const STATUS_LABEL = {
  ok: 'sicher erkannt', unsicher: 'unsicher', leer: 'keine Stellen', fehler: 'Fehler', blockiert: 'blockiert', 'nur-link': 'nur Link', neu: 'noch nicht geprüft',
};
export function statusPill(status, extra = '') {
  const cls = { ok: 'ok', leer: 'info', unsicher: 'warn', fehler: 'bad', blockiert: 'bad', 'nur-link': 'mute', neu: 'mute' }[status] || 'mute';
  return h('span', { class: 'pill ' + cls, title: extra }, h('i', { 'aria-hidden': 'true' }), STATUS_LABEL[status] || status);
}

export const APP_STATUS = {
  geplant: ['geplant', 'mute'], gesendet: ['gesendet', 'info'], rueckmeldung: ['Rückmeldung', 'info'], interview: ['Gespräch', 'ok'], angebot: ['Angebot', 'ok'], absage: ['Absage', 'bad'], zurueckgezogen: ['zurückgezogen', 'mute'],
};
export function appPill(status) {
  const [l, c] = APP_STATUS[status] || [status, 'mute'];
  return h('span', { class: 'pill ' + c }, h('i', { 'aria-hidden': 'true' }), l);
}

export const EVENT_LABEL = { gesendet: 'Bewerbung gesendet', rueckmeldung: 'Rückmeldung', nachfrage: 'Nachgefragt', interview: 'Vorstellungsgespräch', telefonat: 'Telefonat', absage: 'Absage', angebot: 'Angebot', notiz: 'Notiz' };

export function field(label, control, hint) {
  return h('label', { class: 'field' }, h('span', { class: 'lbl' }, label), control, hint ? h('span', { class: 'hint' }, hint) : null);
}
export const input = (o = {}) => h('input', { type: 'text', ...o });
export const textarea = (o = {}) => h('textarea', { rows: 4, ...o });
export function select(options, value, attrs = {}) {
  return h('select', attrs, options.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return h('option', { value: v, selected: v === value }, l); }));
}

export function emptyState(title, text, actions = []) {
  return h('div', { class: 'empty' }, h('h3', null, title), text ? h('p', null, text) : null, actions.length ? h('div', { class: 'btn-row' }, actions) : null);
}

export function mount(el, ...nodes) { clear(el); nodes.flat().forEach(n => n && el.appendChild(n)); }
