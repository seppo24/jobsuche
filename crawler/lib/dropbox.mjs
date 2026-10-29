// Minimaler Dropbox-Zugriff für den Crawler (Refresh-Token aus den GitHub-Secrets).
import fs from 'node:fs/promises';
import path from 'node:path';

export function makeStore() {
  const local = process.env.LOCAL_DIR;
  if (local) {
    return {
      mode: 'lokal',
      async read(name) { try { return await fs.readFile(path.join(local, name), 'utf8'); } catch { return null; } },
      async write(name, text) { await fs.mkdir(local, { recursive: true }); await fs.writeFile(path.join(local, name), text); },
    };
  }
  const key = process.env.DROPBOX_APP_KEY, refresh = process.env.DROPBOX_REFRESH_TOKEN;
  if (!key || !refresh) throw new Error('DROPBOX_APP_KEY und DROPBOX_REFRESH_TOKEN fehlen (GitHub: Settings → Secrets and variables → Actions).');
  let access = null, exp = 0;
  const token = async () => {
    if (access && exp > Date.now()) return access;
    const r = await fetch('https://api.dropboxapi.com/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refresh, client_id: key }) });
    const j = await r.json();
    if (!r.ok) throw new Error('Dropbox-Anmeldung fehlgeschlagen: ' + (j.error_description || j.error));
    access = j.access_token; exp = Date.now() + (j.expires_in - 120) * 1000;
    return access;
  };
  const arg = o => JSON.stringify(o).replace(/[\u007f-￿]/g, c => '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4));
  const ROOT = '/Jobsuche/';
  return {
    mode: 'Dropbox',
    async read(name) {
      const r = await fetch('https://content.dropboxapi.com/2/files/download', { method: 'POST', headers: { Authorization: 'Bearer ' + await token(), 'Dropbox-API-Arg': arg({ path: ROOT + name }) } });
      if (r.status === 409) return null;
      if (!r.ok) throw new Error('Dropbox download ' + name + ': ' + r.status);
      return r.text();
    },
    async write(name, text) {
      const r = await fetch('https://content.dropboxapi.com/2/files/upload', { method: 'POST', headers: { Authorization: 'Bearer ' + await token(), 'Content-Type': 'application/octet-stream', 'Dropbox-API-Arg': arg({ path: ROOT + name, mode: 'overwrite', mute: true }) }, body: text });
      if (!r.ok) throw new Error('Dropbox upload ' + name + ': ' + r.status + ' ' + await r.text());
    },
  };
}
