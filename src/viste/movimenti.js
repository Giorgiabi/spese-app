import { db, caricaTutto } from '../db.js';
import { MACRO } from '../categorie.js';
import { eur, esc, nomeMese, dataBreve, avviso } from '../util.js';

export async function vistaMovimenti(el, q) {
  const { movimenti, categorie } = await caricaTutto();
  const mesi = [...new Set(movimenti.map((m) => m.data.slice(0, 7)))].sort().reverse();
  const stato = {
    mese: q.get('mese') || mesi[0] || 'tutti',
    filtro: q.get('filtro') || '',
    categoria: q.get('categoria') || '',
    cerca: '',
  };
  const nomiCategorie = Object.keys(categorie).sort((a, b) => a.localeCompare(b, 'it'));

  el.innerHTML = `
    <div class="testata">
      <select id="f-mese" aria-label="Mese">
        <option value="tutti">Tutti i mesi</option>
        ${[...new Set(mesi.map((m) => m.slice(0, 4)))].map((a) => `
          <optgroup label="${a}">
            <option value="${a}">Tutto il ${a}</option>
            ${mesi.filter((m) => m.startsWith(a)).map((m) => `<option value="${m}">${nomeMese(m)}</option>`).join('')}
          </optgroup>`).join('')}
      </select>
      <select id="f-filtro" aria-label="Filtro">
        <option value="">Tutte le macro</option>
        ${Object.entries(MACRO).map(([k, v]) => `<option value="${k}">${v.nome}</option>`).join('')}
        <option value="daclassificare">Da classificare</option>
        <option value="sospesi">Non ancora contabilizzati</option>
      </select>
      <input id="f-cerca" type="search" placeholder="Cerca: Lidl, Amazon…" />
    </div>
    <p class="nota" id="riepilogo"></p>
    <div id="lista"></div>`;

  const fMese = el.querySelector('#f-mese');
  const fFiltro = el.querySelector('#f-filtro');
  fMese.value = stato.mese;
  fFiltro.value = stato.filtro;

  const disegna = () => {
    const cerca = stato.cerca.toLowerCase();
    const lista = movimenti.filter((m) =>
      (stato.mese === 'tutti' || m.data.startsWith(stato.mese)) &&
      (!stato.categoria || m.cat === stato.categoria) &&
      (!stato.filtro ||
        (stato.filtro === 'daclassificare' ? m.cat === 'Da classificare'
          : stato.filtro === 'sospesi' ? !m.contabilizzato
          : m.macro === stato.filtro)) &&
      (!cerca || `${m.operazione} ${m.dettagli}`.toLowerCase().includes(cerca)));

    const somma = lista.reduce((s, m) => s + m.importo, 0);
    el.querySelector('#riepilogo').innerHTML =
      `${lista.length} movimenti · saldo ${eur(somma)}` +
      (stato.categoria ? ` · categoria <b>${esc(stato.categoria)}</b> <a href="#" id="togli-cat">togli</a>` : '');
    el.querySelector('#togli-cat')?.addEventListener('click', (e) => { e.preventDefault(); stato.categoria = ''; disegna(); });

    const mostrati = lista.slice(0, 300);
    el.querySelector('#lista').innerHTML = mostrati.map((m) => `
      <div class="mov" data-id="${esc(m.id)}">
        <div class="mov-testo">
          <b>${esc(m.operazione)}</b>
          <small>${dataBreve(m.data)} · ${esc(m.conto)}${m.contabilizzato ? '' : ' · <span class="ko">non contabilizzato</span>'}${m.coperto ? ' · <span class="ko">non conteggiato: per questo mese vale il riepilogo dell\'Excel</span>' : ''}</small>
          <small class="dettagli">${esc(m.dettagli)}</small>
        </div>
        <div class="mov-dx">
          <span class="num ${m.importo > 0 ? 'ok' : ''}">${eur(m.importo)}</span>
          <div class="azioni-mov">
            <select class="sel-cat" aria-label="Categoria" style="border-left:4px solid ${MACRO[m.macro].colore}">
              ${nomiCategorie.map((c) => `<option ${c === m.cat ? 'selected' : ''}>${esc(c)}</option>`).join('')}
            </select>
            <button class="btn elimina-mov" aria-label="Elimina movimento" title="Elimina (es. un doppione)">×</button>
          </div>
        </div>
      </div>`).join('') +
      (lista.length > mostrati.length ? `<p class="nota">Mostrati i primi 300: usa i filtri per restringere.</p>` : '') +
      (lista.length ? '' : '<p class="nota">Nessun movimento con questi filtri.</p>');
  };

  fMese.addEventListener('change', () => { stato.mese = fMese.value; disegna(); });
  fFiltro.addEventListener('change', () => { stato.filtro = fFiltro.value; disegna(); });
  el.querySelector('#f-cerca').addEventListener('input', (e) => { stato.cerca = e.target.value; disegna(); });

  el.querySelector('#lista').addEventListener('click', async (e) => {
    if (!e.target.classList.contains('elimina-mov')) return;
    const riga = e.target.closest('.mov');
    const i = movimenti.findIndex((x) => x.id === riga.dataset.id);
    const m = movimenti[i];
    if (!confirm(`Eliminare "${m.operazione}" del ${dataBreve(m.data)} (${eur(m.importo)})?\nNon verrà più reimportato.`)) return;
    await db.eliminaMovimento(m.id);
    movimenti.splice(i, 1);
    disegna();
    avviso('Movimento eliminato');
  });

  el.querySelector('#lista').addEventListener('change', async (e) => {
    if (!e.target.classList.contains('sel-cat')) return;
    const riga = e.target.closest('.mov');
    const m = movimenti.find((x) => x.id === riga.dataset.id);
    const nuova = e.target.value;
    m.categoriaManuale = nuova === m.categoriaBanca ? undefined : nuova;
    m.cat = nuova;
    m.macro = categorie[nuova] ?? 'desideri';
    await db.salvaMovimento(m);
    e.target.style.borderLeftColor = MACRO[m.macro].colore;
    proponiRegola(m, nuova);
  });

  disegna();
}

// Dopo una correzione a mano propone di ricordarla per i movimenti futuri
function proponiRegola(m, categoria) {
  document.querySelector('.proposta')?.remove();
  const parola = m.operazione.replace(/[*#]?\s*[A-Z0-9]*\d[A-Z0-9]*\b/gi, '').replace(/\s+/g, ' ').trim() || m.operazione;
  const box = document.createElement('div');
  box.className = 'toast proposta';
  box.innerHTML = `
    <span>Usare sempre <b>${esc(categoria)}</b> per i movimenti che contengono</span>
    <input value="${esc(parola)}" aria-label="Testo da cercare" />
    <button class="btn primario">Crea regola</button>
    <button class="btn" aria-label="Chiudi">No</button>`;
  document.body.append(box);
  const [crea, chiudi] = box.querySelectorAll('button');
  chiudi.onclick = () => box.remove();
  crea.onclick = async () => {
    const testo = box.querySelector('input').value.trim();
    if (!testo) return;
    await db.salvaRegola({ testo, categoria });
    box.remove();
    avviso(`Regola creata: "${testo}" → ${categoria}`);
  };
  setTimeout(() => box.isConnected && !box.contains(document.activeElement) && box.remove(), 12000);
}
