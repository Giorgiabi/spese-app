import Chart from 'chart.js/auto';
import { db, caricaTutto } from '../db.js';
import { versamentiDi, calcola, strumentoDelMovimento } from '../investimenti.js';
import { eur, esc, dataBreve, avviso } from '../util.js';

let grafici = [];
const oggi = () => new Date().toISOString().slice(0, 10);
const segno = (n) => (n > 0 ? 'ok' : n < 0 ? 'ko' : '');
const percento = (n) => `${n > 0 ? '+' : ''}${n.toLocaleString('it-IT', { maximumFractionDigits: 2 })}%`;

export async function vistaInvestimenti(el) {
  grafici.forEach((g) => g.destroy());
  grafici = [];

  const { movimenti } = await caricaTutto();
  const strumenti = await db.strumenti();
  const dati = strumenti.map((s) => {
    const versamenti = versamentiDi(s, movimenti, strumenti);
    return { s, versamenti, c: calcola(s, versamenti) };
  });

  // Movimenti di investimento non ancora collegati a uno strumento
  const liberi = movimenti.filter((m) => m.macro === 'risparmio' && !strumentoDelMovimento(m, strumenti));
  const codice = (m) => (`${m.operazione} ${m.dettagli}`.match(/sottoscritto\s+(\w+)/i) || [])[1] || '';

  const tot = dati.reduce((t, { c }) => ({
    lordo: t.lordo + c.lordo,
    valore: t.valore + (c.valore ?? c.lordo),
    guadagno: t.guadagno + (c.guadagno ?? 0),
    senzaValore: t.senzaValore + (c.ultimo ? 0 : 1),
  }), { lordo: 0, valore: 0, guadagno: 0, senzaValore: 0 });

  el.innerHTML = `
    <div class="kpi">
      <div><p>Totale versato</p><b>${eur(tot.lordo)}</b></div>
      <div><p>Valore attuale</p><b>${eur(tot.valore)}</b>${tot.senzaValore ? `<small>${tot.senzaValore} senza valore aggiornato</small>` : ''}</div>
      <div><p>Guadagno / perdita netti</p><b class="${segno(tot.guadagno)}">${eur(tot.guadagno)}</b></div>
      <div><p>Rendimento netto</p><b class="${segno(tot.guadagno)}">${tot.lordo ? percento((tot.guadagno / tot.lordo) * 100) : '—'}</b></div>
    </div>

    ${liberi.length ? `
      <section class="evidenza">
        <h3>Versamenti da collegare</h3>
        <p class="nota">Questi movimenti sono investimenti ma non appartengono ancora a nessuno strumento.</p>
        <table class="tabella impilata">
          ${liberi.map((m) => `
            <tr><td>${dataBreve(m.data)} · ${esc(m.operazione)}<small>${esc(m.dettagli)}</small></td>
            <td class="num">${eur(-m.importo)}</td>
            <td class="num">
              ${strumenti.length ? `<select class="collega" data-id="${esc(m.id)}" aria-label="Collega a strumento">
                <option value="">Collega a…</option>${strumenti.map((s) => `<option value="${s.id}">${esc(s.nome)}</option>`).join('')}
              </select>` : ''}
              ${codice(m) ? `<button class="btn crea-da" data-codice="${esc(codice(m))}">Nuovo strumento "${esc(codice(m))}"</button>` : ''}
            </td></tr>`).join('')}
        </table>
      </section>` : ''}

    <div id="strumenti">
      ${dati.map(({ s, versamenti, c }) => schedaStrumento(s, versamenti, c)).join('')}
    </div>

    <section>
      <h3>Aggiungi strumento</h3>
      <p class="nota">Il "testo da riconoscere" è il codice che compare nei movimenti Intesa (es. <b>AB12</b> in "Fondo Sottoscritto AB12"):
        i versamenti futuri verranno collegati da soli.</p>
      ${formStrumento({})}
    </section>`;

  // Grafici: versato cumulato e valore registrato nel tempo
  for (const { s, versamenti } of dati) {
    const canvas = el.querySelector(`#g-str-${s.id}`);
    if (!canvas || !versamenti.length) continue;
    const date = [...new Set([...versamenti.map((v) => v.data), ...(s.valori || []).map((v) => v.data)])].sort();
    let cumulato = 0;
    const versato = date.map((d) => (cumulato += versamenti.filter((v) => v.data === d).reduce((t, v) => t + v.importo, 0)));
    const valore = date.map((d) => (s.valori || []).find((v) => v.data === d)?.valore ?? null);
    grafici.push(new Chart(canvas, {
      type: 'line',
      data: {
        labels: date.map(dataBreve),
        datasets: [
          { label: 'Versato', data: versato, stepped: true, borderColor: '#2a78d6', backgroundColor: '#2a78d61a', fill: true, pointRadius: 3, borderWidth: 2 },
          { label: 'Valore', data: valore, spanGaps: true, borderColor: '#1baf7a', pointBackgroundColor: '#1baf7a', pointRadius: 4, borderWidth: 2, borderDash: [5, 4] },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (x) => `${x.dataset.label}: ${eur(x.raw)}` } } },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#898781', maxRotation: 0, autoSkip: true } },
          y: { ticks: { color: '#898781', callback: (v) => eur(v) }, grid: { color: matchMedia('(prefers-color-scheme: dark)').matches ? '#2c2c2a' : '#e1e0d9' } },
        },
      },
    }));
  }

  const ricarica = () => vistaInvestimenti(el);
  const trova = (id) => strumenti.find((s) => s.id === Number(id));

  el.querySelectorAll('.collega').forEach((sel) => sel.addEventListener('change', async () => {
    if (!sel.value) return;
    const m = movimenti.find((x) => x.id === sel.dataset.id);
    m.strumentoId = Number(sel.value);
    await db.salvaMovimento(m);
    ricarica();
  }));

  el.querySelectorAll('.crea-da').forEach((b) => b.addEventListener('click', () => {
    const form = el.querySelector('form.strumento:not([data-id])');
    form.riconosci.value = b.dataset.codice;
    form.nome.focus();
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }));

  el.querySelectorAll('form.strumento').forEach((f) => f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = f.nome.value.trim();
    if (!nome) return;
    const s = f.dataset.id ? trova(f.dataset.id) : { valori: [], versamentiManuali: [] };
    Object.assign(s, {
      nome,
      riconosci: f.riconosci.value.trim(),
      aliquota: Number(f.aliquota.value),
      costoFisso: Number(f.costoFisso.value) || 0,
      costoPerc: Number(f.costoPerc.value) || 0,
    });
    await db.salvaStrumento(s);
    avviso(f.dataset.id ? 'Strumento aggiornato' : 'Strumento creato');
    ricarica();
  }));

  el.querySelectorAll('form.valore').forEach((f) => f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const s = trova(f.dataset.id);
    const valore = Number(f.valore.value);
    if (!f.data.value || !(valore >= 0)) return;
    s.valori = (s.valori || []).filter((v) => v.data !== f.data.value);
    s.valori.push({ data: f.data.value, valore });
    await db.salvaStrumento(s);
    ricarica();
  }));

  el.querySelectorAll('form.manuale').forEach((f) => f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const s = trova(f.dataset.id);
    const importo = Number(f.importo.value);
    if (!f.data.value || !importo) return;
    s.versamentiManuali = [...(s.versamentiManuali || []), { data: f.data.value, importo, nota: f.nota.value.trim() }];
    await db.salvaStrumento(s);
    ricarica();
  }));

  el.querySelector('#strumenti').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-azione]');
    if (!b) return;
    const s = trova(b.dataset.id);
    if (b.dataset.azione === 'elimina-valore') {
      s.valori = s.valori.filter((v) => v.data !== b.dataset.data);
      await db.salvaStrumento(s);
    } else if (b.dataset.azione === 'elimina-manuale') {
      s.versamentiManuali.splice(Number(b.dataset.indice), 1);
      await db.salvaStrumento(s);
    } else if (b.dataset.azione === 'scollega') {
      const m = movimenti.find((x) => x.id === b.dataset.movimento);
      m.strumentoId = 0;
      await db.salvaMovimento(m);
    } else if (b.dataset.azione === 'elimina-strumento') {
      if (!confirm(`Eliminare "${s.nome}"? I movimenti della banca restano, si perdono solo i valori e i versamenti inseriti a mano.`)) return;
      for (const m of movimenti.filter((x) => x.strumentoId === s.id)) { m.strumentoId = null; await db.salvaMovimento(m); }
      await db.eliminaStrumento(s.id);
    }
    ricarica();
  });
}

function schedaStrumento(s, versamenti, c) {
  const riga = (etichetta, valore, classe = '') => `<div><p>${etichetta}</p><b class="${classe}">${valore}</b></div>`;
  return `
    <section class="strumento">
      <div class="testa-strumento">
        <div><h3>${esc(s.nome)}</h3>
          <p class="nota">${c.primo ? `Primo versamento ${dataBreve(c.primo)} · da ${c.giorni} giorni` : 'Nessun versamento'} ·
            tasse ${s.aliquota ?? 26}%${s.costoFisso ? ` · ${eur(s.costoFisso)} a versamento` : ''}${s.costoPerc ? ` · ${s.costoPerc}% sulla quota` : ''}</p></div>
        ${c.ultimo ? `<b class="grande ${segno(c.guadagno)}">${eur(c.guadagno)}<small>${percento(c.rendimento)}</small></b>` : ''}
      </div>

      <div class="kpi piccoli">
        ${riga('Versato', eur(c.lordo))}
        ${riga('Costi', eur(c.costi))}
        ${riga(`Valore${c.ultimo ? ` al ${dataBreve(c.ultimo.data)}` : ''}`, c.ultimo ? eur(c.valore) : '—')}
        ${riga('Plusvalenza lorda', c.ultimo ? eur(c.plusvalenza) : '—', segno(c.plusvalenza))}
        ${riga('Tasse stimate', c.ultimo ? eur(c.tasse) : '—')}
        ${riga('Incasseresti oggi', c.ultimo ? eur(c.nettoSeDisinvesti) : '—')}
      </div>
      ${c.ultimo ? '' : '<p class="nota ko">Inserisci il valore attuale (lo trovi nell\'app Intesa, sezione Investimenti) per vedere se stai guadagnando.</p>'}

      <form class="valore riga-form" data-id="${s.id}">
        <input name="data" type="date" value="${oggi()}" aria-label="Data del valore" style="max-width:170px" />
        <input name="valore" type="number" step="0.01" min="0" placeholder="Valore attuale €" required />
        <button class="btn primario">Aggiorna valore</button>
      </form>

      ${versamenti.length ? `
        <div class="legenda" style="margin-top:14px"><span><i style="background:#2a78d6"></i>Versato (cumulato)</span><span><i style="background:#1baf7a"></i>Valore registrato</span></div>
        <div class="grafico" style="height:200px"><canvas id="g-str-${s.id}" role="img" aria-label="Versato e valore di ${esc(s.nome)} nel tempo"></canvas></div>` : ''}

      <details>
        <summary>Versamenti (${versamenti.length}) e storico valori (${(s.valori || []).length})</summary>
        <table class="tabella">
          ${versamenti.map((v) => `
            <tr><td>${dataBreve(v.data)}<small>${v.fonte === 'banca' ? 'dalla banca' : esc(v.nota || 'inserito a mano')}</small></td>
            <td class="num ${v.importo < 0 ? 'ko' : ''}">${v.importo < 0 ? 'Riscatto ' : ''}${eur(Math.abs(v.importo))}</td>
            <td class="num">${v.fonte === 'manuale'
              ? `<button class="btn" data-azione="elimina-manuale" data-id="${s.id}" data-indice="${v.indice}">Elimina</button>`
              : `<button class="btn" data-azione="scollega" data-id="${s.id}" data-movimento="${esc(v.idMovimento)}" title="Scollega da questo strumento">Scollega</button>`}</td></tr>`).join('')}
        </table>
        <form class="manuale riga-form" data-id="${s.id}">
          <input name="data" type="date" required aria-label="Data versamento" style="max-width:170px" />
          <input name="importo" type="number" step="0.01" placeholder="Importo (negativo = riscatto)" required />
          <input name="nota" placeholder="Nota (facoltativa)" />
          <button class="btn">Aggiungi versamento</button>
        </form>
        <h4>Storico valori</h4>
        <table class="tabella">
          ${(s.valori || []).slice().sort((a, b) => b.data.localeCompare(a.data)).map((v) => `
            <tr><td>${dataBreve(v.data)}</td><td class="num">${eur(v.valore)}</td>
            <td class="num"><button class="btn" data-azione="elimina-valore" data-id="${s.id}" data-data="${v.data}">Elimina</button></td></tr>`).join('') || '<tr><td class="nota">Nessun valore inserito.</td></tr>'}
        </table>
      </details>

      <details>
        <summary>Modifica strumento</summary>
        ${formStrumento(s)}
        <button class="btn pericolo" data-azione="elimina-strumento" data-id="${s.id}">Elimina strumento</button>
      </details>
    </section>`;
}

function formStrumento(s) {
  const aliquota = s.aliquota ?? 26;
  return `
    <form class="strumento griglia-form" ${s.id ? `data-id="${s.id}"` : ''}>
      <label>Nome<input name="nome" value="${esc(s.nome || '')}" placeholder="es. Fondo obbligazionario" required /></label>
      <label>Testo da riconoscere<input name="riconosci" value="${esc(s.riconosci || '')}" placeholder="es. AB12" /></label>
      <label>Tassazione plusvalenze %<input name="aliquota" type="number" step="0.01" min="0" max="100" value="${aliquota}" /></label>
      <label>Costo fisso per versamento €<input name="costoFisso" type="number" step="0.01" min="0" value="${s.costoFisso || 0}" /></label>
      <label>Costo % sulla quota<input name="costoPerc" type="number" step="0.01" min="0" value="${s.costoPerc || 0}" /></label>
      <button class="btn primario">${s.id ? 'Salva modifiche' : 'Crea strumento'}</button>
    </form>`;
}
