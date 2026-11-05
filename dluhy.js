// Výpočty srážek ze mzdy při exekuci a splátek v oddlužení.
// Čisté funkce bez přístupu k DOM nebo síti. Parametry přicházejí z rules.json.
// Předpisy: nařízení vlády č. 595/2006 Sb., občanský soudní řád § 276–280,
// insolvenční zákon § 395, § 398, § 412a, vyhláška č. 313/2007 Sb.

/** Zaokrouhlí dolů na celé koruny dělitelné třemi (OSŘ § 279 odst. 1). */
export function floor3(kc) {
  const cele = Math.floor(kc);
  return cele - (cele % 3);
}

/** Vybere parametry pro daný rok. Neúplný rok (např. nevyhlášené nájemné) odmítne. */
export function pravidlaProRok(rules, rok) {
  const r = rules?.roky?.[String(rok)];
  if (!r) throw new Error(`Pravidla pro rok ${rok} nejsou k dispozici.`);
  if (r.status !== 'platné') throw new Error(`Pravidla pro rok ${rok} jsou neúplné: ${r.poznamka ?? ''}`);
  const p = { rok: Number(rok) };
  for (const [klic, polozka] of Object.entries(r)) {
    if (polozka && typeof polozka === 'object' && 'hodnota' in polozka) {
      if (polozka.hodnota === null) throw new Error(`Pravidla pro rok ${rok}: hodnota ${klic} nebyla vyhlášena.`);
      p[klic] = polozka.hodnota;
    }
  }
  return p;
}

/** Nejnovější rok s úplnými pravidly, který nepřesahuje zadaný rok. */
export function nejnovejsiPlatnyRok(rules, dnesniRok) {
  const roky = Object.keys(rules.roky)
    .map(Number)
    .filter((y) => y <= dnesniRok && rules.roky[y].status === 'platné')
    .sort((a, b) => b - a);
  if (roky.length) return roky[0];
  const vse = Object.keys(rules.roky).map(Number).filter((y) => rules.roky[y].status === 'platné');
  return Math.min(...vse);
}

/** Součet životního minima, normativního nájemného a energetického paušálu (celé koruny). */
function zakladniSoucet(p) {
  return p.zivotniMinimum + p.normativniNajemne + p.energetickyPausal;
}

/**
 * Nezabavitelná částka: 85 % součtu na dlužníka + ¼ z toho na každou vyživovanou osobu.
 * Celý součet se zaokrouhlí nahoru (NV 595/2006 § 1 a § 3). Počítá se v celých číslech,
 * aby nevznikla chyba desetinných čísel.
 */
export function nezabavitelnaCastka(p, osoby = 0) {
  const n = Math.max(0, Math.floor(osoby));
  const j = p.jmenovatelNaOsobu; // 4
  const citatel = zakladniSoucet(p) * p.procentoDluznik * (j + n);
  const jmenovatel = 100 * j;
  return Math.ceil(citatel / jmenovatel);
}

/** Hranice, nad kterou se zbytek čisté mzdy srazí celý (NV 595/2006 § 2): 1,9 × součet. */
export function hraniceBezOmezeni(p) {
  return (zakladniSoucet(p) * p.nasobekHraniceDesetiny) / 10;
}

/** Měsíční odměna a výdaje insolvenčního správce včetně daně z přidané hodnoty. */
export function spravceMesicne(p) {
  return Math.round(((p.odmenaSpravceMesicne + p.vydajeSpravceMesicne) * (100 + p.dphProcenta)) / 100);
}

/**
 * Srážka ze mzdy při exekuci.
 * @param {object} p pravidla roku
 * @param {object} v vstup: cistaMzda, osoby, prednostni, pocetExekuci, duchodce
 */
export function srazka(p, v) {
  const cistaMzda = Math.max(0, Math.floor(Number(v.cistaMzda) || 0));
  const nezabavitelna = nezabavitelnaCastka(p, v.osoby ?? 0);
  const zbytek = Math.max(0, cistaMzda - nezabavitelna);
  const hranice = hraniceBezOmezeni(p);

  const doHranice = floor3(Math.min(zbytek, hranice));
  const nadHranici = Math.max(0, Math.floor(zbytek - hranice));
  const tretina = doHranice / 3;

  // Dvě třetiny: přednostní dluhy (§ 279 odst. 1), nebo aspoň 4 exekuce (§ 279 odst. 4),
  // ledaže jde o důchodce a třetina je menší než odměna a výdaje správce s daní (§ 279 odst. 5).
  let duvodDvouTretin = null;
  if (v.prednostni) {
    duvodDvouTretin = 'prednostni';
  } else if ((v.pocetExekuci ?? 0) >= p.minimumExekuciProDveTretiny) {
    const vyjimkaDuchodce = Boolean(v.duchodce) && tretina < spravceMesicne(p);
    if (!vyjimkaDuchodce) duvodDvouTretin = 'ctyri-exekuce';
  }
  const dveTretiny = duvodDvouTretin !== null;
  const zTretin = tretina * (dveTretiny ? 2 : 1);
  const celkem = zTretin + nadHranici;

  // Náhrada zaměstnavateli: 50 Kč, nejvýš třetina sražené částky nahoru (vyhl. 485/2000 § 4d, 4e).
  const nahradaZamestnavateli = celkem > 0 ? Math.min(p.nahradaZamestnavateli, Math.ceil(celkem / 3)) : 0;

  return {
    cistaMzda,
    nezabavitelna,
    zbytek,
    hranice,
    doHranice,
    tretina,
    nadHranici,
    dveTretiny,
    duvodDvouTretin,
    zTretin,
    srazka: celkem,
    zustane: cistaMzda - celkem,
    nahradaZamestnavateli,
    vericiDostanou: celkem - nahradaZamestnavateli,
  };
}

/**
 * Odhad doby splácení v exekuci. Volitelně s ročním úrokem z prodlení.
 * Úrok je jednoduchý (počítá se jen z jistiny). Platba jde nejdřív na úrok, pak na jistinu
 * (občanský zákoník § 1932). Náklady exekuce se nezapočítávají.
 */
export function dobaSplaceniExekuce({ dluh, mesicne, rocniUrokProcent = 0, maxMesicu = 600 }) {
  let jistina = Math.max(0, Number(dluh) || 0);
  const platba = Math.max(0, Number(mesicne) || 0);
  const sazba = Math.max(0, Number(rocniUrokProcent) || 0) / 100 / 12;

  if (jistina === 0) return { nesplatitelne: false, mesicu: 0, zaplacenoCelkem: 0, uroky: 0 };

  const urokPrvniMesic = jistina * sazba;
  if (platba === 0 || platba <= urokPrvniMesic) {
    return {
      nesplatitelne: true,
      duvod: platba === 0 ? 'zadna-srazka' : 'urok-vyssi-nez-splatka',
      urokMesicne: urokPrvniMesic,
      rustZaRok: Math.max(0, (urokPrvniMesic - platba) * 12),
    };
  }

  let dluznyUrok = 0;
  let uroky = 0;
  let zaplaceno = 0;
  for (let m = 1; m <= maxMesicu; m++) {
    const urok = jistina * sazba;
    dluznyUrok += urok;
    uroky += urok;
    let k = platba;
    const naUrok = Math.min(k, dluznyUrok);
    dluznyUrok -= naUrok;
    k -= naUrok;
    const naJistinu = Math.min(k, jistina);
    jistina -= naJistinu;
    zaplaceno += naUrok + naJistinu;
    if (jistina <= 1e-6 && dluznyUrok <= 1e-6) {
      return { nesplatitelne: false, mesicu: m, zaplacenoCelkem: zaplaceno, uroky };
    }
  }
  return { nesplatitelne: true, duvod: 'prilis-dlouho', zbyva: jistina + dluznyUrok, uroky };
}

/**
 * Oddlužení plněním splátkového kalendáře (insolvenční zákon § 398 odst. 3).
 * Splátka se počítá jako srážka pro přednostní pohledávky. Předpokládá sepis návrhu
 * akreditovanou osobou (zdarma) a období po schválení oddlužení.
 * drivejsiOdpusteni: 'ne' | '12az20' (před 12 až 20 lety) | 'do12' (v posledních 12 letech)
 */
export function oddluzeni(p, v) {
  const s = srazka(p, { cistaMzda: v.cistaMzda, osoby: v.osoby, prednostni: true });
  const dluh = Math.max(0, Number(v.dluh) || 0);
  const spravce = spravceMesicne(p);
  const minimum = spravce * p.minimumSplatkyNasobekSpravce;
  const vericumMesicne = Math.max(0, s.srazka - spravce);
  const odpusteni = v.drivejsiOdpusteni ?? 'ne';
  const delka = odpusteni === '12az20' ? p.delkaOpakovanehoOddluzeniMesicu : p.delkaOddluzeniMesicu;

  let mesicu = delka;
  if (vericumMesicne > 0 && dluh > 0) mesicu = Math.min(delka, Math.ceil(dluh / vericumMesicne));
  const zaplacenoVericum = Math.min(dluh, vericumMesicne * delka);

  return {
    splatka: s.srazka,
    zustane: s.zustane,
    nezabavitelna: s.nezabavitelna,
    spravce,
    vericumMesicne,
    delkaMesicu: delka,
    mesicu,
    zaplacenoVericum,
    miraUspokojeni: dluh > 0 ? zaplacenoVericum / dluh : 1,
    odpusteno: dluh - zaplacenoVericum,
    minimum,
    splnujeMinimum: s.srazka >= minimum,
    lzePovolit: odpusteni !== 'do12',
  };
}
