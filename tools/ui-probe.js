/* Sonde injectée à l'identique dans l'application et dans la référence (banc compare-ui).
   Actions sur l'interface (par les textes visibles, communs aux deux) et relevés comparables. */
window.T = {
  // champs présents seulement dans l'application (préfixes de libellé), ignorés dans les relevés
  skip: [],
  // textes renommés volontairement dans l'application → texte de la référence
  rename: {},
  toasts: [],

  init(skip, rename) {
    T.skip = skip; T.rename = rename;
    const t = document.querySelector('.toast');
    // un message est relevé quand il apparaît ou change (pas à chaque modification de la page)
    let seen = '';
    new MutationObserver(() => {
      const now = !t.hidden && t.textContent ? t.textContent : '';
      if (now && now !== seen) T.toasts.push(now);
      seen = now;
    }).observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
    // presse-papiers simulé : on garde le texte copié
    navigator.clipboard.writeText = (s) => { T.copied = s; return Promise.resolve(); };
    // les liens de téléchargement de la référence (et du repli navigateur) sont relevés
    T.downloads = [];
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { if (this.download) T.downloads.push(this.download); return click.call(this); };
  },

  shown: (el) => el.getClientRects().length > 0,
  norm: (s) => (s || '').replace(/\s+/g, ' ').trim(),
  find(sel, text) {
    const els = [...document.querySelectorAll(sel)].filter((e) => T.norm(e.textContent).includes(text));
    const el = els.find(T.shown) || els[0];
    if (!el) throw new Error(`introuvable : ${sel} « ${text} »`);
    return el;
  },
  btn(text, sel = 'button') { T.find(sel, text).click(); },
  el(sel) { const e = document.querySelector(sel); if (!e) throw new Error('introuvable : ' + sel); e.click(); },
  // champ dont le libellé (sans le terme en italique) est exactement `label`, visible de préférence ;
  // à défaut, le premier dont le libellé commence par `label`
  field(label) {
    const own = (l) => T.norm([...l.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(''));
    const fields = [...document.querySelectorAll('.field')].filter((f) => f.querySelector('label'));
    const exact = fields.filter((f) => own(f.querySelector('label')) === label);
    const starts = fields.filter((f) => T.norm(f.querySelector('label').textContent).startsWith(label));
    const f = exact.find(T.shown) || exact[0] || starts.find(T.shown) || starts[0];
    if (!f) throw new Error('champ introuvable : ' + label);
    return f;
  },
  setValue(input, v, event = 'input') {
    const proto = input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, String(v));
    input.dispatchEvent(new Event(event, { bubbles: true }));
  },
  slider(label, v) { T.setValue(T.field(label).querySelector('input[type=range]'), v); },
  check(text, on) {
    const ls = [...document.querySelectorAll('label.check, label.switch')].filter((l) => T.norm(l.textContent).startsWith(text));
    const l = ls.find(T.shown) || ls[0];
    if (!l) throw new Error('case introuvable : ' + text);
    const i = l.querySelector('input'); if (i.checked !== on) i.click();
  },
  // n-ième sélecteur de couleur visible dont le libellé contient text
  color(text, v) {
    const l = [...document.querySelectorAll('label.colorfield')].filter(T.shown).find((l) => T.norm(l.textContent).includes(text));
    if (!l) throw new Error('couleur introuvable : ' + text);
    T.setValue(l.querySelector('input[type=color]'), v);
  },

  // image de test identique dans les deux pages
  async file(w, h, name) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#1b3a8c'); g.addColorStop(1, '#f2c14e');
    x.fillStyle = '#f4f4f4'; x.fillRect(0, 0, w, h);
    x.fillStyle = g; x.beginPath(); x.arc(w / 2, h / 2, Math.min(w, h) / 3, 0, 7); x.fill();
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    return new File([blob], name, { type: 'image/png' });
  },
  async paste(w, h) {
    const dt = new DataTransfer(); dt.items.add(await T.file(w, h, 'colle.png'));
    window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  },
  async drop(w, h) {
    const dt = new DataTransfer(); dt.items.add(await T.file(w, h, 'depose.png'));
    window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt }));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const veil = !document.querySelector('.dropveil').hidden;
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, cancelable: true }));
    return 'voile ' + veil;
  },

  // empreinte des pixels d'un canvas
  hash(sel) {
    const c = document.querySelector(sel);
    if (!c) return '(absent)';
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let h = 2166136261; for (let i = 0; i < d.length; i++) { h ^= d[i]; h = Math.imul(h, 16777619); }
    return c.width + '×' + c.height + ' ' + (h >>> 0).toString(16);
  },
  // état visible des contrôles d'une zone, une ligne par élément, dans l'ordre du document
  ui(rootSel) {
    const root = document.querySelector(rootSel);
    if (!root || !T.shown(root)) return ['(masqué)'];
    const skipped = [...root.querySelectorAll('.field')].filter((f) => { const l = f.querySelector('label'); return l && T.skip.some((s) => T.norm(l.textContent).startsWith(s)); });
    const txt = (el) => { const t = T.norm(el.textContent); return T.rename[t] || t; };
    const out = [];
    for (const el of root.querySelectorAll('.drop,h2,h3,label,output,button,input,select,textarea,p,.stats,code,em,[aria-disabled],.neon-bar,summary,kbd,figcaption')) {
      if (!T.shown(el) || skipped.some((f) => f.contains(el))) continue;
      // zone de dépôt : <label> + champ fichier dans la référence, bouton (boîte native) dans l'application
      if (el.classList.contains('drop')) { out.push('zone de dépôt ' + [...el.children].filter((c) => c.tagName !== 'INPUT').map(txt).join(' ') + (el.classList.contains('over') ? ' (survol)' : '')); continue; }
      if (el.closest('.drop')) continue;
      const tag = el.tagName.toLowerCase();
      if (el.matches('[aria-disabled]') && !el.matches('button')) { out.push('bloc désactivé=' + el.getAttribute('aria-disabled')); continue; }
      if (tag === 'h2' || tag === 'h3') out.push('titre ' + txt(el));
      else if (tag === 'label') out.push('libellé ' + txt(el));
      else if (tag === 'output') out.push('valeur ' + txt(el));
      else if (tag === 'button') out.push(`bouton ${txt(el) || el.getAttribute('aria-label') || el.title}` + (el.hasAttribute('aria-pressed') ? ' pressé=' + el.getAttribute('aria-pressed') : '') + (el.hasAttribute('aria-selected') ? ' choisi=' + el.getAttribute('aria-selected') : '') + (el.disabled ? ' inactif' : ''));
      else if (tag === 'input') {
        if (el.type === 'range') out.push(`curseur ${el.min}→${el.max} pas ${el.step} = ${el.value}`);
        else if (el.type === 'checkbox') out.push('case ' + el.checked);
        else if (el.type === 'color') out.push('couleur ' + el.value);
        else out.push(`texte « ${el.value} »`);
      }
      else if (tag === 'select') out.push(`liste ${el.value} (${[...el.options].map((o) => o.textContent).join(' / ')})`);
      else if (tag === 'textarea') out.push(`zone ${el.value.length} car.`);
      else if (el.classList.contains('neon-bar')) out.push('barre ' + getComputedStyle(el).backgroundImage);
      else if (tag === 'p' || el.classList.contains('stats')) out.push('texte ' + txt(el));
      else out.push(tag + ' ' + txt(el));
    }
    return out;
  },
  // calque du tracé plume
  pen() {
    const d = (s) => { const e = document.querySelector(s); return e && T.shown(e) ? e.getAttribute('d') || '' : ''; };
    // l'ordre des classes n'a pas d'effet : elles sont triées
    const anchors = [...document.querySelectorAll('.pen-anchor')].filter(T.shown).map((a) => [...a.classList].filter((c) => c !== 'pen-anchor').sort().join(' ') || '·').join(',');
    return ['tracé ' + d('.cu-line'), 'prolongements ' + d('.cu-ext'), 'élastique ' + d('.cu-rubber'), 'poignées ' + d('.cu-arms'), 'points ' + anchors, 'boutons de poignée ' + [...document.querySelectorAll('.pen-knob')].filter(T.shown).length, 'calque ' + document.querySelector('.cwrap').className.split(' ').sort().join(' ')];
  },
  rect(sel) { const b = document.querySelector(sel).getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; }
};
