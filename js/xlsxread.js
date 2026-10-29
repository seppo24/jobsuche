// Minimaler .xlsx-Leser (nur lesen) auf Basis von JSZip – keine weitere Bibliothek nötig.

const unesc = s => s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

const colIndex = letters => letters.split('').reduce((a, c) => a * 26 + c.charCodeAt(0) - 64, 0) - 1;
const textOf = xml => { let out = ''; for (const m of xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) out += m[1]; return unesc(out); };

/** Liefert das erste Tabellenblatt als Array von Zeilen (Array von Zellwerten: Zahl | Text | Wahrheitswert | null). */
export async function readXlsxRows(JSZip, buf) {
  const zip = await JSZip.loadAsync(buf);
  const read = async p => { const f = zip.file(p); return f ? f.async('string') : ''; };

  // Erstes Blatt über workbook.xml + rels bestimmen
  let sheetPath = 'xl/worksheets/sheet1.xml';
  const wb = await read('xl/workbook.xml');
  const rid = wb.match(/<sheet\b[^>]*\br:id="([^"]+)"/)?.[1];
  if (rid) {
    const rels = await read('xl/_rels/workbook.xml.rels');
    for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
      if (m[0].includes(`Id="${rid}"`)) { const t = m[0].match(/Target="([^"]+)"/)?.[1]; if (t) sheetPath = t.startsWith('/') ? t.slice(1) : 'xl/' + t.replace(/^\.\//, ''); }
    }
  }
  const sstXml = await read('xl/sharedStrings.xml');
  const sst = [...sstXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => textOf(m[1]));

  const sheet = await read(sheetPath);
  if (!sheet) throw new Error('Das Tabellenblatt konnte nicht gelesen werden.');
  const rows = [];
  for (const rm of sheet.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const rowNum = +(rm[0].match(/\br="(\d+)"/)?.[1] || rows.length + 1);
    const arr = [];
    for (const cm of (rm[1] || '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1], body = cm[2] || '';
      const ref = attrs.match(/\br="([A-Z]+)\d+"/);
      if (!ref) continue;
      const t = attrs.match(/\bt="([^"]+)"/)?.[1];
      const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let val = null;
      if (t === 'inlineStr') val = textOf(body);
      else if (v !== undefined) {
        if (t === 's') val = sst[+v] ?? null;
        else if (t === 'str') val = unesc(v);
        else if (t === 'b') val = v === '1';
        else if (t === 'e') val = null;
        else val = Number(v);
      }
      arr[colIndex(ref[1])] = val;
    }
    for (let i = 0; i < arr.length; i++) if (arr[i] === undefined) arr[i] = null;
    rows[rowNum - 1] = arr;
  }
  for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
  return rows;
}
