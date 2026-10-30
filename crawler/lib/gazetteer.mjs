// Ortsverzeichnis (GeoNames: alle deutschen Postleitzahlen mit Ort und Koordinaten). Wird beim Abruf geladen; ohne Netz geht der Abruf ohne weiter.
import zlib from 'node:zlib';

const nrm = x => String(x || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, ' ').trim();
export const normName = nrm;

/** Erste .txt-Datei (außer readme) aus einer ZIP-Datei lesen – ohne externe Programme. */
export function unzipTxt(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 70000); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('ZIP-Ende nicht gefunden');
  let p = buf.readUInt32LE(eocd + 16); const n = buf.readUInt16LE(eocd + 10);
  for (let k = 0; k < n; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), comLen = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + comLen;
    if (!/\.txt$/i.test(name) || /readme/i.test(name)) continue;
    const ln = buf.readUInt16LE(off + 26), le = buf.readUInt16LE(off + 28), data = buf.subarray(off + 30 + ln + le, off + 30 + ln + le + csize);
    return (method === 0 ? data : zlib.inflateRawSync(data)).toString('utf8');
  }
  throw new Error('Keine Textdatei in der ZIP-Datei');
}

/** GeoNames-Tabelle (TAB-getrennt) → { byPlz, byName }. */
export function parseGazetteer(text) {
  const byPlz = new Map(), byName = new Map();
  for (const line of String(text).split('\n')) {
    const c = line.split('\t'); if (c.length < 11) continue;
    const lat = parseFloat(c[9]), lon = parseFloat(c[10]); if (!isFinite(lat) || !isFinite(lon)) continue;
    if (c[1] && !byPlz.has(c[1])) byPlz.set(c[1], [lat, lon, c[2]]);
    const key = nrm(c[2]); if (key.length < 3) continue;
    const arr = byName.get(key) || []; arr.push([lat, lon]); byName.set(key, arr);
  }
  return { byPlz, byName };
}

export async function loadGazetteer(url = 'https://download.geonames.org/export/zip/DE.zip') {
  const r = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return parseGazetteer(unzipTxt(Buffer.from(await r.arrayBuffer())));
}
