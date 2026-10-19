// Backup su un file scelto dall'utente (es. nella cartella di Google Drive), sovrascritto a ogni salvataggio.
// Su PC (Chrome/Edge) il file viene ricordato; sul telefono si apre "Condividi" (→ Salva su Drive).
import { db } from './db.js';

const NOME = 'spese-backup.json';
const TIPI = [{ description: 'Backup Spese mensili', accept: { 'application/json': ['.json'] } }];
export const fileRicordabile = 'showSaveFilePicker' in window;

async function permesso(handle) {
  const opz = { mode: 'readwrite' };
  if ((await handle.queryPermission(opz)) === 'granted') return true;
  return (await handle.requestPermission(opz)) === 'granted';
}

export async function infoBackup() {
  const [handle, quando] = await Promise.all([db.leggi('fileBackup'), db.leggi('ultimoBackup')]);
  return { nomeFile: handle?.name || null, quando: quando || null };
}

// Restituisce il nome del file salvato, oppure null se l'utente ha annullato
export async function salvaBackup({ sceltaNuova = false } = {}) {
  const testo = JSON.stringify(await db.esporta());
  if (!fileRicordabile) {
    // Telefono: menu Condividi di Android, da cui si sceglie "Salva su Drive"
    const file = new File([testo], NOME, { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Backup Spese mensili' });
      } catch (err) {
        if (err.name === 'AbortError') return null;
        throw err;
      }
      await db.scrivi('ultimoBackup', new Date().toISOString());
      return 'Google Drive';
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([testo], { type: 'application/json' }));
    a.download = NOME;
    a.click();
    URL.revokeObjectURL(a.href);
    await db.scrivi('ultimoBackup', new Date().toISOString());
    return NOME;
  }
  let handle = sceltaNuova ? null : await db.leggi('fileBackup');
  if (handle && !(await permesso(handle))) handle = null;
  if (!handle) {
    try {
      handle = await window.showSaveFilePicker({ suggestedName: NOME, types: TIPI });
    } catch (err) {
      if (err.name === 'AbortError') return null;
      throw err;
    }
    await db.scrivi('fileBackup', handle);
  }
  const w = await handle.createWritable();
  await w.write(testo);
  await w.close();
  await db.scrivi('ultimoBackup', new Date().toISOString());
  return handle.name;
}

// Legge il backup dal file ricordato (PC) oppure da un file scelto
export async function leggiBackupRicordato() {
  const handle = await db.leggi('fileBackup');
  if (!handle || !(await permesso(handle))) return null;
  return JSON.parse(await (await handle.getFile()).text());
}
