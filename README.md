# Spese mensili

Piccola app (PWA) per analizzare spese, entrate e investimenti a partire dagli export
"Lista operazioni" di Intesa Sanpaolo (.xlsx).

- I dati restano **solo sul dispositivo** (IndexedDB del browser): nessun server.
- Per passare i dati tra PC e telefono: Impostazioni → Backup (file `.json`, es. su OneDrive).
- Installabile su Android e PC da Chrome/Edge ("Installa app" / "Aggiungi a schermata Home").

## Sviluppo

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # crea dist/
```

Le regole personali vanno in `src/personale.js` (escluso da Git), con questo formato:

```js
export const REGOLE_PERSONALI = [
  { v: 1, testo: 'Testo da cercare', importo: 100, solo: 'uscite', categoria: 'Categoria' },
];
```

La pubblicazione su GitHub Pages è automatica a ogni push su `main` (`.github/workflows/pubblica.yml`).
