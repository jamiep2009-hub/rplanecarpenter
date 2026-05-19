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

// ── PREMIUM SCROLL ANIMATIONS ────────────────────────────────
(function () {
  if (window.matchMedia('(prefers-reduced-motion:reduce)').matches) return;

  var isMobile = window.matchMedia('(max-width:768px)').matches;
  var rawSy = 0, smHeroP = 0, rafId = null;

  function lerp(a, b, t) { return a + (b - a) * t; }

  // — Hero elements —
  var heroBg      = document.querySelector('.hero-bg');
  var heroCopyEl  = document.querySelector('.hero-copy');
  var heroStatsEl = document.querySelector('.hero-stats');
  var heroEl      = document.querySelector('.hero');
  var heroVig     = document.querySelector('.hero-vignette');

  // — Story elements —
  var storyEl     = document.getElementById('story');
  var storyImg    = storyEl && storyEl.querySelector('.story-img');
  var storyBg     = storyEl && storyEl.querySelector('.story-bg-blur');
  var storyOv     = storyEl && storyEl.querySelector('.story-overlay');
  var storyGlow   = storyEl && storyEl.querySelector('.story-glow');
  var storyLab1   = storyEl && storyEl.querySelector('.s-label-1');
  var storyLab2   = storyEl && storyEl.querySelector('.s-label-2');
  var storyStages = storyEl ? Array.from(storyEl.querySelectorAll('.story-stage')) : [];
  var storyProg   = storyEl && storyEl.querySelector('.story-progress-fill');

  if (heroBg)   heroBg.style.willChange   = 'transform';
  if (storyImg) storyImg.style.willChange = 'transform';

  // Trapezoidal fade envelope: fade in [i→f], hold [f→o], fade out [o→d]
  function env(p, i, f, o, d) {
    if (p <= i || p >= d) return 0;
    if (p < f) return (p - i) / (f - i);
    if (p < o) return 1;
    return 1 - (p - o) / (d - o);
  }

  // Stage timing table [inAt, fullAt, outAt, doneAt]
  var ST = [
    [0,    0.06, 0.20, 0.26],
    [0.22, 0.28, 0.44, 0.50],
    [0.47, 0.53, 0.69, 0.75],
    [0.72, 0.78, 0.93, 1.00],
  ];

  // ── Hero parallax (LERP-smoothed) ─────────────────────────
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

  // ── Story section ─────────────────────────────────────────
  function runStory() {
    if (!storyEl || !storyImg) return;
    var rect  = storyEl.getBoundingClientRect();
    var total = storyEl.offsetHeight - window.innerHeight;
    if (total <= 0) return;
    var p = Math.max(0, Math.min(1, -rect.top / total));

    storyImg.style.transform = [
      'scale('       + (0.88 + p * 0.16).toFixed(4)                   + ')',
      'perspective(1400px)',
      'rotateY('     + (Math.sin(p * Math.PI) * 2.5).toFixed(3)       + 'deg)',
      'rotateX('     + (Math.sin(p * Math.PI * 0.7) * 1.2).toFixed(3) + 'deg)',
      'translateX('  + ((p - 0.5) * 22).toFixed(1)                    + 'px)',
    ].join(' ');

    if (storyOv)                 storyOv.style.opacity   = (0.60 - p * 0.36).toFixed(3);
    if (storyBg && !isMobile)    storyBg.style.opacity   = (Math.min(p * 5, 1) * 0.22).toFixed(3);
    if (storyGlow)               storyGlow.style.opacity = (Math.sin(p * Math.PI) * 0.85).toFixed(3);

    var lop = env(p, 0.22, 0.30, 0.44, 0.51);
    if (storyLab1) { storyLab1.style.opacity = lop.toFixed(3); storyLab1.style.transform = 'translateX(' + ((1 - lop) * -22).toFixed(1) + 'px)'; }
    if (storyLab2) { storyLab2.style.opacity = lop.toFixed(3); storyLab2.style.transform = 'translateX(' + ((1 - lop) *  22).toFixed(1) + 'px)'; }

    storyStages.forEach(function (stage, i) {
      var t = ST[i]; if (!t) return;
      var op = env(p, t[0], t[1], t[2], t[3]);
      var ty = p < t[1] ? (1 - op) * 32 : -(1 - op) * 22;
      stage.style.opacity   = op.toFixed(3);
      stage.style.transform = 'translateY(' + ty.toFixed(1) + 'px)';
    });

    if (storyProg) storyProg.style.width = (p * 100).toFixed(1) + '%';
  }

  function loop() {
    rawSy = window.pageYOffset;
    runHero();
    runStory();
    rafId = requestAnimationFrame(loop);
  }

  rafId = requestAnimationFrame(loop);

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { cancelAnimationFrame(rafId); rafId = null; }
    else if (!rafId)     { rafId = requestAnimationFrame(loop); }
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
    window.location.href = 'mailto:rplanecarpenter@hotmail.co.uk?subject=' + sub + '&body=' + body;
  });
}
