import Chart from 'chart.js/auto';
import { caricaTutto } from '../db.js';
import { MACRO, OBIETTIVI } from '../categorie.js';
import { eur, eur0, perc, esc, nomeMese, MESI_BREVI, totali, movimentiDelPeriodo, descriviRipartizione } from '../util.js';

let grafici = [];

export async function vistaDashboard(el, q) {
  grafici.forEach((g) => g.destroy());
  grafici = [];

  const { movimenti, ripartizione } = await caricaTutto();
  const spalmata = (cat) => ripartizione.anno.includes(cat) || ripartizione.mesi[cat] > 1;
  if (!movimenti.length) {
    el.innerHTML = `
      <div class="vuoto">
        <h2>Inizia importando l'estratto conto</h2>
        <p>Scarica la lista operazioni da Intesa Sanpaolo in formato .xlsx e caricala qui.</p>
        <a class="btn primario" href="#/importa">Importa movimenti</a>
      </div>`;
    return;
  }

  // Periodo: "AAAA-MM" per un mese oppure "AAAA" per l'anno intero
  const mesi = [...new Set(movimenti.map((m) => m.data.slice(0, 7)))].sort().reverse();
  const anni = [...new Set(mesi.map((m) => m.slice(0, 4)))];
  const richiesto = q.get('periodo') || '';
  const periodo = mesi.includes(richiesto) || anni.includes(richiesto) ? richiesto : mesi[0];
  const anno = periodo.slice(0, 4);
  const interoAnno = periodo.length === 4;
  const cassa = q.get('vista') === 'cassa';
  const vai = (p, c = cassa) => { location.hash = `#/dashboard?periodo=${p}${c ? '&vista=cassa' : ''}`; };

  const nelPeriodo = (p) => movimentiDelPeriodo(movimenti, p, ripartizione, cassa);
  const t = totali(nelPeriodo(periodo));
  const periodoPrec = interoAnno ? String(+anno - 1) : mesi[mesi.indexOf(periodo) + 1];
  // l'anno prima si confronta solo se ha almeno gli stessi mesi con dati (sennò il confronto inganna)
  const mesiCon = (p) => mesi.filter((m) => m.startsWith(p)).length;
  const confrontabile = periodoPrec && (interoAnno ? mesiCon(periodoPrec) >= mesiCon(anno) : mesi.includes(periodoPrec));
  const prec = confrontabile ? totali(nelPeriodo(periodoPrec)) : null;
  const reali = movimenti.filter((m) => m.data.startsWith(periodo));
  const daClassificare = reali.filter((m) => m.cat === 'Da classificare').length;
  const etichetta = interoAnno ? `del ${anno}` : `di ${nomeMese(periodo)}`;

  // Quote 50/30/20 sulle entrate (null se nel periodo non ci sono entrate)
  const quoteDi = (x) => (x.entrate > 0 ? {
    necessita: (x.necessita / x.entrate) * 100,
    desideri: ((x.desideri + x.crescita) / x.entrate) * 100,
    risparmio: (x.risparmiato / x.entrate) * 100,
  } : null);
  const rispetta = (chiave, v) => (chiave === 'risparmio' ? v >= OBIETTIVI[chiave] : v <= OBIETTIVI[chiave]);
  const quote = quoteDi(t) || {};
  const barra = (chiave, nome, colore) => {
    const v = quote[chiave];
    const ok = rispetta(chiave, v);
    return `
      <div class="obiettivo">
        <div class="riga-obiettivo"><span>${nome}</span>
          <span class="${Number.isFinite(v) ? (ok ? 'ok' : 'ko') : ''}">${perc(v)} · obiettivo ${OBIETTIVI[chiave]}%</span></div>
        <div class="barra-obiettivo">
          <i style="width:${Math.max(0, Math.min(100, v || 0))}%;background:${colore}"></i>
          <span class="tacca" style="left:${OBIETTIVI[chiave]}%"></span>
        </div>
      </div>`;
  };
  const delta = prec ? t.uscite - prec.uscite : null;

  // 50/30/20 mese per mese dell'anno selezionato
  const mesiAnno = MESI_BREVI.map((_, i) => `${anno}-${String(i + 1).padStart(2, '0')}`);
  const quoteMesi = mesiAnno.map((k) => (mesi.includes(k) ? quoteDi(totali(nelPeriodo(k))) : null));
  const SERIE_QUOTE = [
    ['necessita', 'Necessità', MACRO.necessita.colore],
    ['desideri', 'Desideri e crescita', MACRO.desideri.colore],
    ['risparmio', 'Risparmio', MACRO.risparmio.colore],
  ];
  const cellaQuota = (q, chiave) => (q ? `<span class="${rispetta(chiave, q[chiave]) ? 'ok' : 'ko'}">${perc(q[chiave])}</span>` : '<span class="nota">—</span>');

  el.innerHTML = `
    <div class="testata">
      <select id="anno" aria-label="Anno">
        ${anni.map((a) => `<option ${a === anno ? 'selected' : ''}>${a}</option>`).join('')}
      </select>
      <select id="mese" aria-label="Mese">
        <option value="${anno}" ${interoAnno ? 'selected' : ''}>Tutto l'anno</option>
        ${mesi.filter((m) => m.startsWith(anno)).reverse()
          .map((m) => `<option value="${m}" ${m === periodo ? 'selected' : ''}>${nomeMese(m).split(' ')[0]}</option>`).join('')}
      </select>
      <div class="interruttore" role="group" aria-label="Tipo di vista">
        <button data-vista="competenza" class="${cassa ? '' : 'attivo'}" title="Le spese annuali sono spalmate sui 12 mesi">Competenza</button>
        <button data-vista="cassa" class="${cassa ? 'attivo' : ''}" title="Quello che è uscito davvero dal conto">Cassa</button>
      </div>
      ${daClassificare ? `<a class="pill" href="#/movimenti?mese=${periodo}&filtro=daclassificare">${daClassificare} da classificare</a>` : ''}
    </div>
    ${!cassa && descriviRipartizione(ripartizione) ? `<p class="nota">Spalmate: ${esc(descriviRipartizione(ripartizione))}.</p>` : ''}

    <div class="kpi">
      <div><p>Entrate</p><b>${eur0(t.entrate)}</b></div>
      <div><p>Uscite</p><b>${eur0(t.uscite)}</b>
        ${delta !== null ? `<small class="${delta > 0 ? 'ko' : 'ok'}">${delta > 0 ? '+' : '−'}${eur0(Math.abs(delta))} ${interoAnno ? "sull'anno prima" : 'sul mese prima'}</small>` : ''}</div>
      <div><p>Risparmiato</p><b class="${t.risparmiato >= 0 ? 'ok' : 'ko'}">${eur0(t.risparmiato)}</b></div>
      <div><p>Di cui investito</p><b>${eur0(t.risparmio)}</b></div>
    </div>

    <section>
      <h3>Regola 50/30/20</h3>
      <p class="nota">Percentuale sulle entrate ${etichetta}. La tacca indica l'obiettivo.</p>
      ${barra('necessita', 'Necessità', MACRO.necessita.colore)}
      ${barra('desideri', 'Desideri e crescita personale', MACRO.desideri.colore)}
      ${barra('risparmio', 'Risparmio e investimenti', MACRO.risparmio.colore)}
    </section>

    <section>
      <h3>50/30/20 mese per mese · ${anno}</h3>
      <p class="nota">Le linee tratteggiate sono gli obiettivi (50%, 30%, 20%). Tocca un mese per aprirlo.</p>
      <div class="legenda">${SERIE_QUOTE.map(([k, n, c]) => `<span><i style="background:${c}"></i>${n} (obiettivo ${OBIETTIVI[k]}%)</span>`).join('')}</div>
      <div class="grafico" style="height:240px"><canvas id="g-quote" role="img" aria-label="Regola 50/30/20 mese per mese"></canvas></div>
      <table class="tabella tabella-quote">
        <tr><td></td>${SERIE_QUOTE.map(([, n]) => `<td class="num"><small>${n}</small></td>`).join('')}</tr>
        ${mesiAnno.map((k, i) => quoteMesi[i] ? `
          <tr class="${k === periodo ? 'selezionato' : ''}"><td><a href="#/dashboard?periodo=${k}${cassa ? '&vista=cassa' : ''}">${nomeMese(k).split(' ')[0]}</a></td>
            ${SERIE_QUOTE.map(([c]) => `<td class="num">${cellaQuota(quoteMesi[i], c)}</td>`).join('')}</tr>` : '').join('')}
      </table>
    </section>

    <section>
      <h3>Entrate e uscite ${anno}</h3>
      <div class="legenda"><span><i style="background:#2a78d6"></i>Entrate</span><span><i style="background:#eb6834"></i>Uscite</span><span>Tocca un mese per aprirlo</span></div>
      <div class="grafico" style="height:240px"><canvas id="g-anno" role="img" aria-label="Entrate e uscite mese per mese"></canvas></div>
    </section>

    <section>
      <h3>Uscite per categoria ${etichetta}</h3>
      <div class="legenda">
        ${['necessita', 'desideri', 'crescita'].map((k) => `<span><i style="background:${MACRO[k].colore}"></i>${MACRO[k].nome} ${eur0(t[k])}</span>`).join('')}
      </div>
      <div class="grafico" id="box-cat"><canvas id="g-cat" role="img" aria-label="Uscite per categoria"></canvas></div>
    </section>

    <section>
      <h3>Movimenti più grandi ${etichetta}</h3>
      <table class="tabella">
        ${reali.filter((m) => m.macro !== 'escluso' && !m.coperto).sort((a, b) => Math.abs(b.importo) - Math.abs(a.importo)).slice(0, 8).map((m) => `
          <tr><td>${esc(m.operazione)}<small>${esc(m.cat)} · ${m.data.slice(8, 10)}/${m.data.slice(5, 7)}</small></td>
          <td class="num ${m.importo > 0 ? 'ok' : ''}">${eur(m.importo)}</td></tr>`).join('')}
      </table>
      <a href="#/movimenti?mese=${periodo}">Vedi tutti i movimenti</a>
    </section>`;

  el.querySelector('#anno').addEventListener('change', (e) => {
    // cambiando anno resta sullo stesso mese, se esiste
    const stessoMese = `${e.target.value}${periodo.slice(4)}`;
    vai(interoAnno || !mesi.includes(stessoMese) ? e.target.value : stessoMese);
  });
  el.querySelector('#mese').addEventListener('change', (e) => vai(e.target.value));
  el.querySelectorAll('[data-vista]').forEach((b) => b.addEventListener('click', () => vai(periodo, b.dataset.vista === 'cassa')));

  const scuro = matchMedia('(prefers-color-scheme: dark)').matches;
  const griglia = scuro ? '#2c2c2a' : '#e1e0d9';
  const tick = '#898781';
  const assi = {
    x: { grid: { display: false }, ticks: { color: tick, autoSkip: false } },
    y: { grid: { color: griglia }, ticks: { color: tick, callback: (v) => eur0(v) } },
  };

  const chiaviMesi = MESI_BREVI.map((_, i) => `${anno}-${String(i + 1).padStart(2, '0')}`);
  const conDati = new Set(mesi);
  const perMese = chiaviMesi.map((k) => (conDati.has(k) ? totali(nelPeriodo(k)) : { entrate: 0, uscite: 0 }));
  grafici.push(new Chart(el.querySelector('#g-anno'), {
    type: 'bar',
    data: {
      labels: MESI_BREVI,
      datasets: [
        { label: 'Entrate', data: perMese.map((x) => x.entrate), backgroundColor: chiaviMesi.map((k) => (k === periodo || interoAnno ? '#2a78d6' : '#2a78d680')), borderRadius: 4, maxBarThickness: 14 },
        { label: 'Uscite', data: perMese.map((x) => x.uscite), backgroundColor: chiaviMesi.map((k) => (k === periodo || interoAnno ? '#eb6834' : '#eb683480')), borderRadius: 4, maxBarThickness: 14 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false, scales: assi,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${eur(c.raw)}` } } },
      onClick: (_, punti) => { if (punti[0] && conDati.has(chiaviMesi[punti[0].index])) vai(chiaviMesi[punti[0].index]); },
    },
  }));

  const cat = Object.entries(t.perCategoria).filter(([, v]) => v.totale > 0).sort((a, b) => b[1].totale - a[1].totale).slice(0, 15);
  el.querySelector('#box-cat').style.height = `${cat.length * 32 + 40}px`;
  grafici.push(new Chart(el.querySelector('#g-cat'), {
    type: 'bar',
    data: {
      labels: cat.map(([k]) => k),
      datasets: [{ data: cat.map(([, v]) => v.totale), backgroundColor: cat.map(([, v]) => MACRO[v.macro].colore), borderRadius: 4, maxBarThickness: 20 }],
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => eur(c.raw) + (!cassa && spalmata(c.label) ? ' (spalmata)' : '') } } },
      scales: {
        x: assi.y,
        y: {
          grid: { display: false },
          ticks: {
            color: tick,
            callback(v) {
              const s = this.getLabelForValue(v);
              const max = innerWidth < 640 ? 18 : 34;
              return s.length > max ? s.slice(0, max - 1) + '…' : s;
            },
          },
        },
      },
      onClick: (_, punti) => { if (punti[0]) location.hash = `#/movimenti?mese=${periodo}&categoria=${encodeURIComponent(cat[punti[0].index][0])}`; },
    },
  }));

  // 50/30/20 mese per mese: una linea per quota + obiettivo tratteggiato dello stesso colore
  grafici.push(new Chart(el.querySelector('#g-quote'), {
    type: 'line',
    data: {
      labels: MESI_BREVI,
      datasets: [
        ...SERIE_QUOTE.map(([k, n, c]) => ({
          label: n,
          data: quoteMesi.map((q) => (q ? Math.round(q[k]) : null)),
          borderColor: c, backgroundColor: c, borderWidth: 2, pointRadius: 4, pointHoverRadius: 6, spanGaps: false,
        })),
        ...SERIE_QUOTE.map(([k, n, c]) => ({
          label: `Obiettivo ${n.toLowerCase()}`,
          data: MESI_BREVI.map(() => OBIETTIVI[k]),
          borderColor: c + '99', borderWidth: 1, borderDash: [5, 5], pointRadius: 0, pointHoverRadius: 0,
        })),
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: assi.x,
        y: { grid: { color: griglia }, ticks: { color: tick, callback: (v) => `${v}%` }, suggestedMin: 0, suggestedMax: 70 },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          filter: (x) => !x.dataset.label.startsWith('Obiettivo') && x.raw != null,
          callbacks: { label: (x) => `${x.dataset.label}: ${x.raw}%` },
        },
      },
      onClick: (_, punti) => { if (punti[0] && quoteMesi[punti[0].index]) vai(mesiAnno[punti[0].index]); },
    },
  }));
}
