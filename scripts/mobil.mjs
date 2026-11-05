// Kontrola v prohlížeči na mobilu (šířka 360 px): žádný vodorovný posuvník,
// odkaz na pomoc vidět bez posouvání na každé obrazovce, jen požadavky na vlastní web.
// Použití: node scripts/mobil.mjs [adresář pro snímky]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// Playwright je v prostředí nainstalovaný globálně; require ho najde i mimo node_modules projektu.
const { chromium } = createRequire(import.meta.url)('playwright');

const koren = fileURLToPath(new URL('..', import.meta.url));
const snimky = process.argv[2];
const TYPY = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

const server = createServer(async (req, res) => {
  const cesta = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  const soubor = join(koren, cesta === '/' ? 'index.html' : cesta);
  try {
    const data = await readFile(soubor);
    res.writeHead(200, { 'content-type': TYPY[extname(soubor)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const zaklad = `http://127.0.0.1:${server.address().port}/`;

const chyby = [];
const browser = await chromium.launch();
const sirky = [360, 1280];
for (const sirka of sirky) {
  const page = await browser.newPage({ viewport: { width: sirka, height: 740 }, deviceScaleFactor: 1 });
  page.on('console', (m) => { if (m.type() === 'error') chyby.push(`[${sirka}] konzole: ${m.text()}`); });
  page.on('pageerror', (e) => chyby.push(`[${sirka}] chyba stránky: ${e.message}`));
  page.on('request', (r) => { if (!r.url().startsWith(zaklad)) chyby.push(`[${sirka}] cizí požadavek: ${r.url()}`); });

  async function zkontroluj(nazev) {
    await page.waitForTimeout(150);
    const stav = await page.evaluate(() => {
      const vp = { w: window.innerWidth, h: window.innerHeight };
      const sw = document.documentElement.scrollWidth;
      const viditelny = (el) => {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= vp.h && r.left >= 0 && r.right <= vp.w;
      };
      const obr = [...document.querySelectorAll('[data-obrazovka]')].find((e) => !e.hidden);
      return {
        obrazovka: obr?.id,
        scrollWidth: sw,
        lista: viditelny(document.querySelector('.lista .pomoc-odkaz')),
        pruh: viditelny(obr?.querySelector('.pomoc-pruh a')),
      };
    });
    const ok = stav.scrollWidth <= sirka && stav.lista && stav.pruh;
    console.log(`${ok ? 'OK ' : 'CHYBA'} [${sirka}px] ${nazev}: obrazovka=${stav.obrazovka}, šířka obsahu=${stav.scrollWidth}, pomoc v liště=${stav.lista}, pomoc na obrazovce=${stav.pruh}`);
    if (!ok) chyby.push(`[${sirka}] ${nazev}: ${JSON.stringify(stav)}`);
    if (snimky) await page.screenshot({ path: join(snimky, `${sirka}-${nazev}.png`), fullPage: true });
  }

  await page.goto(`${zaklad}#uvod`);
  await zkontroluj('1-uvod');
  await page.click('text=Začít výpočet');
  await zkontroluj('2-formular');

  // Chybné zadání → chybová hláška, žádný výsledek
  await page.click('button[type=submit]');
  const hlaska = await page.textContent('#mzda-chyba');
  if (!hlaska) chyby.push(`[${sirka}] chybí hláška u prázdné mzdy`);

  await page.fill('#mzda', '23 000');
  await page.fill('#dluh', '100 000');
  await page.click('button[type=submit]');
  await page.waitForSelector('#vysledek:not([hidden])');
  await zkontroluj('3-vysledek');
  const srazka = (await page.textContent('#v-srazka')).replace(/\s/g, '');
  if (srazka !== '2966Kč') chyby.push(`[${sirka}] srážka ${srazka}, čekáno 2 966 Kč`);
  const doba = await page.textContent('#v-doba');
  console.log(`      výsledek: srážka ${srazka}, ${doba.trim()}`);

  // Po posunutí dolů zůstane odkaz na pomoc v liště vidět
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(150);
  const listaPoPosunu = await page.evaluate(() => {
    const r = document.querySelector('.lista .pomoc-odkaz').getBoundingClientRect();
    return r.top >= 0 && r.bottom <= window.innerHeight;
  });
  if (!listaPoPosunu) chyby.push(`[${sirka}] lišta s pomocí po posunutí zmizela`);

  // Úrok vyšší než splátka → varování
  await page.click('text=Upravit údaje');
  await page.fill('#dluh', '500 000');
  await page.check('#urok');
  await page.click('button[type=submit]');
  await page.waitForSelector('#v-upozorneni:not([hidden])');
  console.log(`      s úrokem: ${(await page.textContent('#v-upozorneni')).slice(0, 80)}…`);

  await page.click('text=Co dál');
  await zkontroluj('4-kroky');

  await page.click('.lista .pomoc-odkaz');
  await page.waitForTimeout(400);
  const pomocVidet = await page.evaluate(() => {
    const r = document.getElementById('pomoc').getBoundingClientRect();
    return r.top < window.innerHeight && r.bottom > 0;
  });
  if (!pomocVidet) chyby.push(`[${sirka}] klik na Bezplatná pomoc neukázal seznam pomoci`);
  await page.close();
}
await browser.close();
server.close();

if (chyby.length) {
  console.log('\nNalezené problémy:');
  for (const c of chyby) console.log(` - ${c}`);
  process.exit(1);
}
console.log('\nVše v pořádku.');
