// Macro categorie: servono per la regola 50/30/20.
export const MACRO = {
  necessita: { nome: 'Necessità', colore: '#2a78d6' },
  desideri: { nome: 'Desideri / extra', colore: '#eda100' },
  crescita: { nome: 'Crescita personale', colore: '#1baf7a' },
  risparmio: { nome: 'Risparmio e investimenti', colore: '#6250d6' },
  entrate: { nome: 'Entrate', colore: '#0b8a4a' },
  escluso: { nome: 'Escluso (giroconti)', colore: '#898781' },
};

// Obiettivi sulle entrate del mese
export const OBIETTIVI = { necessita: 50, desideri: 30, risparmio: 20 };

// Categorie di Intesa Sanpaolo -> macro predefinita (modificabile da Impostazioni)
export const CATEGORIE_DEFAULT = {
  'Generi alimentari e supermercato': 'necessita',
  'Farmacia': 'necessita',
  'Spese mediche': 'necessita',
  'Cliniche': 'necessita',
  'Salute e benessere varie': 'necessita',
  'Cellulare': 'necessita',
  'TV, Internet, telefono': 'necessita',
  'Domiciliazioni e Utenze': 'necessita',
  'Trasporti, noleggi, taxi e parcheggi': 'necessita',
  'Carburanti': 'necessita',
  'Manutenzione veicoli': 'necessita',
  'Pedaggi e Telepass': 'necessita',
  'Polizze': 'necessita',
  'Imposte sul reddito e tasse varie': 'necessita',
  'Imposte, bolli e commissioni': 'necessita',
  'Casa varie': 'necessita',
  'Manutenzione casa': 'necessita',
  'Affitto': 'necessita',
  'Rata auto': 'necessita',
  'Acquisto auto': 'necessita',
  'Scuola e università': 'necessita',
  'Contributo famiglia': 'necessita',

  'Ristoranti e bar': 'desideri',
  'Abbigliamento e accessori': 'desideri',
  'Tempo libero varie': 'desideri',
  'Regali': 'desideri',
  'Divertimenti e locali': 'desideri',
  'Viaggi e vacanze': 'desideri',
  'Cura della persona': 'desideri',
  'Animali domestici': 'desideri',
  'Elettrodomestici, arredamento e giardino': 'desideri',
  'Donazioni': 'desideri',
  'Addebiti vari': 'desideri',
  'Altre uscite': 'desideri',
  'Prelievi': 'desideri',
  'Bonifici in uscita': 'desideri',
  'Da classificare': 'desideri',

  'Libri, film e musica': 'crescita',
  'Corsi e sport': 'crescita',
  'Hi-tech e informatica': 'crescita',
  'Spettacoli e musei': 'crescita',
  'Associazioni': 'crescita',

  'Investimenti, BDR e Salvadanaio': 'risparmio',

  'Stipendi e pensioni': 'entrate',
  'Indennità NASpI': 'entrate',
  'Affitti ricevuti': 'entrate',
  'Bonifici ricevuti': 'entrate',
  'Entrate varie': 'entrate',
  'Entrate': 'entrate',
  'Rimborsi spese e storni': 'entrate',

  'Giroconti': 'escluso',
};

// Categorie spalmate sui 12 mesi dell'anno solare (modificabile da Impostazioni)
export const RIPARTITE_DEFAULT = ['Contributo famiglia', 'Polizze', 'Rata auto'];
// Categorie spalmate su N mesi a partire dal mese del pagamento
export const RIPARTITE_MESI_DEFAULT = { 'Acquisto auto': 60 };

// Regole iniziali, salvate nel database una volta sola (v = versione in cui sono state aggiunte).
// Quelle personali stanno in personale.js, che non viene pubblicato.
const personali = Object.values(import.meta.glob('./personale.js', { eager: true }))[0]?.REGOLE_PERSONALI ?? [];
export const REGOLE_INIZIALI = [
  ...personali,
  { v: 3, testo: 'NASPI', solo: 'entrate', categoria: 'Indennità NASpI' },
];

// Righe "riepilogo" importate dal vecchio Excel (totali mensili per voce)
export const CONTO_RIEPILOGO = 'Riepilogo Excel';

// Categorie che contano come reddito da lavoro nel confronto tra anni
export const REDDITO_LAVORO = ['Stipendi e pensioni', 'Indennità NASpI'];

export function regolaVale(r, m) {
  if (!r.testo) return false;
  if (r.importo != null && Math.abs(Math.abs(m.importo) - Math.abs(r.importo)) > 0.005) return false;
  if (r.solo === 'uscite' && m.importo >= 0) return false;
  if (r.solo === 'entrate' && m.importo <= 0) return false;
  return `${m.operazione} ${m.dettagli}`.toLowerCase().includes(r.testo.toLowerCase());
}

export function categoriaDi(m, regole) {
  if (m.categoriaManuale) return m.categoriaManuale;
  const r = regole.find((x) => regolaVale(x, m));
  return r ? r.categoria : m.categoriaBanca || 'Da classificare';
}
