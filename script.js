// ── SCROLL PROGRESS ─────────────────────────────────────────────────────
var spbFill = document.getElementById('spb-fill');
if (spbFill) {
  window.addEventListener('scroll', function() {
    var d = document.documentElement;
    spbFill.style.width = (d.scrollTop / (d.scrollHeight - d.clientHeight) * 100) + '%';
  }, {passive:true});
}

// ── NAV GLASS ────────────────────────────────────────────────────────────
var navEl = document.getElementById('nav');
if (navEl) {
  window.addEventListener('scroll', function() { navEl.classList.toggle('scrolled', scrollY > 60); }, {passive:true});
}

// ── HAMBURGER ────────────────────────────────────────────────────────────
var menuBtn = document.getElementById('menuBtn');
var navLinks = document.getElementById('navLinks');
if (menuBtn && navLinks) {
  menuBtn.addEventListener('click', function() {
    var open = navLinks.classList.toggle('open');
    menuBtn.classList.toggle('open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
    document.body.style.overflow = open ? 'hidden' : '';
  });
  navLinks.querySelectorAll('a').forEach(function(a) {
    a.addEventListener('click', function() {
      navLinks.classList.remove('open');
      menuBtn.classList.remove('open');
      menuBtn.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    });
  });
}

// ── STAGGER: inline transition-delay ────────────────────────────────────
document.querySelectorAll('.svc-card').forEach(function(el, i) { el.style.transitionDelay = (i * 90) + 'ms'; });
document.querySelectorAll('#tileGrid .tile').forEach(function(el, i) { el.style.animationDelay = (i * 60) + 'ms'; });

// ── COUNTING ─────────────────────────────────────────────────────────────
requestAnimationFrame(function() {
  document.documentElement.classList.add('js-ok');
  function countUp(el, target, suffix, duration) {
    if (!el || el._done) return;
    el._done = true;
    el.textContent = '0' + suffix;
    var t0 = null;
    function frame(ts) {
      if (!t0) t0 = ts;
      var p = Math.min((ts - t0) / duration, 1);
      var e = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * e) + suffix;
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
  var hse = document.querySelector('.hero-stats');
  if (hse) {
    var heroIO = new IntersectionObserver(function(entries) {
      if (!entries[0].isIntersecting) return;
      countUp(document.getElementById('cnt-years'),    20,  '+',  1400);
      countUp(document.getElementById('cnt-projects'), 250, '+',  1800);
      countUp(document.getElementById('cnt-stars'),    5,   '★', 1200);
      countUp(document.getElementById('cnt-bespoke'),  100, '%',  1600);
      heroIO.disconnect();
    }, {threshold: 0.35});
    heroIO.observe(hse);
  }
  var ase = document.querySelector('.about-stats');
  if (ase) {
    var aboutIO = new IntersectionObserver(function(entries) {
      if (!entries[0].isIntersecting) return;
      countUp(document.getElementById('astat-proj'), 250, '+',  1800);
      countUp(document.getElementById('astat-rev'),  5,   '★', 1200);
      aboutIO.disconnect();
    }, {threshold: 0.35});
    aboutIO.observe(ase);
  }
  if (window.matchMedia('(hover:none)').matches) {
    var svcIO = new IntersectionObserver(function(entries) {
      entries.forEach(function(e) {
        if (e.isIntersecting) { e.target.classList.add('scrolled-in'); svcIO.unobserve(e.target); }
      });
    }, {threshold: 0.4});
    document.querySelectorAll('.svc-card').forEach(function(c) { svcIO.observe(c); });
  }
});

// ── SCROLL REVEAL ────────────────────────────────────────────────────────
var revObs = new IntersectionObserver(function(entries) {
  entries.forEach(function(e) {
    if (e.isIntersecting) { e.target.classList.add('in'); revObs.unobserve(e.target); }
  });
}, {threshold: 0.1});
document.querySelectorAll('.reveal,.reveal-left,.reveal-right,.reveal-scale').forEach(function(el) {
  revObs.observe(el);
});

// ── TILE GRID REVEAL ──────────────────────────────────────────────────────
var tg = document.getElementById('tileGrid');
if (tg) {
  var tileIO = new IntersectionObserver(function(entries) {
    if (!entries[0].isIntersecting) return;
    document.querySelectorAll('#tileGrid .tile').forEach(function(t) { t.classList.add('in'); });
    tileIO.disconnect();
  }, {threshold: 0.05});
  tileIO.observe(tg);
}

// ── MAGNETIC GALLERY HOVER ────────────────────────────────────────────────
document.querySelectorAll('#tileGrid .tile').forEach(function(tile) {
  tile.addEventListener('mousemove', function(e) {
    var r = tile.getBoundingClientRect();
    var x = ((e.clientX - r.left) / r.width  - 0.5) * 2;
    var y = ((e.clientY - r.top)  / r.height - 0.5) * 2;
    tile.style.transform = 'perspective(700px) rotateY(' + (x * 8) + 'deg) rotateX(' + (-y * 8) + 'deg) translateY(-6px) scale(1.02)';
    tile.style.boxShadow = (-x * 16) + 'px ' + (20 - y * 8) + 'px 44px rgba(0,0,0,.58)';
    tile.style.transition = 'transform .12s ease,box-shadow .12s ease';
  });
  tile.addEventListener('mouseleave', function() {
    tile.style.transform = '';
    tile.style.boxShadow = '';
    tile.style.transition = '';
  });
});

// ── GALLERY FILTER ────────────────────────────────────────────────────────
document.querySelectorAll('#filterTabs .f-tab').forEach(function(btn) {
  btn.addEventListener('click', function() {
    document.querySelectorAll('#filterTabs .f-tab').forEach(function(t) { t.classList.remove('active'); });
    btn.classList.add('active');
    var cat = btn.dataset.cat;
    document.querySelectorAll('#tileGrid .tile').forEach(function(tile) {
      tile.style.display = (cat === 'all' || tile.dataset.cat === cat) ? '' : 'none';
    });
  });
});

// ── HERO PARALLAX ─────────────────────────────────────────────
(function () {
  if (window.matchMedia('(prefers-reduced-motion:reduce)').matches) return;

  var isMobile = window.matchMedia('(max-width:768px)').matches;
  var rawSy = 0, smHeroP = 0, rafId = null;

  function lerp(a, b, t) { return a + (b - a) * t; }

  var heroBg      = document.querySelector('.hero-bg');
  var heroCopyEl  = document.querySelector('.hero-copy');
  var heroStatsEl = document.querySelector('.hero-stats');
  var heroEl      = document.querySelector('.hero');
  var heroVig     = document.querySelector('.hero-vignette');

  if (heroBg) heroBg.style.willChange = 'transform';

  function runHero() {
    if (!heroEl || !heroBg) return;
    var h = heroEl.offsetHeight;
    var rawP = Math.max(0, Math.min(1, rawSy / h));
    smHeroP = lerp(smHeroP, rawP, 0.09);
    var p = smHeroP;

    if (rawSy >= h) {
      heroBg.style.transform = '';
      if (heroVig) heroVig.style.opacity = '0';
      return;
    }

    if (!isMobile) {
      heroBg.style.transform = [
        'perspective(1200px)',
        'scale(' + (1 + p * 0.09).toFixed(4) + ')',
        'translateY(' + (p * -44).toFixed(1) + 'px)',
        'rotateZ(' + (p * 2.2).toFixed(3) + 'deg)',
        'rotateX(' + (p * 0.9).toFixed(3) + 'deg)',
      ].join(' ');
      if (heroCopyEl)  { heroCopyEl.style.opacity  = String(Math.max(0, 1 - p * 2.4)); heroCopyEl.style.transform  = 'translateY(' + (p * -72).toFixed(1) + 'px)'; }
      if (heroStatsEl) { heroStatsEl.style.opacity = String(Math.max(0, 1 - p * 2.8)); heroStatsEl.style.transform = 'translateY(' + (p * -44).toFixed(1) + 'px)'; }
    } else {
      heroBg.style.transform = 'scale(' + (1 + p * 0.05).toFixed(4) + ') translateY(' + (p * -18).toFixed(1) + 'px) rotateZ(' + (p * 0.8).toFixed(3) + 'deg)';
    }

    if (heroVig) {
      heroVig.style.opacity  = (Math.sin(p * Math.PI) * 0.55).toFixed(3);
      heroVig.style.transform = 'translate(' + (p * 20).toFixed(1) + 'px,' + (p * -12).toFixed(1) + 'px)';
    }
  }

  function loop() {
    rawSy = window.pageYOffset;
    runHero();
    rafId = requestAnimationFrame(loop);
  }

  rafId = requestAnimationFrame(loop);

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { cancelAnimationFrame(rafId); rafId = null; }
    else if (!rafId)     { rafId = requestAnimationFrame(loop); }
  });
}());

// ── SHOWCASE COMPARISON SLIDER ─────────────────────────────────
(function () {
  var comp    = document.getElementById('scComp');
  var before  = document.getElementById('scBefore');
  var divider = document.getElementById('scDivider');
  var handle  = document.getElementById('scHandle');
  var tagB    = document.getElementById('scTagB');
  var tagA    = document.getElementById('scTagA');
  var imgA    = document.getElementById('scImgAfter');
  var imgB    = document.getElementById('scImgBefore');
  var stage   = document.getElementById('scStage');
  if (!comp || !before || !divider) return;

  var reduced  = window.matchMedia('(prefers-reduced-motion:reduce)').matches;
  var target   = reduced ? 50 : 20;
  var current  = target;
  var dragging = false;
  var rafId    = null;

  function lerp(a, b, t) { return a + (b - a) * t; }

  function setPos(pct) {
    before.style.clipPath = 'inset(0 ' + (100 - pct).toFixed(3) + '% 0 0)';
    divider.style.left    = pct.toFixed(3) + '%';
    if (handle) handle.setAttribute('aria-valuenow', Math.round(pct));
    if (tagB) tagB.style.opacity = pct < 12 ? '0' : '1';
    if (tagA) tagA.style.opacity = pct > 88 ? '0' : '1';
  }

  function tick() {
    current = reduced ? target : lerp(current, target, 0.08);
    setPos(current);
    rafId = requestAnimationFrame(tick);
  }

  function getPct(e) {
    var r = comp.getBoundingClientRect();
    var x = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
    return Math.max(2, Math.min(98, x / r.width * 100));
  }

  comp.addEventListener('mousedown', function (e) { dragging = true; target = getPct(e); e.preventDefault(); });
  window.addEventListener('mousemove', function (e) { if (dragging) target = getPct(e); });
  window.addEventListener('mouseup', function () { dragging = false; });

  comp.addEventListener('touchstart', function (e) { dragging = true; target = getPct(e); }, { passive: true });
  window.addEventListener('touchmove', function (e) { if (dragging) target = getPct(e); }, { passive: true });
  window.addEventListener('touchend', function () { dragging = false; });

  if (handle) {
    handle.addEventListener('keydown', function (e) {
      var step = e.shiftKey ? 10 : 2;
      if (e.key === 'ArrowLeft')  { target = Math.max(2,  target - step); e.preventDefault(); }
      if (e.key === 'ArrowRight') { target = Math.min(98, target + step); e.preventDefault(); }
    });
  }

  [imgA, imgB].forEach(function (img) {
    if (!img) return;
    if (img.complete && img.naturalWidth) { img.classList.add('sc-loaded'); }
    else { img.addEventListener('load', function () { img.classList.add('sc-loaded'); }); }
  });

  var scrollTick = false;
  function onScroll() {
    if (scrollTick || reduced) return;
    scrollTick = true;
    requestAnimationFrame(function () {
      var r  = comp.getBoundingClientRect();
      var vh = window.innerHeight;
      var p  = Math.max(0, Math.min(1, (vh - r.top) / (vh + r.height)));
      var ty = ((p - 0.5) * 36).toFixed(1);
      if (imgA) imgA.style.transform = 'scale(1.08) translateY(' + ty + 'px)';
      if (imgB) imgB.style.transform = 'scale(1.08) translateY(' + ty + 'px)';
      scrollTick = false;
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  var entered = false;
  var io = new IntersectionObserver(function (entries) {
    if (entries[0].isIntersecting && !entered) {
      entered = true;
      if (stage) stage.classList.add('sc-in');
      setTimeout(function () { target = 50; }, reduced ? 0 : 500);
      io.disconnect();
    }
  }, { threshold: 0.2 });
  io.observe(comp);

  rafId = requestAnimationFrame(tick);

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { cancelAnimationFrame(rafId); rafId = null; }
    else if (!rafId) { rafId = requestAnimationFrame(tick); }
  });
}());

// ── SERVICE CARD TILT ─────────────────────────────────────────
if (!window.matchMedia('(hover:none)').matches) {
  document.querySelectorAll('.svc-card').forEach(function (card) {
    card.addEventListener('mousemove', function (e) {
      var r = card.getBoundingClientRect();
      var x = ((e.clientX - r.left) / r.width  - 0.5) * 2;
      var y = ((e.clientY - r.top)  / r.height - 0.5) * 2;
      card.style.transform  = 'perspective(900px) rotateY(' + (x * 3.5) + 'deg) rotateX(' + (-y * 3.5) + 'deg) translateY(-3px)';
      card.style.transition = 'transform .1s ease';
    });
    card.addEventListener('mouseleave', function () {
      card.style.transform  = '';
      card.style.transition = 'transform .6s cubic-bezier(.22,.68,0,1.2)';
    });
  });
}

// ── CONTACT FORM ──────────────────────────────────────────────────────────
var formBtn = document.getElementById('formBtn');
if (formBtn) {
  formBtn.addEventListener('click', function() {
    var w = document.querySelector('.form-wrap');
    var v = function(s) { return (w.querySelector(s) || {}).value || ''; };
    var sub  = encodeURIComponent('Carpentry enquiry — ' + v('input[type=text]'));
    var body = encodeURIComponent('Name: ' + v('input[type=text]') + '\nPhone: ' + v('input[type=tel]') + '\nEmail: ' + v('input[type=email]') + '\nProject: ' + v('select') + '\n\n' + v('textarea'));
    if (typeof gtag === 'function') gtag('event', 'form_submit', { method: 'contact_form' });
    window.location.href = 'mailto:rplanecarpenter@hotmail.co.uk?subject=' + sub + '&body=' + body;
  });
}

/* ---- GA4 phone + email click tracking ---- */
document.addEventListener('click', function (e) {
  if (typeof gtag !== 'function') return;
  var a = e.target.closest('a[href]');
  if (!a) return;
  var href = a.getAttribute('href') || '';
  if (href.startsWith('tel:')) {
    gtag('event', 'phone_click', { phone_number: href.replace('tel:', '') });
  } else if (href.startsWith('mailto:')) {
    gtag('event', 'email_click', { email_address: href.replace('mailto:', '').split('?')[0] });
  }
}, { passive: true });
