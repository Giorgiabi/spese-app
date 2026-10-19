const fmtEur = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', useGrouping: 'always' });
const fmtEur0 = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0, useGrouping: 'always' });

export const eur = (n) => fmtEur.format(n || 0);
export const eur0 = (n) => fmtEur0.format(Math.round(n || 0));
export const perc = (n) => (Number.isFinite(n) ? Math.round(n) + '%' : '—');

const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
export const MESI_BREVI = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
export const nomeMese = (ym) => `${MESI[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}`;
export const dataBreve = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function avviso(testo) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = testo;
  document.body.append(t);
  setTimeout(() => t.remove(), 3000);
}

const indiceMese = (s) => +s.slice(0, 4) * 12 + +s.slice(5, 7) - 1;

// Movimenti che "pesano" su un periodo ("AAAA-MM" o "AAAA").
// Competenza: le categorie in ripartizione.anno valgono 1/12 in ogni mese del loro anno;
//             quelle in ripartizione.mesi valgono 1/N per N mesi dal mese del pagamento.
// Cassa: ogni movimento conta solo nel giorno in cui è uscito dal conto.
export function movimentiDelPeriodo(movimenti, periodo, ripartizione = { anno: [], mesi: {} }, cassa = false) {
  const sullAnno = cassa ? new Set() : new Set(ripartizione.anno);
  const suMesi = cassa ? {} : ripartizione.mesi;
  const anno = periodo.slice(0, 4);
  const mensile = periodo.length === 7;
  const da = mensile ? indiceMese(periodo) : +anno * 12;
  const a = mensile ? da : da + 11;
  const out = [];
  for (const m of movimenti) {
    const n = suMesi[m.cat];
    if (n > 1) {
      const inizio = indiceMese(m.data);
      const mesiDentro = Math.min(a, inizio + n - 1) - Math.max(da, inizio) + 1;
      if (mesiDentro > 0) out.push({ ...m, importo: (m.importo * mesiDentro) / n, ripartito: true });
    } else if (sullAnno.has(m.cat)) {
      if (!m.data.startsWith(anno)) continue;
      out.push(mensile ? { ...m, importo: m.importo / 12, ripartito: true } : m);
    } else if (m.data.startsWith(periodo)) {
      out.push(m);
    }
  }
  return out;
}

// Elenco leggibile delle categorie spalmate, per le note in pagina
export function descriviRipartizione(r) {
  return [
    ...r.anno.map((c) => `${c} (sull'anno)`),
    ...Object.entries(r.mesi).filter(([, n]) => n > 1).map(([c, n]) => `${c} (${n % 12 ? `${n} mesi` : `${n / 12} anni`})`),
  ].join(', ');
}

// Totali di un insieme di movimenti, divisi per macro e per categoria
export function totali(lista) {
  const r = { entrate: 0, necessita: 0, desideri: 0, crescita: 0, risparmio: 0, perCategoria: {} };
  for (const m of lista) {
    if (m.macro === 'escluso' || m.coperto) continue;
    if (m.macro === 'entrate') { r.entrate += m.importo; continue; }
    const spesa = -m.importo; // un rimborso (importo positivo) riduce la spesa
    r[m.macro] += spesa;
    if (m.macro !== 'risparmio') {
      const c = r.perCategoria[m.cat] || (r.perCategoria[m.cat] = { totale: 0, macro: m.macro });
      c.totale += spesa;
    }
  }
  r.uscite = r.necessita + r.desideri + r.crescita;
  r.risparmiato = r.entrate - r.uscite;
  return r;
}
