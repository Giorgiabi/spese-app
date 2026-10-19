import { db, caricaTutto } from '../db.js';
import { MACRO, regolaVale } from '../categorie.js';
import { esc, eur, avviso } from '../util.js';
import { fileRicordabile, infoBackup, salvaBackup, leggiBackupRicordato } from '../backup.js';

export async function vistaImpostazioni(el) {
  const { movimenti, regole, categorie, ripartizione } = await caricaTutto();
  const backup = await infoBackup();
  const spalmaDi = (c) => (ripartizione.mesi[c] > 1 ? String(ripartizione.mesi[c]) : ripartizione.anno.includes(c) ? 'anno' : '');
  const opzioniSpalma = (c) => [['', 'Non spalmare'], ['anno', "Sull'anno"], ['12', '12 mesi'], ['24', '2 anni'], ['36', '3 anni'], ['48', '4 anni'], ['60', '5 anni']]
    .map(([v, t]) => `<option value="${v}" ${spalmaDi(c) === v ? 'selected' : ''}>${t}</option>`).join('');
  const conteggi = {};
  for (const m of movimenti) conteggi[m.cat] = (conteggi[m.cat] || 0) + 1;
  // anche le categorie arrivate dalla banca che non sono ancora in elenco
  for (const c of Object.keys(conteggi)) if (!(c in categorie)) categorie[c] = 'desideri';
  const nomi = Object.keys(categorie).sort((a, b) => a.localeCompare(b, 'it'));
  const opzioniMacro = (sel) => Object.entries(MACRO).map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${v.nome}</option>`).join('');

  el.innerHTML = `
    <section>
      <h2>Categorie</h2>
      <p class="nota">Ogni categoria appartiene a una macro: è così che la dashboard calcola la regola 50/30/20.
        "Spalma" divide le spese di quella categoria nel tempo (vista competenza): sull'anno solare, oppure su 1–5 anni dal mese del pagamento.</p>
      <table class="tabella">
        ${nomi.map((c) => `
          <tr><td>${esc(c)}<small>${conteggi[c] || 0} movimenti</small></td>
          <td class="num">
            <select class="sel-spalma" data-cat="${esc(c)}" aria-label="Spalmatura di ${esc(c)}">${opzioniSpalma(c)}</select>
            <select data-cat="${esc(c)}" class="sel-macro" aria-label="Macro di ${esc(c)}">${opzioniMacro(categorie[c])}</select>
          </td></tr>`).join('')}
      </table>
      <form id="nuova-cat" class="riga-form">
        <input name="nome" placeholder="Nuova categoria, es. Affitto" required />
        <select name="macro" aria-label="Macro">${opzioniMacro('necessita')}</select>
        <button class="btn">Aggiungi</button>
      </form>
    </section>

    <section>
      <h2>Regole automatiche</h2>
      <p class="nota">Se l'operazione o i dettagli contengono il testo, il movimento prende quella categoria. Valgono anche per i movimenti già importati.</p>
      <table class="tabella">
        ${regole.map((r) => `<tr><td>"${esc(r.testo)}"${r.importo != null ? ` da ${eur(r.importo)}` : ''}${r.solo ? ` (solo ${r.solo})` : ''} → ${esc(r.categoria)}
            <small>${movimenti.filter((m) => regolaVale(r, m)).length} movimenti</small></td>
          <td class="num"><button class="btn" data-elimina="${r.id}">Elimina</button></td></tr>`).join('') || '<tr><td class="nota">Nessuna regola per ora.</td></tr>'}
      </table>
      <form id="nuova-regola" class="riga-form">
        <input name="testo" placeholder="Testo, es. B Petrol" required />
        <input name="importo" type="number" step="0.01" min="0" placeholder="Importo (facoltativo)" style="max-width:170px" />
        <select name="solo" aria-label="Tipo di movimento">
          <option value="">Entrate e uscite</option><option value="uscite">Solo uscite</option><option value="entrate">Solo entrate</option>
        </select>
        <select name="categoria" aria-label="Categoria">${nomi.map((c) => `<option>${esc(c)}</option>`).join('')}</select>
        <button class="btn">Aggiungi</button>
      </form>
    </section>

    <section>
      <h2>Backup e sincronizzazione</h2>
      <p class="nota">I dati sono salvati solo su questo dispositivo.
        ${fileRicordabile
          ? 'La prima volta scegli dove salvare il file (la cartella "Il mio Drive" di Google Drive): dalle volte successive viene sovrascritto lo stesso file.'
          : 'Il backup si apre in "Condividi": scegli "Salva su Drive". Per caricare i dati del PC usa "Carica backup" e scegli il file da Google Drive.'}</p>
      <p class="nota" id="info-backup">${backup.quando
        ? `Ultimo salvataggio: ${new Date(backup.quando).toLocaleString('it-IT', { dateStyle: 'medium', timeStyle: 'short' })}${backup.nomeFile ? ` · file <b>${esc(backup.nomeFile)}</b>` : ''}`
        : 'Nessun backup salvato finora.'}</p>
      <div class="riga-form">
        <button class="btn primario" id="salva-backup">Salva su Google Drive</button>
        ${fileRicordabile && backup.nomeFile ? '<button class="btn" id="carica-ricordato">Carica dal file salvato</button>' : ''}
        <label class="btn">Carica backup…<input type="file" id="ripristina" accept=".json,application/json" hidden /></label>
        ${fileRicordabile && backup.nomeFile ? '<button class="btn" id="cambia-file">Cambia file</button>' : ''}
      </div>
      <div class="riga-form">
        <button class="btn pericolo" id="cancella">Cancella tutti i dati</button>
      </div>
    </section>`;

  el.querySelectorAll('.sel-macro').forEach((s) => s.addEventListener('change', async () => {
    const mappa = (await db.leggi('categorie')) || {};
    mappa[s.dataset.cat] = s.value;
    await db.scrivi('categorie', mappa);
    avviso('Salvato');
  }));

  el.querySelector('#nuova-cat').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const nome = f.get('nome').trim();
    if (!nome) return;
    const mappa = (await db.leggi('categorie')) || {};
    mappa[nome] = f.get('macro');
    await db.scrivi('categorie', mappa);
    vistaImpostazioni(el);
  });

  el.querySelector('#nuova-regola').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const testo = f.get('testo').trim();
    if (!testo) return;
    const regola = { testo, categoria: f.get('categoria') };
    if (f.get('importo')) regola.importo = Number(f.get('importo'));
    if (f.get('solo')) regola.solo = f.get('solo');
    await db.salvaRegola(regola);
    vistaImpostazioni(el);
  });

  el.querySelectorAll('.sel-spalma').forEach((s) => s.addEventListener('change', async () => {
    const cat = s.dataset.cat;
    const anno = new Set(ripartizione.anno);
    const mesi = { ...ripartizione.mesi };
    anno.delete(cat);
    delete mesi[cat];
    if (s.value === 'anno') anno.add(cat);
    else if (s.value) mesi[cat] = Number(s.value);
    ripartizione.anno = [...anno];
    ripartizione.mesi = mesi;
    await db.scrivi('ripartite', ripartizione.anno);
    await db.scrivi('ripartiteMesi', mesi);
    avviso('Salvato');
  }));

  el.querySelectorAll('[data-elimina]').forEach((b) => b.addEventListener('click', async () => {
    await db.eliminaRegola(Number(b.dataset.elimina));
    vistaImpostazioni(el);
  }));

  const salva = async (sceltaNuova) => {
    try {
      const nome = await salvaBackup({ sceltaNuova });
      if (nome) { avviso(`Backup salvato in ${nome}`); vistaImpostazioni(el); }
    } catch (err) {
      avviso(`Salvataggio non riuscito: ${err.message}`);
    }
  };
  el.querySelector('#salva-backup').addEventListener('click', () => salva(false));
  el.querySelector('#cambia-file')?.addEventListener('click', () => salva(true));

  const ripristina = async (leggi) => {
    if (!confirm('Il backup sostituirà tutti i dati presenti su questo dispositivo. Continuare?')) return;
    try {
      const dati = await leggi();
      if (!dati) return;
      await db.ripristina(dati);
      avviso(`Backup caricato: ${dati.movimenti?.length ?? 0} movimenti`);
      vistaImpostazioni(el);
    } catch (err) {
      avviso(err.message || 'File non valido');
    }
  };
  el.querySelector('#carica-ricordato')?.addEventListener('click', () => ripristina(leggiBackupRicordato));
  el.querySelector('#ripristina').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) ripristina(async () => JSON.parse(await file.text()));
    e.target.value = '';
  });

  el.querySelector('#cancella').addEventListener('click', async () => {
    if (!confirm('Cancellare tutti i movimenti, le regole e le impostazioni da questo dispositivo?')) return;
    await db.cancellaTutto();
    avviso('Dati cancellati');
    vistaImpostazioni(el);
  });
}
