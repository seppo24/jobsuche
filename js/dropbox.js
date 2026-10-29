// Dropbox-Anbindung (OAuth2 mit PKCE direkt im Browser, kein Server nötig).
import { lsGet, lsSet, lsDel } from './util.js';

const KEY = 'jobsuche.dbx';
export const ROOT = '/Jobsuche';

export function redirectUri() {
  return location.origin + location.pathname.replace(/index\.html$/, '');
}

const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function randStr(n = 64) {
  const a = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(a, b => 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~'[b % 66]).join('');
}
const argHeader = o => JSON.stringify(o).replace(/[\u007f-￿]/g, c => '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4));

export const cfg = () => lsGet(KEY, {});
const saveCfg = c => lsSet(KEY, c);
export const isConnected = () => !!cfg().refreshToken;
export const appKey = () => cfg().appKey || '';
export function setAppKey(k) { saveCfg({ ...cfg(), appKey: k.trim() }); }
export function disconnect() { const c = cfg(); lsDel(KEY); if (c.appKey) saveCfg({ appKey: c.appKey }); }
export const refreshToken = () => cfg().refreshToken || '';

export async function startAuth(key) {
  key = (key || appKey()).trim();
  if (!key) throw new Error('Bitte zuerst den Dropbox App-Key eintragen.');
  setAppKey(key);
  const verifier = randStr(80);
  const state = randStr(16);
  sessionStorage.setItem('jobsuche.pkce', JSON.stringify({ verifier, state }));
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const u = new URL('https://www.dropbox.com/oauth2/authorize');
  u.search = new URLSearchParams({
    client_id: key, response_type: 'code', code_challenge: challenge, code_challenge_method: 'S256',
    token_access_type: 'offline', redirect_uri: redirectUri(), state,
  });
  location.href = u.toString();
}

/** Beim Start aufrufen: schließt die Anmeldung ab, falls Dropbox zurückgeleitet hat. */
export async function handleRedirect() {
  const p = new URLSearchParams(location.search);
  if (!p.get('code') && !p.get('error')) return null;
  const clean = () => history.replaceState({}, '', location.pathname + location.hash);
  if (p.get('error')) { const m = p.get('error_description') || p.get('error'); clean(); throw new Error('Dropbox-Anmeldung abgebrochen: ' + m); }
  const saved = JSON.parse(sessionStorage.getItem('jobsuche.pkce') || '{}');
  const code = p.get('code');
  if (!saved.verifier || saved.state !== p.get('state')) { clean(); throw new Error('Anmeldung konnte nicht zugeordnet werden. Bitte erneut verbinden.'); }
  const r = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, grant_type: 'authorization_code', client_id: appKey(), code_verifier: saved.verifier, redirect_uri: redirectUri() }),
  });
  clean(); sessionStorage.removeItem('jobsuche.pkce');
  const j = await r.json();
  if (!r.ok) throw new Error('Dropbox: ' + (j.error_description || j.error || r.status));
  saveCfg({ ...cfg(), accessToken: j.access_token, refreshToken: j.refresh_token, expiresAt: Date.now() + (j.expires_in - 120) * 1000 });
  return true;
}

async function token() {
  const c = cfg();
  if (!c.refreshToken) throw new Error('Dropbox ist nicht verbunden.');
  if (c.accessToken && c.expiresAt > Date.now()) return c.accessToken;
  const r = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: c.refreshToken, client_id: c.appKey }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error('Dropbox-Anmeldung abgelaufen: ' + (j.error_description || j.error));
  saveCfg({ ...c, accessToken: j.access_token, expiresAt: Date.now() + (j.expires_in - 120) * 1000 });
  return j.access_token;
}

export class DbxError extends Error {
  constructor(msg, status, summary) { super(msg); this.status = status; this.summary = summary || ''; }
  get notFound() { return /not_found/.test(this.summary); }
  get conflict() { return /conflict/.test(this.summary); }
}

async function rpc(endpoint, body) {
  const r = await fetch('https://api.dropboxapi.com/2/' + endpoint, {
    method: 'POST', headers: { Authorization: 'Bearer ' + await token(), 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!r.ok) { let s = ''; try { s = (await r.json()).error_summary || ''; } catch { /* leer */ } throw new DbxError(`Dropbox ${endpoint}: ${s || r.status}`, r.status, s); }
  return r.json();
}

export const metadata = path => rpc('files/get_metadata', { path });
export const remove = path => rpc('files/delete_v2', { path });
export async function tempLink(path) { return (await rpc('files/get_temporary_link', { path })).link; }
export const ensureFolder = async path => { try { await rpc('files/create_folder_v2', { path }); } catch (e) { if (!e.conflict) throw e; } };

/** Datei lesen. as: 'text' | 'blob'. Gibt null zurück, wenn sie nicht existiert. */
export async function download(path, as = 'text') {
  const r = await fetch('https://content.dropboxapi.com/2/files/download', {
    method: 'POST', headers: { Authorization: 'Bearer ' + await token(), 'Dropbox-API-Arg': argHeader({ path }) },
  });
  if (r.status === 409) { const s = await r.text(); if (/not_found/.test(s)) return null; throw new DbxError('Dropbox download: ' + s, 409, s); }
  if (!r.ok) throw new DbxError('Dropbox download: ' + r.status, r.status);
  const meta = JSON.parse(r.headers.get('dropbox-api-result') || '{}');
  return { data: as === 'blob' ? await r.blob() : await r.text(), rev: meta.rev, size: meta.size, modified: meta.server_modified };
}

/** Datei schreiben. opts.rev: nur überschreiben, wenn die Version noch dieser entspricht (Konflikterkennung). */
export async function upload(path, content, opts = {}) {
  const mode = opts.rev ? { '.tag': 'update', update: opts.rev } : 'overwrite';
  const r = await fetch('https://content.dropboxapi.com/2/files/upload', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + await token(), 'Content-Type': 'application/octet-stream', 'Dropbox-API-Arg': argHeader({ path, mode, autorename: false, mute: true }) },
    body: content,
  });
  if (!r.ok) { let s = ''; try { s = (await r.json()).error_summary || ''; } catch { /* leer */ } throw new DbxError(`Dropbox upload: ${s || r.status}`, r.status, s); }
  return r.json();
}
