// Ovládání stránky. Nic se neukládá ani neodesílá; jediný požadavek je načtení rules.json z tohoto webu.
import {
  pravidlaProRok,
  nejnovejsiPlatnyRok,
  srazka,
  dobaSplaceniExekuce,
  oddluzeni,
} from './dluhy.js';

const OBRAZOVKY = ['uvod', 'formular', 'vysledek', 'kroky'];
const kc = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 0 });
const $ = (id) => document.getElementById(id);

let pravidla = null;
let rokPravidel = null;
let posledniVysledek = false;
let aktualni = 'uvod';

function korun(x) {
  return `${kc.format(Math.round(x))} Kč`;
}

function delkaSlovy(mesicu) {
  const roky = Math.floor(mesicu / 12);
  const m = mesicu % 12;
  const r = roky === 1 ? 'rok' : roky >= 2 && roky <= 4 ? 'roky' : 'let';
  const ms = m === 1 ? 'měsíc' : m >= 2 && m <= 4 ? 'měsíce' : 'měsíců';
  if (roky === 0) return `${m} ${ms}`;
  if (m === 0) return `${roky} ${r}`;
  return `${roky} ${r} a ${m} ${ms}`;
}

function cislo(text) {
  const t = String(text ?? '').replace(/\s| /g, '').replace(/kč$/i, '').replace(',', '.');
  if (t === '') return NaN;
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}

function ukaz(id) {
  if (!OBRAZOVKY.includes(id)) return;
  if (id === 'vysledek' && !posledniVysledek) id = 'formular';
  aktualni = id;
  for (const el of document.querySelectorAll('[data-obrazovka]')) el.hidden = el.id !== id;
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
}

function navigace() {
  const id = location.hash.slice(1) || 'uvod';
  if (id === 'pomoc') {
    const p = $('pomoc');
    p.scrollIntoView({ block: 'start' });
    p.focus({ preventScroll: true });
    return;
  }
  ukaz(OBRAZOVKY.includes(id) ? id : 'uvod');
}

function chyba(id, text) {
  $(`${id}-chyba`).textContent = text;
  $(id).setAttribute('aria-invalid', text ? 'true' : 'false');
  return text ? 1 : 0;
}

function nactiFormular() {
  let chyby = 0;
  const mzda = cislo($('mzda').value);
  chyby += chyba('mzda', Number.isNaN(mzda) ? 'Napište částku v korunách, třeba 23 000.' : '');
  const osoby = cislo($('osoby').value || '0');
  chyby += chyba('osoby', Number.isNaN(osoby) || osoby > 15 || !Number.isInteger(osoby) ? 'Napište celé číslo od 0 do 15.' : '');
  const exekuce = cislo($('exekuce').value || '0');
  chyby += chyba('exekuce', Number.isNaN(exekuce) || !Number.isInteger(exekuce) ? 'Napište celé číslo, třeba 1.' : '');
  const dluh = cislo($('dluh').value);
  chyby += chyba('dluh', Number.isNaN(dluh) ? 'Napište částku v korunách. Stačí odhad.' : '');
  let sazba = 0;
  if ($('urok').checked) {
    sazba = cislo($('sazba').value);
    chyby += chyba('sazba', Number.isNaN(sazba) || sazba > 100 ? 'Napište sazbu v procentech, třeba 11,75.' : '');
  } else {
    chyba('sazba', '');
  }
  const form = $('vstup');
  return {
    chyby,
    vstup: {
      cistaMzda: mzda,
      osoby,
      prednostni: form.elements.druh.value === 'prednostni',
      pocetExekuci: exekuce,
      duchodce: $('duchod').checked,
      dluh,
      sazba,
      drivejsiOdpusteni: form.elements.odpusteni.value,
    },
  };
}

function nastav(id, text) {
  $(id).textContent = text;
}

function zobrazVysledek(v) {
  const s = srazka(pravidla, v);
  const ex = dobaSplaceniExekuce({ dluh: v.dluh, mesicne: s.vericiDostanou, rocniUrokProcent: v.sazba });
  const od = oddluzeni(pravidla, v);

  // Exekuce
  nastav('v-zustane', korun(s.zustane));
  nastav('v-srazka', korun(s.srazka));
  nastav('v-vericum', korun(s.vericiDostanou));
  nastav('v-nahrada', s.nahradaZamestnavateli > 0
    ? `Zaměstnavatel si ze srážky nechá ${korun(s.nahradaZamestnavateli)} za svou práci. Tak to určuje zákon.`
    : '');

  const upozorneni = $('v-upozorneni');
  upozorneni.hidden = true;
  if (s.srazka === 0) {
    nastav('v-doba', 'Vaše výplata je nižší než částka, kterou vám musí nechat. Z výplaty se tedy nestrhává nic. Dluh ale nezmizí.');
  } else if (ex.nesplatitelne && ex.duvod === 'urok-vyssi-nez-splatka') {
    nastav('v-doba', 'Při této srážce dluh nesplatíte.');
    upozorneni.hidden = false;
    upozorneni.textContent = `Úrok je asi ${korun(ex.urokMesicne)} měsíčně. To je víc, než věřitelé dostanou. Dluh poroste rychleji, než ho splácíte. Za rok vzroste asi o ${korun(ex.rustZaRok)}. Poraďte se v poradně, třeba o oddlužení.`;
  } else if (ex.nesplatitelne) {
    nastav('v-doba', 'Splácení by trvalo déle než 50 let.');
  } else {
    nastav('v-doba', `Odhad doby splácení: ${delkaSlovy(ex.mesicu)}.`);
    if (v.sazba > 0) {
      upozorneni.hidden = false;
      upozorneni.textContent = `Na úrocích zaplatíte asi ${korun(ex.uroky)}. Dluh může růst rychleji, než se splácí. Stačí, aby přibyla další exekuce nebo klesla mzda.`;
    }
  }

  const rozpis = $('v-rozpis');
  rozpis.replaceChildren();
  const radky = [
    `Musí vám zůstat aspoň ${korun(s.nezabavitelna)}. Je to takzvaná nezabavitelná částka.`,
    `Zbývá ${korun(s.zbytek)}.`,
    `Část do ${korun(s.hranice)} se zaokrouhlí dolů na ${korun(s.doHranice)} a rozdělí na třetiny po ${korun(s.tretina)}.`,
    s.duvodDvouTretin === 'prednostni'
      ? 'U přednostních dluhů se strhávají dvě třetiny.'
      : s.duvodDvouTretin === 'ctyri-exekuce'
        ? 'Máte aspoň čtyři exekuce. Proto se strhávají dvě třetiny.'
        : 'U běžných dluhů se strhává jedna třetina.',
    s.nadHranici > 0 ? `Částka nad ${korun(s.hranice)} se strhne celá. To je ${korun(s.nadHranici)}.` : null,
  ].filter(Boolean);
  for (const t of radky) {
    const li = document.createElement('li');
    li.textContent = t;
    rozpis.append(li);
  }

  // Oddlužení
  const nelze = $('o-nelze');
  nelze.hidden = od.lzePovolit;
  nelze.textContent = od.lzePovolit ? '' : 'Pokud vám soud odpustil dluhy v posledních 12 letech, nové oddlužení obvykle nepovolí. Výjimky jsou vzácné. Probrat to můžete v poradně.';
  nastav('o-splatka', korun(od.splatka));
  nastav('o-zustane', korun(od.zustane));
  nastav('o-delka', delkaSlovy(od.mesicu));
  nastav('o-spravce', `Z toho ${korun(od.spravce)} měsíčně dostane insolvenční správce. Je to úředník, který na oddlužení dohlíží. Věřitelé dostanou ${korun(od.vericumMesicne)} měsíčně.`);
  if (od.odpusteno > 0) {
    nastav('o-zaplaceno', `Věřitelům za tu dobu zaplatíte asi ${korun(od.zaplacenoVericum)}. To je ${Math.round(od.miraUspokojeni * 100)} % dluhů.`);
    nastav('o-zbytek', `Zbytek asi ${korun(od.odpusteno)} vám soud odpustí. Podmínka je, že budete poctivě plnit povinnosti.`);
  } else {
    nastav('o-zaplaceno', `Dluhy byste splatili celé dřív než za ${delkaSlovy(od.delkaMesicu)}.`);
    nastav('o-zbytek', 'Nic by se neodpouštělo.');
  }
  nastav('o-srovnani', od.splatka > s.srazka
    ? 'V oddlužení se strhává víc než v exekuci. Trvá ale jen omezenou dobu.'
    : '');
  const min = $('o-minimum');
  min.hidden = od.splnujeMinimum;
  min.textContent = od.splnujeMinimum ? '' : `Splátka musí být aspoň ${korun(od.minimum)} měsíčně. Jinak soud oddlužení nepovolí. V poradně zjistíte, jak to řešit. Pomoct může třeba příspěvek od blízkého člověka.`;

  nastav('rok-pravidel', rokPravidel.poznamka);
}

function init(rules) {
  const dnes = new Date().getFullYear();
  const rok = nejnovejsiPlatnyRok(rules, dnes);
  pravidla = pravidlaProRok(rules, rok);
  rokPravidel = {
    rok,
    poznamka: rok < dnes
      ? `Pravidla pro rok ${dnes} zatím nejsou úplná. Počítáme podle roku ${rok}.`
      : `Počítáme podle pravidel pro rok ${rok}.`,
  };

  $('urok').addEventListener('change', () => { $('urok-pole').hidden = !$('urok').checked; });
  $('vstup').addEventListener('submit', (e) => {
    e.preventDefault();
    const { chyby, vstup } = nactiFormular();
    if (chyby) {
      const prvni = document.querySelector('[aria-invalid="true"]');
      prvni?.focus();
      return;
    }
    zobrazVysledek(vstup);
    posledniVysledek = true;
    if (location.hash === '#vysledek') navigace();
    else location.hash = 'vysledek';
    $('vysledek-nadpis').focus({ preventScroll: true });
  });
  window.addEventListener('hashchange', navigace);
  navigace();
}

fetch('./rules.json')
  .then((r) => {
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  })
  .then(init)
  .catch(() => {
    const p = document.createElement('p');
    p.className = 'varovani';
    p.textContent = 'Výpočet se nepodařilo spustit. Zkuste stránku obnovit. Bezplatná pomoc níže funguje i tak.';
    $('obsah').prepend(p);
  });
