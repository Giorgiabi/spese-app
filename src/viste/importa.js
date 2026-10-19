import { db } from '../db.js';
import { leggiExcel, pianificaImport } from '../importer.js';
import { eur, esc, dataBreve, avviso } from '../util.js';
import { fileRicordabile, salvaBackup } from '../backup.js';

export async function vistaImporta(el) {
  el.innerHTML = `
    <section>
      <h2>Importa da Intesa Sanpaolo</h2>
      <ol class="nota">
        <li>Dall'app o dal sito Intesa apri <b>Lista movimenti</b> e scegli il periodo.</li>
        <li>Seleziona il conto e/o la carta, poi esporta in <b>Excel (.xlsx)</b>.</li>
        <li>Carica qui uno o più file: i movimenti già presenti vengono saltati.</li>
      </ol>
      <label class="zona" id="zona">
        <input type="file" id="file" accept=".xlsx,.xls" multiple hidden />
        <span>Trascina qui i file .xlsx oppure <u>scegli dal dispositivo</u></span>
      </label>
      <div id="esito"></div>
    </section>`;

  const input = el.querySelector('#file');
  const zona = el.querySelector('#zona');
  input.addEventListener('change', () => analizza([...input.files]));
  zona.addEventListener('dragover', (e) => { e.preventDefault(); zona.classList.add('sopra'); });
  zona.addEventListener('dragleave', () => zona.classList.remove('sopra'));
  zona.addEventListener('drop', (e) => { e.preventDefault(); zona.classList.remove('sopra'); analizza([...e.dataTransfer.files]); });

  async function analizza(files) {
    const esito = el.querySelector('#esito');
    if (!files.length) return;
    const letti = [];
    const errori = [];
    for (const f of files) {
      try {
        const r = leggiExcel(await f.arrayBuffer(), f.name);
        letti.push({ nome: f.name, ...r });
      } catch (err) {
        errori.push(err.message);
      }
    }
    const piano = pianificaImport(letti.flatMap((l) => l.movimenti), await db.movimenti(), await db.eliminati());
    const { nuovi, giaPresenti, aggiornati, eliminati } = piano.conteggio;
    const anteprima = piano.daSalvare.slice().sort((a, b) => b.data.localeCompare(a.data)).slice(0, 10);

    esito.innerHTML = `
      ${errori.map((e) => `<p class="errore">${esc(e)}</p>`).join('')}
      ${letti.map((l) => `<p class="nota">${esc(l.nome)}: ${l.movimenti.length} movimenti · ${esc(l.conti.join(', '))}</p>`).join('')}
      <div class="kpi">
        <div><p>Nuovi</p><b>${nuovi}</b></div>
        <div><p>Aggiornati</p><b>${aggiornati}</b></div>
        <div><p>Già presenti (saltati)</p><b>${giaPresenti}</b></div>
      </div>
      ${eliminati ? `<p class="nota">${eliminati} movimenti che avevi eliminato non vengono reimportati.</p>` : ''}
      ${anteprima.length ? `
        <table class="tabella">
          ${anteprima.map((m) => `<tr><td>${dataBreve(m.data)}</td><td>${esc(m.operazione)}<small>${esc(m.categoriaBanca)}</small></td><td class="num">${eur(m.importo)}</td></tr>`).join('')}
        </table>
        ${piano.daSalvare.length > 10 ? `<p class="nota">…e altri ${piano.daSalvare.length - 10}.</p>` : ''}
        <button class="btn primario" id="conferma">Importa ${piano.daSalvare.length} movimenti</button>` :
        (letti.length ? '<p>Niente di nuovo: tutti i movimenti erano già presenti.</p>' : '')}`;

    esito.querySelector('#conferma')?.addEventListener('click', async (e) => {
      e.target.disabled = true;
      await db.applicaImport(piano);
      esito.innerHTML = `
        <p class="ok">Fatto: ${nuovi} nuovi, ${aggiornati} aggiornati.</p>
        <p class="nota">Salva il backup per avere i dati aggiornati anche sull'altro dispositivo.</p>
        <div class="riga-form">
          <button class="btn primario" id="salva-dopo">${fileRicordabile ? 'Salva su OneDrive' : 'Scarica backup'}</button>
          <a class="btn" href="#/dashboard">Vai alla dashboard</a>
          <a class="btn" href="#/movimenti?filtro=daclassificare">Controlla i da classificare</a>
        </div>`;
      input.value = '';
      esito.querySelector('#salva-dopo').addEventListener('click', async () => {
        try {
          const nome = await salvaBackup();
          if (nome) avviso(`Backup salvato in ${nome}`);
        } catch (err) {
          avviso(`Salvataggio non riuscito: ${err.message}`);
        }
      });
    });
  }
}
