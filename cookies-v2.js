/* ============================================================
   R. Plane Carpenter — Cookie consent

   Google Analytics is the only non-essential thing this site
   loads. Under UK PECR that needs permission BEFORE it runs, so
   the tag is not in the pages at all — it is injected here, and
   only once someone has said yes.

   Say no and nothing is requested from Google: no script, no
   cookies, no data leaving the device.

   The choice itself is kept in localStorage rather than a cookie.
   Storing it is exempt from consent — it exists solely to honour
   a preference the visitor asked for — and it means declining
   does not, absurdly, require setting a cookie.
   ============================================================ */
(function () {
  'use strict';

  var GA_ID = 'G-DWB72DSV4H';
  var STORE = 'rpc-cookie-choice';
  var MAX_AGE_DAYS = 182;          // re-ask roughly every six months

  /* ---------- stored choice ---------- */

  function readChoice () {
    try {
      var raw = localStorage.getItem(STORE);
      if (!raw) return null;
      var v = JSON.parse(raw);
      if (!v || (v.choice !== 'granted' && v.choice !== 'denied')) return null;
      var age = (Date.now() - (v.at || 0)) / 86400000;
      if (age > MAX_AGE_DAYS) return null;     // expired — ask again
      return v.choice;
    } catch (e) {
      return null;                              // private mode, or corrupt
    }
  }

  function saveChoice (choice) {
    try { localStorage.setItem(STORE, JSON.stringify({ choice: choice, at: Date.now() })); }
    catch (e) { /* private browsing — the choice holds for this visit only */ }
  }

  /* ---------- analytics, loaded only on consent ---------- */

  var loaded = false;

  function startAnalytics () {
    if (loaded || !GA_ID) return;
    loaded = true;

    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };

    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(s);

    window.gtag('js', new Date());
    window.gtag('config', GA_ID, { anonymize_ip: true });
  }

  /**
   * Clear anything Google already left behind. Relevant when someone
   * accepts and later changes their mind — withdrawing consent should
   * actually remove what was set, not just stop adding more.
   */
  function clearAnalyticsCookies () {
    var host = location.hostname;
    var domains = ['', host, '.' + host];
    var root = host.split('.').slice(-2).join('.');
    if (root !== host) domains.push('.' + root);

    document.cookie.split(';').forEach(function (c) {
      var name = c.split('=')[0].trim();
      if (name.indexOf('_ga') !== 0 && name.indexOf('_gid') !== 0) return;
      domains.forEach(function (d) {
        document.cookie = name + '=; Max-Age=0; path=/' + (d ? '; domain=' + d : '');
      });
    });
  }

  /* ---------- the banner ---------- */

  var bar = null;

  function toast (text) {
    var el = document.createElement('div');
    el.className = 'ck-done';
    el.setAttribute('role', 'status');
    el.textContent = text;
    document.body.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('is-open'); });
    setTimeout(function () {
      el.classList.remove('is-open');
      setTimeout(function () { el.remove(); }, 320);
    }, 3200);
  }

  function decide (choice) {
    saveChoice(choice);
    if (choice === 'granted') startAnalytics();
    else clearAnalyticsCookies();

    if (bar) {
      bar.classList.remove('is-open');
      setTimeout(function () { if (bar) { bar.remove(); bar = null; } }, 440);
    }
    toast(choice === 'granted'
      ? 'Thank you — analytics turned on.'
      : 'No problem — analytics stays off.');
  }

  function build () {
    if (bar) return;

    bar = document.createElement('div');
    bar.className = 'ck';
    bar.setAttribute('role', 'dialog');
    bar.setAttribute('aria-live', 'polite');
    bar.setAttribute('aria-label', 'Cookie choice');
    bar.innerHTML =
      '<div class="ck-in">' +
        '<div class="ck-text">' +
          '<p class="ck-title">A quick question about cookies</p>' +
          '<p class="ck-body">I would like to use Google Analytics to see which pages ' +
            'people find useful. It sets a couple of cookies. Nothing is used for advertising, ' +
            'and saying no changes nothing about how the site works. ' +
            '<a href="privacy-policy.html">Read the privacy policy</a>.</p>' +
        '</div>' +
        '<div class="ck-acts">' +
          '<button type="button" class="ck-btn ck-no" data-ck="denied">No thanks</button>' +
          '<button type="button" class="ck-btn ck-yes" data-ck="granted">That’s fine</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(bar);
    requestAnimationFrame(function () { bar.classList.add('is-open'); });

    bar.addEventListener('click', function (e) {
      var b = e.target.closest('[data-ck]');
      if (b) decide(b.getAttribute('data-ck'));
    });
  }

  /* ---------- a way to change your mind ---------- */

  function addFooterControl () {
    document.querySelectorAll('a[href="privacy-policy.html"]').forEach(function (link) {
      var footer = link.closest('.footer-bottom, footer');
      if (!footer || footer.querySelector('.ck-reopen')) return;
      if (!link.parentNode || link.parentNode.querySelector('.ck-reopen')) return;

      var sep = document.createTextNode(' · ');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ck-reopen';
      btn.textContent = 'Cookie choice';
      btn.addEventListener('click', function () {
        try { localStorage.removeItem(STORE); } catch (e) { /* ignore */ }
        build();
      });
      link.parentNode.insertBefore(sep, link.nextSibling);
      link.parentNode.insertBefore(btn, sep.nextSibling);
    });
  }

  /* ---------- start ---------- */

  function init () {
    var choice = readChoice();
    if (choice === 'granted') startAnalytics();
    else if (choice === null) build();       // no choice yet, or it expired
    addFooterControl();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
