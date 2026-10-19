import Chart from 'chart.js/auto';
import { caricaTutto } from '../db.js';
import { MACRO, REDDITO_LAVORO } from '../categorie.js';
import { eur0, esc, totali, movimentiDelPeriodo } from '../util.js';

let grafici = [];
const COLORI_ANNI = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#6250d6', '#008300', '#e34948'];

export async function vistaConfronto(el, q) {
  grafici.forEach((g) => g.destroy());
  grafici = [];

  const { movimenti, ripartizione } = await caricaTutto();
  if (!movimenti.length) {
    el.innerHTML = '<div class="vuoto"><h2>Nessun dato</h2><p>Importa prima i movimenti.</p></div>';
    return;
  }

  const anni = [...new Set(movimenti.map((m) => m.data.slice(0, 4)))].sort();
  const totale = q.get('vista') === 'totale';
  const annoA = anni.includes(q.get('a')) ? q.get('a') : anni[0];
  const annoB = anni.includes(q.get('b')) ? q.get('b') : anni.at(-1);
  const vai = (p) => {
    const s = new URLSearchParams({ a: annoA, b: annoB, ...(totale ? { vista: 'totale' } : {}), ...p });
    if (s.get('vista') !== 'totale') s.delete('vista');
    location.hash = `#/confronto?${s}`;
  };

  // Riepilogo di ogni anno: i mesi con dati servono per le medie (alcuni anni sono incompleti)
  const perAnno = Object.fromEntries(anni.map((a) => {
    const reali = movimenti.filter((m) => m.data.startsWith(a));
    const mesi = new Set(reali.map((m) => m.data.slice(0, 7))).size;
    const stipendi = reali.filter((m) => REDDITO_LAVORO.includes(m.cat) && m.importo > 0 && !m.coperto);
    const mesiStipendio = new Set(stipendi.map((m) => m.data.slice(0, 7))).size;
    const t = totali(movimentiDelPeriodo(movimenti, a, ripartizione));
    const div = totale ? 1 : mesi || 1;
    return [a, {
      mesi,
      stipendioMedio: mesiStipendio ? stipendi.reduce((s, m) => s + m.importo, 0) / mesiStipendio : null,
      entrate: t.entrate / div,
      uscite: t.uscite / div,
      necessita: t.necessita / div,
      desideri: t.desideri / div,
      crescita: t.crescita / div,
      risparmiato: t.risparmiato / div,
      quotaRisparmio: t.entrate ? (t.risparmiato / t.entrate) * 100 : null,
      perCategoria: Object.fromEntries(Object.entries(t.perCategoria).map(([c, v]) => [c, { ...v, totale: v.totale / div }])),
    }];
  }));

  const variazione = (da, a) => (da && a != null ? ((a - da) / Math.abs(da)) * 100 : null);
  const badge = (v, alto = 'ok') => (v == null ? '' :
    `<small class="${v === 0 ? '' : (v > 0) === (alto === 'ok') ? 'ok' : 'ko'}">${v > 0 ? '+' : ''}${Math.round(v)}%</small>`);
  const A = perAnno[annoA];
  const B = perAnno[annoB];
  const unita = totale ? 'totale anno' : 'media al mese';

  const righe = [
    ['Mesi con dati', (x) => x.mesi],
    ['Stipendio / NASpI medio al mese', (x) => (x.stipendioMedio != null ? eur0(x.stipendioMedio) : '—')],
    ['Entrate', (x) => eur0(x.entrate)],
    ['Uscite', (x) => eur0(x.uscite)],
    ['· Necessità', (x) => eur0(x.necessita)],
    ['· Desideri', (x) => eur0(x.desideri)],
    ['· Crescita personale', (x) => eur0(x.crescita)],
    ['Risparmiato', (x) => `<span class="${x.risparmiato >= 0 ? 'ok' : 'ko'}">${eur0(x.risparmiato)}</span>`],
    ['% risparmiata', (x) => (x.quotaRisparmio != null ? `${Math.round(x.quotaRisparmio)}%` : '—')],
  ];

  const categorie = [...new Set([...Object.keys(A.perCategoria), ...Object.keys(B.perCategoria)])]
    .map((c) => {
      const a = A.perCategoria[c]?.totale || 0;
      const b = B.perCategoria[c]?.totale || 0;
      return { c, a, b, diff: b - a, macro: (A.perCategoria[c] || B.perCategoria[c]).macro };
    })
    .filter((x) => Math.abs(x.a) >= 1 || Math.abs(x.b) >= 1)
    .sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff));

  const opzioniAnno = (sel) => anni.map((a) => `<option ${a === sel ? 'selected' : ''}>${a}</option>`).join('');

  el.innerHTML = `
    <div class="testata">
      <div class="interruttore" role="group" aria-label="Tipo di confronto">
        <button data-vista="media" class="${totale ? '' : 'attivo'}" title="Divide per i mesi con dati: confronta anche anni incompleti">Media al mese</button>
        <button data-vista="totale" class="${totale ? 'attivo' : ''}">Totale anno</button>
      </div>
    </div>
    <p class="nota">Alcuni anni sono incompleti (vedi "Mesi con dati"): la media al mese li rende confrontabili. Le spese spalmate sono in competenza.</p>

    <section>
      <h3>Anno per anno <span class="nota">(${unita})</span></h3>
      <div class="scorri">
        <table class="tabella confronto">
          <tr><td></td>${anni.map((a) => `<td class="num"><b>${a}</b></td>`).join('')}</tr>
          ${righe.map(([nome, f]) => `<tr><td>${nome}</td>${anni.map((a) => `<td class="num">${f(perAnno[a])}</td>`).join('')}</tr>`).join('')}
        </table>
      </div>
    </section>

    <section>
      <h3>Entrate e uscite <span class="nota">(${unita})</span></h3>
      <div class="legenda"><span><i style="background:#2a78d6"></i>Entrate</span><span><i style="background:#eb6834"></i>Uscite</span><span><i style="background:#1baf7a"></i>Risparmiato</span></div>
      <div class="grafico" style="height:240px"><canvas id="g-anni" role="img" aria-label="Entrate, uscite e risparmio per anno"></canvas></div>
    </section>

    <section>
      <h3>Stipendio e NASpI nel tempo</h3>
      <p class="nota">Ogni punto è quanto ti è stato accreditato in quel mese come stipendio o indennità (le tredicesime si vedono come picchi).</p>
      <div class="grafico" style="height:220px"><canvas id="g-stipendio" role="img" aria-label="Stipendio mensile nel tempo"></canvas></div>
    </section>

    <section>
      <h3>Confronta due anni</h3>
      <div class="testata">
        <select id="anno-a" aria-label="Primo anno">${opzioniAnno(annoA)}</select>
        <span>con</span>
        <select id="anno-b" aria-label="Secondo anno">${opzioniAnno(annoB)}</select>
      </div>
      <div class="kpi">
        <div><p>Stipendio / NASpI medio</p><b>${A.stipendioMedio != null ? eur0(A.stipendioMedio) : '—'} → ${B.stipendioMedio != null ? eur0(B.stipendioMedio) : '—'}</b>${badge(variazione(A.stipendioMedio, B.stipendioMedio))}</div>
        <div><p>Entrate (${unita})</p><b>${eur0(A.entrate)} → ${eur0(B.entrate)}</b>${badge(variazione(A.entrate, B.entrate))}</div>
        <div><p>Uscite (${unita})</p><b>${eur0(A.uscite)} → ${eur0(B.uscite)}</b>${badge(variazione(A.uscite, B.uscite), 'ko')}</div>
        <div><p>Risparmiato (${unita})</p><b>${eur0(A.risparmiato)} → ${eur0(B.risparmiato)}</b>${badge(variazione(A.risparmiato, B.risparmiato))}</div>
      </div>
      <p class="nota">Categorie ordinate per differenza più grande · ${unita}</p>
      <table class="tabella">
        <tr><td></td><td class="num"><b>${annoA}</b></td><td class="num"><b>${annoB}</b></td><td class="num"><b>Differenza</b></td></tr>
        ${categorie.map((x) => `
          <tr><td><i class="punto" style="background:${MACRO[x.macro].colore}"></i>${esc(x.c)}</td>
            <td class="num">${eur0(x.a)}</td><td class="num">${eur0(x.b)}</td>
            <td class="num ${x.diff > 0.5 ? 'ko' : x.diff < -0.5 ? 'ok' : ''}">${x.diff > 0 ? '+' : ''}${eur0(x.diff)}</td></tr>`).join('')}
      </table>
    </section>`;

  el.querySelectorAll('[data-vista]').forEach((b) => b.addEventListener('click', () => vai({ vista: b.dataset.vista })));
  el.querySelector('#anno-a').addEventListener('change', (e) => vai({ a: e.target.value }));
  el.querySelector('#anno-b').addEventListener('change', (e) => vai({ b: e.target.value }));

  const scuro = matchMedia('(prefers-color-scheme: dark)').matches;
  const griglia = scuro ? '#2c2c2a' : '#e1e0d9';
  const tick = '#898781';
  const assi = {
    x: { grid: { display: false }, ticks: { color: tick } },
    y: { grid: { color: griglia }, ticks: { color: tick, callback: (v) => eur0(v) } },
  };

  grafici.push(new Chart(el.querySelector('#g-anni'), {
    type: 'bar',
    data: {
      labels: anni,
      datasets: [
        { label: 'Entrate', data: anni.map((a) => perAnno[a].entrate), backgroundColor: '#2a78d6', borderRadius: 4, maxBarThickness: 22 },
        { label: 'Uscite', data: anni.map((a) => perAnno[a].uscite), backgroundColor: '#eb6834', borderRadius: 4, maxBarThickness: 22 },
        { label: 'Risparmiato', data: anni.map((a) => perAnno[a].risparmiato), backgroundColor: '#1baf7a', borderRadius: 4, maxBarThickness: 22 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false, scales: assi,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${eur0(c.raw)}` } } },
    },
  }));

  // Stipendio: somma degli accrediti per mese, una linea per anno sovrapposta (gen→dic)
  const MESI = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
  const stipendi = movimenti.filter((m) => REDDITO_LAVORO.includes(m.cat) && m.importo > 0 && !m.coperto);
  const anniConStipendio = anni.filter((a) => stipendi.some((m) => m.data.startsWith(a)));
  grafici.push(new Chart(el.querySelector('#g-stipendio'), {
    type: 'line',
    data: {
      labels: MESI,
      datasets: anniConStipendio.map((a, i) => ({
        label: a,
        data: MESI.map((_, k) => {
          const mese = `${a}-${String(k + 1).padStart(2, '0')}`;
          const s = stipendi.filter((m) => m.data.startsWith(mese)).reduce((t, m) => t + m.importo, 0);
          return s || null;
        }),
        borderColor: COLORI_ANNI[i % COLORI_ANNI.length],
        backgroundColor: COLORI_ANNI[i % COLORI_ANNI.length],
        borderWidth: 2, pointRadius: 4, spanGaps: false,
        borderDash: i % 2 ? [6, 4] : [],
      })),
    },
    options: {
      responsive: true, maintainAspectRatio: false, scales: assi,
      plugins: {
        legend: { display: true, position: 'top', align: 'start', labels: { color: tick, boxWidth: 10, boxHeight: 10 } },
        tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${eur0(c.raw)}` } },
      },
    },
  }));
}
