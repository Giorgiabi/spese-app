// Calcoli sugli strumenti d'investimento (stessa logica del vecchio Investimenti.xlsx).

const oggiISO = () => new Date().toISOString().slice(0, 10);

// Un movimento appartiene a uno strumento se è stato assegnato a mano,
// oppure se è nella macro "risparmio" e contiene il testo di riconoscimento.
export function strumentoDelMovimento(m, strumenti) {
  if (m.strumentoId === 0) return null; // scollegato a mano
  if (m.strumentoId != null) return strumenti.find((s) => s.id === m.strumentoId) || null;
  if (m.macro !== 'risparmio') return null;
  const testo = `${m.operazione} ${m.dettagli}`.toLowerCase();
  return strumenti.find((s) => s.riconosci && testo.includes(s.riconosci.toLowerCase())) || null;
}

// Versamenti (importo > 0) e riscatti (importo < 0) dello strumento, in ordine di data
export function versamentiDi(s, movimenti, strumenti) {
  const dallaBanca = movimenti
    .filter((m) => strumentoDelMovimento(m, strumenti)?.id === s.id)
    .map((m) => ({ data: m.data, importo: -m.importo, fonte: 'banca', idMovimento: m.id }));
  const manuali = (s.versamentiManuali || []).map((v, i) => ({ ...v, fonte: 'manuale', indice: i }));
  return [...dallaBanca, ...manuali].sort((a, b) => a.data.localeCompare(b.data));
}

export function calcola(s, versamenti) {
  const versati = versamenti.filter((v) => v.importo > 0);
  const lordo = versamenti.reduce((t, v) => t + v.importo, 0);
  const costi = versati.length * (s.costoFisso || 0) + versati.reduce((t, v) => t + v.importo, 0) * (s.costoPerc || 0) / 100;
  const netto = lordo - costi;
  const valori = (s.valori || []).slice().sort((a, b) => a.data.localeCompare(b.data));
  const ultimo = valori.at(-1) || null;
  const primo = versamenti[0]?.data || null;
  const r = { lordo, costi, netto, ultimo, primo, giorni: primo ? Math.round((new Date(oggiISO()) - new Date(primo)) / 86400000) : 0 };
  if (!ultimo) return r;

  // Plusvalenza stimata: valore attuale meno quanto hai versato (i costi di sottoscrizione rientrano nel costo).
  const plusvalenza = ultimo.valore - lordo;
  const tasse = plusvalenza > 0 ? plusvalenza * (s.aliquota ?? 26) / 100 : 0;
  const nettoSeDisinvesti = ultimo.valore - tasse;
  const guadagno = nettoSeDisinvesti - lordo;
  return { ...r, valore: ultimo.valore, plusvalenza, tasse, nettoSeDisinvesti, guadagno, rendimento: lordo ? (guadagno / lordo) * 100 : 0 };
}
