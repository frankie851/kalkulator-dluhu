import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  pravidlaProRok,
  nezabavitelnaCastka,
  hraniceBezOmezeni,
  srazka,
  dobaSplaceniExekuce,
  oddluzeni,
  floor3,
} from '../dluhy.js';

const rules = JSON.parse(readFileSync(new URL('../rules.json', import.meta.url), 'utf8'));
const p = pravidlaProRok(rules, 2026);

test('povinné případy ze zadání (rok 2026)', async (t) => {
  await t.test('23 000 Kč, bez vyživovaných osob, běžný dluh → srážka 2 966 Kč', () => {
    const r = srazka(p, { cistaMzda: 23000, osoby: 0, prednostni: false, pocetExekuci: 1 });
    assert.equal(r.srazka, 2966);
    assert.equal(r.zustane, 23000 - 2966);
  });

  await t.test('50 000 Kč, bez vyživovaných osob, přednostní dluh → 25 391 Kč', () => {
    const r = srazka(p, { cistaMzda: 50000, osoby: 0, prednostni: true, pocetExekuci: 1 });
    assert.equal(r.srazka, 25391);
  });

  await t.test('50 000 Kč, běžný dluh → 10 507 + 4 377 = 14 884 Kč', () => {
    const r = srazka(p, { cistaMzda: 50000, osoby: 0, prednostni: false, pocetExekuci: 1 });
    assert.equal(r.zTretin, 10507);
    assert.equal(r.nadHranici, 4377);
    assert.equal(r.srazka, 14884);
  });

  await t.test('2 vyživované osoby → nezabavitelná částka 21 153 Kč', () => {
    assert.equal(nezabavitelnaCastka(p, 2), 21153);
  });

  await t.test('čistá mzda nižší než nezabavitelná částka → srážka 0', () => {
    const r = srazka(p, { cistaMzda: 12000, osoby: 0, prednostni: true, pocetExekuci: 5 });
    assert.equal(r.srazka, 0);
    assert.equal(r.zustane, 12000);
    assert.equal(r.vericiDostanou, 0);
    assert.equal(r.nahradaZamestnavateli, 0);
  });
});

test('parametry 2026', () => {
  assert.equal(nezabavitelnaCastka(p, 0), 14102);
  assert.equal(nezabavitelnaCastka(p, 1), 17627); // 14 101,50 + 3 525,375 = 17 626,875 → nahoru
  assert.equal(hraniceBezOmezeni(p), 31521);
});

test('zaokrouhluje se celý součet, ne každá část zvlášť', () => {
  // 3 osoby: 14 101,50 × 7/4 = 24 677,625 → 24 678 (po částech by vyšlo 14 102 + 3 × 3 526 = 24 680)
  assert.equal(nezabavitelnaCastka(p, 3), 24678);
});

test('zbytek do hranice se zaokrouhlí dolů na číslo dělitelné třemi', () => {
  assert.equal(floor3(8900), 8898);
  assert.equal(floor3(8898), 8898);
  // 23 002 − 14 102 = 8 900 → 8 898 → 2 966
  const r = srazka(p, { cistaMzda: 23002, osoby: 0, prednostni: false, pocetExekuci: 1 });
  assert.equal(r.doHranice, 8898);
  assert.equal(r.srazka, 2966);
});

test('čistá mzda s haléři se počítá v celých korunách', () => {
  const r = srazka(p, { cistaMzda: 23000.7, osoby: 0, prednostni: false, pocetExekuci: 1 });
  assert.equal(r.srazka, 2966);
});

test('4 a více exekucí: srážejí se dvě třetiny i u běžných dluhů', () => {
  const tri = srazka(p, { cistaMzda: 23000, osoby: 0, prednostni: false, pocetExekuci: 3 });
  const ctyri = srazka(p, { cistaMzda: 23000, osoby: 0, prednostni: false, pocetExekuci: 4 });
  assert.equal(tri.srazka, 2966);
  assert.equal(ctyri.srazka, 5932);
  assert.equal(ctyri.dveTretiny, true);
  assert.equal(ctyri.duvodDvouTretin, 'ctyri-exekuce');
});

test('výjimka pro důchodce: při 4+ exekucích jen třetina, je-li menší než správce s daní (1 089 Kč)', () => {
  // zbytek 2 400 → třetina 800 < 1 089 → zůstává jedna třetina
  const malo = srazka(p, { cistaMzda: 16502, osoby: 0, prednostni: false, pocetExekuci: 4, duchodce: true });
  assert.equal(malo.doHranice, 2400);
  assert.equal(malo.srazka, 800);
  assert.equal(malo.dveTretiny, false);
  // třetina 2 966 ≥ 1 089 → výjimka neplatí
  const hodne = srazka(p, { cistaMzda: 23000, osoby: 0, prednostni: false, pocetExekuci: 4, duchodce: true });
  assert.equal(hodne.srazka, 5932);
});

test('náhrada zaměstnavateli 50 Kč se bere ze srážky (nejvýš třetina, nahoru)', () => {
  const r = srazka(p, { cistaMzda: 23000, osoby: 0, prednostni: false, pocetExekuci: 1 });
  assert.equal(r.nahradaZamestnavateli, 50);
  assert.equal(r.vericiDostanou, 2916);
  // srážka 100 Kč → náhrada nejvýš 34 Kč
  const m = srazka(p, { cistaMzda: 14402, osoby: 0, prednostni: false, pocetExekuci: 1 });
  assert.equal(m.srazka, 100);
  assert.equal(m.nahradaZamestnavateli, 34);
  assert.equal(m.vericiDostanou, 66);
});

test('doba splácení v exekuci bez úroku', () => {
  const d = dobaSplaceniExekuce({ dluh: 100000, mesicne: 2916 });
  assert.equal(d.nesplatitelne, false);
  assert.equal(d.mesicu, 35); // 34 × 2 916 = 99 144, zbývá 856 v 35. měsíci
  assert.equal(d.zaplacenoCelkem, 100000);
});

test('doba splácení s úrokem z prodlení je delší a úrok se platí jako první', () => {
  const bez = dobaSplaceniExekuce({ dluh: 100000, mesicne: 2916 });
  const s = dobaSplaceniExekuce({ dluh: 100000, mesicne: 2916, rocniUrokProcent: 11.75 });
  assert.equal(s.nesplatitelne, false);
  assert.ok(s.mesicu > bez.mesicu);
  assert.ok(s.uroky > 0);
  assert.equal(Math.round(s.zaplacenoCelkem), Math.round(100000 + s.uroky));
});

test('když úrok převýší splátku, dluh se nesplatí a roste', () => {
  // 500 000 Kč × 11,75 % / 12 = 4 896 Kč úroku měsíčně > 2 916 Kč
  const d = dobaSplaceniExekuce({ dluh: 500000, mesicne: 2916, rocniUrokProcent: 11.75 });
  assert.equal(d.nesplatitelne, true);
  assert.ok(d.rustZaRok > 0);
});

test('nulová splátka v exekuci: dluh se nesplácí', () => {
  const d = dobaSplaceniExekuce({ dluh: 50000, mesicne: 0 });
  assert.equal(d.nesplatitelne, true);
});

test('oddlužení: splátka jako u přednostních dluhů, správce 1 089 Kč, 36 měsíců', () => {
  const o = oddluzeni(p, { cistaMzda: 30000, osoby: 0, dluh: 400000 });
  // zbytek 15 898 → 15 897 → dvě třetiny 10 598
  assert.equal(o.splatka, 10598);
  assert.equal(o.spravce, 1089);
  assert.equal(o.vericumMesicne, 9509);
  assert.equal(o.mesicu, 36);
  assert.equal(o.zaplacenoVericum, 9509 * 36);
  assert.equal(o.odpusteno, 400000 - 9509 * 36);
  assert.equal(o.splnujeMinimum, true);
  assert.equal(o.zustane, 30000 - 10598);
});

test('oddlužení: opakované po 12 až 20 letech trvá 60 měsíců, do 12 let ho soud zamítne', () => {
  const o = oddluzeni(p, { cistaMzda: 30000, osoby: 0, dluh: 1000000, drivejsiOdpusteni: '12az20' });
  assert.equal(o.delkaMesicu, 60);
  assert.equal(o.mesicu, 60);
  assert.equal(o.zaplacenoVericum, 9509 * 60);
  const z = oddluzeni(p, { cistaMzda: 30000, osoby: 0, dluh: 400000, drivejsiOdpusteni: 'do12' });
  assert.equal(z.lzePovolit, false);
});

test('oddlužení: minimální splátka 2 178 Kč', () => {
  assert.equal(oddluzeni(p, { cistaMzda: 17370, osoby: 0, dluh: 300000 }).splatka, 2178);
  assert.equal(oddluzeni(p, { cistaMzda: 17370, osoby: 0, dluh: 300000 }).splnujeMinimum, true);
  const nizka = oddluzeni(p, { cistaMzda: 17000, osoby: 0, dluh: 300000 });
  assert.equal(nizka.minimum, 2178);
  assert.equal(nizka.splnujeMinimum, false);
});

test('oddlužení: malý dluh se splatí dřív a nic se neodpouští', () => {
  const o = oddluzeni(p, { cistaMzda: 50000, osoby: 0, dluh: 100000 });
  assert.ok(o.mesicu < 36);
  assert.equal(o.zaplacenoVericum, 100000);
  assert.equal(o.odpusteno, 0);
});

test('rok 2027 je neúplný a nelze podle něj počítat', () => {
  assert.throws(() => pravidlaProRok(rules, 2027), /neúplné|nevyhlášen/i);
});
