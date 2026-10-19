// Lettura dell'export "Lista operazioni" di Intesa Sanpaolo (.xlsx) e unione senza duplicati.
import * as XLSX from 'xlsx';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const norm = (v) => String(v ?? '').trim().toLowerCase();
const testo = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

export function leggiExcel(buffer, nomeFile = '') {
  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const righe = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });

  const h = righe.findIndex((r) => r && norm(r[0]) === 'data' && r.some((c) => norm(c) === 'importo'));
  if (h < 0) throw new Error(`${nomeFile}: non trovo la tabella dei movimenti (manca la riga con "Data" e "Importo").`);

  const intest = righe[h].map(norm);
  const col = (nome) => intest.indexOf(nome);
  const c = {
    data: col('data'), op: col('operazione'), det: col('dettagli'), conto: col('conto o carta'),
    contab: col('contabilizzazione'), cat: col('categoria'), valuta: col('valuta'), importo: col('importo'),
  };

  // Nell'intestazione Intesa elenca i conti/carte selezionati: serve per dare un nome alla carta
  const contiSelezionati = [];
  let inConti = false;
  for (const r of righe.slice(0, h)) {
    if (!r) continue;
    if (norm(r[1]).startsWith('conti e carte')) inConti = true;
    else if (norm(r[1])) inConti = false;
    if (inConti && r[2]) contiSelezionati.push(testo(r[2]));
  }
  const nomeCarta = contiSelezionati.find((x) => /^carta/i.test(x)) || 'Carta';

  const visti = new Map();
  const movimenti = [];
  for (const r of righe.slice(h + 1)) {
    if (!r || r[c.data] == null || r[c.importo] == null) continue;
    const data = inISO(r[c.data]);
    const importo = inNumero(r[c.importo]);
    if (!data || Number.isNaN(importo)) continue;

    const operazione = testo(r[c.op]);
    const dettagli = testo(r[c.det]);
    const contoGrezzo = testo(r[c.conto]);
    const contab = norm(r[c.contab]);

    // Le carte hanno un codice univoco per movimento; il conto corrente no,
    // quindi si usa un'impronta del contenuto (+ numero di ripetizione nello stesso file).
    let id;
    let conto = contoGrezzo;
    if (UUID.test(contoGrezzo)) {
      id = 'u:' + contoGrezzo.toLowerCase();
      conto = nomeCarta;
    } else {
      const base = [data, operazione, dettagli, importo.toFixed(2), contoGrezzo].join('|');
      const n = (visti.get(base) || 0) + 1;
      visti.set(base, n);
      id = 'h:' + impronta(base) + '#' + n;
    }

    movimenti.push({
      id,
      data,
      operazione,
      dettagli,
      conto,
      contabilizzato: !(contab === 'no' || contab === 'non contabilizzato'),
      categoriaBanca: testo(r[c.cat]) || 'Da classificare',
      valuta: testo(r[c.valuta]) || 'EUR',
      importo,
      fonte: nomeFile,
    });
  }
  return { movimenti, conti: contiSelezionati };
}

// Confronta i movimenti letti con quelli già salvati.
// Non salva niente: restituisce cosa fare, così l'utente può vedere l'anteprima.
export function pianificaImport(nuovi, esistenti, eliminati = new Set()) {
  const perId = new Map(esistenti.map((m) => [m.id, m]));
  const inSospeso = esistenti.filter((m) => !m.contabilizzato);
  const daSalvare = [];
  const daEliminare = new Set();
  const conteggio = { nuovi: 0, giaPresenti: 0, aggiornati: 0, eliminati: 0 };
  const oggi = new Date().toISOString();

  for (const n of nuovi) {
    if (eliminati.has(n.id)) { conteggio.eliminati++; continue; }
    const e = perId.get(n.id);
    if (e) {
      if (!e.contabilizzato && n.contabilizzato) {
        daSalvare.push({ ...e, contabilizzato: true, categoriaBanca: n.categoriaBanca });
        conteggio.aggiornati++;
      } else {
        conteggio.giaPresenti++;
      }
      continue;
    }

    // Un movimento "non contabilizzato" può cambiare codice quando viene contabilizzato:
    // in quel caso sostituisce quello vecchio invece di aggiungersi.
    let gemello = null;
    if (n.contabilizzato) {
      gemello = inSospeso.find((x) => !daEliminare.has(x.id) && x.importo === n.importo &&
        x.operazione === n.operazione && Math.abs(giorni(x.data, n.data)) <= 7);
    }
    const nuovo = { ...n, importatoIl: oggi };
    if (gemello) {
      daEliminare.add(gemello.id);
      if (gemello.categoriaManuale) nuovo.categoriaManuale = gemello.categoriaManuale;
      if (gemello.note) nuovo.note = gemello.note;
      conteggio.aggiornati++;
    } else {
      conteggio.nuovi++;
    }
    daSalvare.push(nuovo);
    perId.set(nuovo.id, nuovo);
  }
  return { daSalvare, daEliminare: [...daEliminare], conteggio };
}

function inISO(v) {
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v);
    return d ? `${d.y}-${pad(d.m)}-${pad(d.d)}` : null;
  }
  if (v instanceof Date) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  const m = String(v).trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  return m ? `${m[3]}-${pad(m[2])}-${pad(m[1])}` : null;
}

function inNumero(v) {
  if (typeof v === 'number') return Math.round(v * 100) / 100;
  const s = String(v).replace(/[€\s]/g, '').replace(/\./g, '').replace(',', '.');
  return Math.round(parseFloat(s) * 100) / 100;
}

const pad = (n) => String(n).padStart(2, '0');
const giorni = (a, b) => (new Date(a) - new Date(b)) / 86400000;

// Hash semplice e stabile (FNV-1a a 53 bit)
function impronta(s) {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619);
    h2 = Math.imul(h2 ^ c, 2246822519);
  }
  return ((h2 >>> 0).toString(36) + (h1 >>> 0).toString(36));
}
