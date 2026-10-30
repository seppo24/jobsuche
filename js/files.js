// Dokumente in der Dropbox (/Jobsuche/Dokumente/<Kategorie>/<Datei>).
import { uid, safeName, nowIso } from './util.js';
import * as dbx from './dropbox.js';
import { put, del, get } from './store.js';

export const CATEGORIES = [['lebenslauf', 'Lebenslauf'], ['anschreiben', 'Anschreiben'], ['arbeitszeugnisse', 'Arbeitszeugnisse'], ['abschlusszeugnis', 'Abschlusszeugnis (Master)'], ['zeugnisse', 'Schul- und Studienzeugnisse'], ['zertifikate', 'Zertifikate'], ['bewerbungen', 'Fertige Bewerbungen'], ['sonstiges', 'Sonstiges']];
export const catLabel = k => (CATEGORIES.find(c => c[0] === k) || [0, k])[1];

export async function uploadDocument(file, category, { name, note, employer, year } = {}) {
  if (!dbx.isConnected()) throw new Error('Bitte zuerst Dropbox verbinden (Info → Einstellungen).');
  const fname = safeName(name || file.name);
  const dir = `${dbx.ROOT}/Dokumente/${category}`;
  await dbx.ensureFolder(dbx.ROOT); await dbx.ensureFolder(dbx.ROOT + '/Dokumente'); await dbx.ensureFolder(dir);
  const res = await dbx.upload(`${dir}/${fname}`, file);
  return put('documents', { id: uid('doc'), name: res.name || fname, category, path: res.path_display || `${dir}/${fname}`, size: file.size, mime: file.type || '', note: note || '', employer: employer || undefined, year: year || undefined, uploadedAt: nowIso() });
}
export async function openDocument(doc) {
  const url = await dbx.tempLink(doc.path);
  window.open(url, '_blank', 'noopener');
}
export async function downloadDocumentBlob(doc) { const r = await dbx.download(doc.path, 'blob'); if (!r) throw new Error('Datei nicht mehr in der Dropbox gefunden.'); return r.data; }
export async function deleteDocument(doc) {
  try { if (dbx.isConnected()) await dbx.remove(doc.path); } catch (e) { if (!/not_found/.test(e.message)) throw e; }
  del('documents', doc.id);
}
export const MASTER = [['cv', 'Lebenslauf (Stammfassung)'], ['letter', 'Anschreiben-Vorlage'], ['motivation', 'Motivationsschreiben-Vorlage']];
export const getMaster = k => get('texts', k)?.text || '';
export const setMaster = (k, text) => put('texts', { id: k, kind: k, text });
