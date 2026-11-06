/*! Rent Car Service - patch NON destructif v1
 *
 * INSTALLATION (1 ligne, juste avant </body>, APRES vos scripts actuels) :
 *   <script src="rcs-patch.js" defer></script>
 *
 * Retrait : supprimez cette ligne, le site revient exactement comme avant.
 * Le patch n'écrase aucun gestionnaire existant, ne renomme aucun champ
 * et ignore silencieusement tout élément introuvable.
 */
(function () {
  'use strict';

  var CFG = {
    PHONE: '+261340000000',    // À REMPLACER : votre numéro (format international)
    WHATSAPP: '261340000000',  // À REMPLACER : même numéro, sans le +
    LOAD_TIMEOUT_MS: 8000,     // délai avant message "chargement lent"
    SUBMIT_GAP_MS: 3000        // anti double-clic sur les boutons d'envoi
  };

  function safe(fn, arg) {
    try { fn(arg); } catch (e) { if (window.console) console.warn('[rcs-patch]', e); }
  }

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  /* 1. Lien "Nous appeler" -> vrai lien téléphonique (sans toucher au reste) */
  function fixCallLinks(root) {
    var links = root.querySelectorAll('a[href="#"]');
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      if (/appeler/i.test(a.textContent || '') && !a.dataset.rcsFixed) {
        a.setAttribute('href', 'tel:' + CFG.PHONE.replace(/\s+/g, ''));
        a.dataset.rcsFixed = '1';
      }
    }
  }

  /* 2. Liens externes sécurisés */
  function hardenExternalLinks(root) {
    var links = root.querySelectorAll('a[target="_blank"]');
    for (var i = 0; i < links.length; i++) {
      var rel = (links[i].getAttribute('rel') || '').split(/\s+/);
      ['noopener', 'noreferrer'].forEach(function (v) {
        if (rel.indexOf(v) === -1) rel.push(v);
      });
      links[i].setAttribute('rel', rel.join(' ').trim());
    }
  }

  /* 3. Images : chargement différé + alt manquant (perf + accessibilité) */
  function improveImages(root) {
    var imgs = root.querySelectorAll('img');
    for (var i = 0; i < imgs.length; i++) {
      var img = imgs[i];
      if (!img.hasAttribute('loading') && !img.closest('header, .hero, [class*="hero"]')) {
        img.setAttribute('loading', 'lazy');
      }
      if (!img.hasAttribute('decoding')) img.setAttribute('decoding', 'async');
      if (!img.hasAttribute('alt')) {
        var card = img.closest('article, li, [class*="card"]');
        var h = card && card.querySelector('h1,h2,h3,h4');
        img.setAttribute('alt', h ? h.textContent.trim().slice(0, 120) : '');
      }
    }
  }

  /* 4. Champs : clavier adapté, autocomplete, longueurs maximales */
  function hardenInputs(root) {
    var fields = root.querySelectorAll('input, textarea');
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      if (f.dataset.rcsHardened) continue;
      f.dataset.rcsHardened = '1';
      var type = (f.getAttribute('type') || 'text').toLowerCase();
      if (['hidden', 'checkbox', 'radio', 'file', 'submit', 'button', 'date', 'time'].indexOf(type) !== -1) continue;

      var id = [f.id, f.name, f.placeholder, f.getAttribute('aria-label')].join(' ');

      if (/otp/i.test(id)) {
        f.setAttribute('inputmode', 'numeric');
        f.setAttribute('autocomplete', 'one-time-code');
        if (!f.maxLength || f.maxLength < 0) f.setAttribute('maxlength', '8');
      } else if (type === 'tel' || /t[ée]l|phone|whatsapp/i.test(id)) {
        f.setAttribute('inputmode', 'tel');
        if (!f.hasAttribute('autocomplete')) f.setAttribute('autocomplete', 'tel');
        if (!f.maxLength || f.maxLength < 0) f.setAttribute('maxlength', '20');
      } else if (type === 'email') {
        if (!f.hasAttribute('autocomplete')) f.setAttribute('autocomplete', 'email');
        if (!f.maxLength || f.maxLength < 0) f.setAttribute('maxlength', '120');
      } else if (!f.maxLength || f.maxLength < 0) {
        f.setAttribute('maxlength', f.tagName === 'TEXTAREA' ? '1500' : '150');
      }
    }
  }

  /* 5. Anti-spam : champ piège (sans attribut name => jamais envoyé par FormData)
        + blocage du double clic sur les boutons d'envoi */
  var honeypots = (typeof WeakMap === 'function') ? new WeakMap() : null;

  function addHoneypots(root) {
    if (!honeypots) return;
    var forms = root.querySelectorAll('form');
    for (var i = 0; i < forms.length; i++) {
      var form = forms[i];
      if (honeypots.has(form)) continue;
      var hp = document.createElement('input');
      hp.type = 'text';
      hp.tabIndex = -1;
      hp.setAttribute('autocomplete', 'off');
      hp.setAttribute('aria-hidden', 'true');
      hp.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;opacity:0;';
      form.appendChild(hp);
      honeypots.set(form, hp);
    }
  }

  function installSubmitGuards() {
    // Un robot qui remplit le champ piège est bloqué avant vos scripts (phase capture)
    document.addEventListener('submit', function (e) {
      var hp = honeypots && honeypots.get(e.target);
      if (hp && hp.value) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    }, true);

    // Anti double-clic sur les boutons d'envoi
    var SEND_RE = /confirmer et soumettre|envoyer ma demande|v[ée]rifier et t[ée]l[ée]charger/i;
    var last = new WeakMap();
    document.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('button, input[type="submit"]');
      if (!btn) return;
      var label = btn.textContent || btn.value || '';
      if (!SEND_RE.test(label)) return;
      var now = Date.now();
      if (last.has(btn) && now - last.get(btn) < CFG.SUBMIT_GAP_MS) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      last.set(btn, now);
    }, true);
  }

  /* 6. Si "Chargement..." reste affiché trop longtemps : message d'aide
        (le texte d'origine n'est pas supprimé) */
  function loadingFallback() {
    setTimeout(function () {
      var nodes = document.querySelectorAll('h1,h2,h3,h4,p,span,div');
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        if (n.children.length > 0 || !/^chargement/i.test((n.textContent || '').trim())) continue;
        if (n.dataset.rcsNotice) continue;
        n.dataset.rcsNotice = '1';
        var box = document.createElement('div');
        box.setAttribute('role', 'status');
        box.style.cssText = 'margin:12px 0;padding:12px 14px;border:1px solid #d9a441;' +
          'border-radius:10px;background:#fff8e6;color:#5a4300;font-size:14px;line-height:1.4;';
        box.innerHTML = 'Le chargement est plus long que prévu. ' +
          '<a href="" style="font-weight:600;">Actualiser</a> ou ' +
          '<a href="https://wa.me/' + CFG.WHATSAPP + '" target="_blank" rel="noopener noreferrer" ' +
          'style="font-weight:600;">nous écrire sur WhatsApp</a>.';
        n.insertAdjacentElement('afterend', box);

        // Retire le message dès que le contenu s'affiche
        var iv = setInterval(function (el, b) {
          return function () {
            if (!document.body.contains(el) || !/^chargement/i.test((el.textContent || '').trim())) {
              if (b.parentNode) b.parentNode.removeChild(b);
              clearInterval(iv);
            }
          };
        }(n, box), 1000);
      }
    }, CFG.LOAD_TIMEOUT_MS);
  }

  /* Application + contenu injecté dynamiquement par vos scripts */
  function enhance(root) {
    safe(fixCallLinks, root);
    safe(hardenExternalLinks, root);
    safe(improveImages, root);
    safe(hardenInputs, root);
    safe(addHoneypots, root);
  }

  ready(function () {
    enhance(document);
    safe(installSubmitGuards);
    safe(loadingFallback);

    if (typeof MutationObserver === 'function') {
      var timer = null;
      new MutationObserver(function () {
        clearTimeout(timer);
        timer = setTimeout(function () { enhance(document); }, 250);
      }).observe(document.body, { childList: true, subtree: true });
    }
  });
})();
