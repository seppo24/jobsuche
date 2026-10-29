// App-Installation (Android/Chrome): Zustand merken und Diagnose liefern.
export const inst = { prompt: null, installed: false };
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); inst.prompt = e; window.dispatchEvent(new Event('jobsuche-install')); });
window.addEventListener('appinstalled', () => { inst.prompt = null; inst.installed = true; window.dispatchEvent(new Event('jobsuche-install')); });

export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

export function browserInfo() {
  const ua = navigator.userAgent;
  if (/FBAN|FBAV|Instagram|Line\/|MicroMessenger|; wv\)|WhatsApp|Telegram|Snapchat/i.test(ua)) return { ok: false, name: 'eingebetteter Browser einer anderen App', hint: 'Öffne die Adresse direkt in Chrome (Adresse kopieren und in Chrome einfügen).' };
  if (/SamsungBrowser/i.test(ua)) return { ok: true, name: 'Samsung Internet', hint: 'Menü (☰) → „Seite hinzufügen zu“ → „Startbildschirm“.' };
  if (/Firefox/i.test(ua)) return { ok: true, name: 'Firefox', hint: 'Menü (⋮) → „Installieren“.' };
  if (/EdgA|Edg\//i.test(ua)) return { ok: true, name: 'Edge', hint: 'Menü (⋯) → „Zum Telefon hinzufügen“.' };
  if (/Chrome\//i.test(ua)) return { ok: true, name: 'Chrome', hint: 'Menü (⋮) → „App installieren“ bzw. „Zum Startbildschirm hinzufügen“.' };
  return { ok: true, name: 'Browser', hint: 'Im Browser-Menü „Zum Startbildschirm hinzufügen“ suchen.' };
}

export async function runInstall() {
  if (!inst.prompt) return 'none';
  inst.prompt.prompt();
  const r = await inst.prompt.userChoice;
  inst.prompt = null;
  return r.outcome;
}
