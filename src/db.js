// Database locale nel browser (IndexedDB): i dati restano solo su questo dispositivo.
import { openDB } from 'idb';
import { CATEGORIE_DEFAULT, RIPARTITE_DEFAULT, RIPARTITE_MESI_DEFAULT, REGOLE_INIZIALI, CONTO_RIEPILOGO, categoriaDi } from './categorie.js';

const ARCHIVI = ['movimenti', 'regole', 'impostazioni', 'strumenti'];
// Impostazioni che riguardano solo questo dispositivo: non vanno nel backup e sopravvivono al ripristino
const SOLO_DISPOSITIVO = ['fileBackup', 'ultimoBackup'];

const dbp = openDB('spese-mensili', 2, {
  upgrade(db, versionePrecedente) {
    if (versionePrecedente < 1) {
      db.createObjectStore('movimenti', { keyPath: 'id' });
      db.createObjectStore('regole', { keyPath: 'id', autoIncrement: true });
      db.createObjectStore('impostazioni');
    }
    if (versionePrecedente < 2) {
      db.createObjectStore('strumenti', { keyPath: 'id', autoIncrement: true });
    }
  },
});

export const db = {
  async movimenti() { return (await dbp).getAll('movimenti'); },
  async salvaMovimento(m) { return (await dbp).put('movimenti', pulisci(m)); },
  // L'id resta in elenco, così reimportando lo stesso file il movimento non ricompare
  async eliminaMovimento(id) {
    const eliminati = new Set((await db.leggi('eliminati')) || []);
    eliminati.add(id);
    await db.scrivi('eliminati', [...eliminati]);
    return (await dbp).delete('movimenti', id);
  },
  async eliminati() { return new Set((await db.leggi('eliminati')) || []); },
  async applicaImport({ daSalvare, daEliminare }) {
    const tx = (await dbp).transaction('movimenti', 'readwrite');
    await Promise.all([
      ...daEliminare.map((id) => tx.store.delete(id)),
      ...daSalvare.map((m) => tx.store.put(pulisci(m))),
      tx.done,
    ]);
  },

  async regole() { return (await dbp).getAll('regole'); },
  async salvaRegola(r) { return (await dbp).put('regole', r); },
  async eliminaRegola(id) { return (await dbp).delete('regole', id); },

  async strumenti() { return (await dbp).getAll('strumenti'); },
  async salvaStrumento(s) { return (await dbp).put('strumenti', s); },
  async eliminaStrumento(id) { return (await dbp).delete('strumenti', id); },

  async leggi(chiave) { return (await dbp).get('impostazioni', chiave); },
  async scrivi(chiave, valore) { return (await dbp).put('impostazioni', valore, chiave); },

  async esporta() {
    const d = await dbp;
    const impostazioni = {};
    for (const k of await d.getAllKeys('impostazioni')) {
      if (!SOLO_DISPOSITIVO.includes(k)) impostazioni[k] = await d.get('impostazioni', k);
    }
    return {
      app: 'spese-mensili',
      versione: 2,
      esportatoIl: new Date().toISOString(),
      movimenti: await d.getAll('movimenti'),
      regole: await d.getAll('regole'),
      strumenti: await d.getAll('strumenti'),
      impostazioni,
    };
  },
  async ripristina(backup) {
    if (backup?.app !== 'spese-mensili') throw new Error('Questo file non è un backup dell\'app.');
    const tx = (await dbp).transaction(ARCHIVI, 'readwrite');
    const locali = await Promise.all(SOLO_DISPOSITIVO.map((k) => tx.objectStore('impostazioni').get(k)));
    await Promise.all(ARCHIVI.map((s) => tx.objectStore(s).clear()));
    SOLO_DISPOSITIVO.forEach((k, i) => locali[i] !== undefined && tx.objectStore('impostazioni').put(locali[i], k));
    for (const m of backup.movimenti || []) tx.objectStore('movimenti').put(m);
    for (const r of backup.regole || []) tx.objectStore('regole').put(r);
    for (const s of backup.strumenti || []) tx.objectStore('strumenti').put(s);
    for (const [k, v] of Object.entries(backup.impostazioni || {})) {
      if (!SOLO_DISPOSITIVO.includes(k)) tx.objectStore('impostazioni').put(v, k);
    }
    await tx.done;
  },
  async cancellaTutto() {
    const tx = (await dbp).transaction(ARCHIVI, 'readwrite');
    await Promise.all(ARCHIVI.map((s) => tx.objectStore(s).clear()));
    // dopo una cancellazione non si ricreano le regole iniziali
    tx.objectStore('impostazioni').put(Math.max(...REGOLE_INIZIALI.map((r) => r.v)), 'regoleIniziali');
    await tx.done;
  },
};

// Toglie i campi calcolati prima di salvare
function pulisci(m) {
  const { cat, macro, coperto, ...resto } = m;
  return resto;
}

// Aggiunge solo le regole iniziali più recenti di quelle già salvate
async function regoleIniziali() {
  const salvata = await db.leggi('regoleIniziali');
  const versione = salvata === true ? 1 : salvata || 0;
  const nuove = REGOLE_INIZIALI.filter((r) => r.v > versione);
  if (!nuove.length) return;
  for (const { v, ...r } of nuove) await db.salvaRegola(r);
  await db.scrivi('regoleIniziali', Math.max(...nuove.map((r) => r.v)));
}

// Carica tutto e calcola categoria e macro effettive di ogni movimento
export async function caricaTutto() {
  await regoleIniziali();
  const [movimenti, regole, mappa, ripartite, ripartiteMesi] = await Promise.all([
    db.movimenti(), db.regole(), db.leggi('categorie'), db.leggi('ripartite'), db.leggi('ripartiteMesi'),
  ]);
  const categorie = { ...CATEGORIE_DEFAULT, ...(mappa || {}) };
  // Nei mesi che hanno un riepilogo del vecchio Excel contano solo le righe di riepilogo:
  // gli altri movimenti di quel mese restano visibili ma non entrano nei totali.
  const mesiRiepilogo = new Set(movimenti.filter((m) => m.conto === CONTO_RIEPILOGO).map((m) => m.data.slice(0, 7)));
  for (const m of movimenti) {
    m.cat = categoriaDi(m, regole);
    m.macro = categorie[m.cat] ?? 'desideri';
    m.coperto = m.conto !== CONTO_RIEPILOGO && mesiRiepilogo.has(m.data.slice(0, 7));
  }
  movimenti.sort((a, b) => b.data.localeCompare(a.data));
  return {
    movimenti, regole, categorie,
    // ripartizione.anno: spalmate sull'anno solare · ripartizione.mesi: { categoria: numero di mesi }
    ripartizione: { anno: ripartite ?? RIPARTITE_DEFAULT, mesi: ripartiteMesi ?? RIPARTITE_MESI_DEFAULT },
  };
}
