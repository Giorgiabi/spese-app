import './style.css';
import { vistaDashboard } from './viste/dashboard.js';
import { vistaMovimenti } from './viste/movimenti.js';
import { vistaImporta } from './viste/importa.js';
import { vistaImpostazioni } from './viste/impostazioni.js';
import { vistaInvestimenti } from './viste/investimenti.js';
import { vistaConfronto } from './viste/confronto.js';

const viste = {
  dashboard: vistaDashboard,
  movimenti: vistaMovimenti,
  investimenti: vistaInvestimenti,
  confronto: vistaConfronto,
  importa: vistaImporta,
  impostazioni: vistaImpostazioni,
};

async function naviga() {
  const [nome, query] = location.hash.replace(/^#\/?/, '').split('?');
  const chiave = viste[nome] ? nome : 'dashboard';
  document.querySelectorAll('nav a').forEach((a) => a.classList.toggle('attivo', a.dataset.r === chiave));
  const el = document.getElementById('vista');
  el.innerHTML = '';
  await viste[chiave](el, new URLSearchParams(query || ''));
}

addEventListener('hashchange', naviga);
naviga();
