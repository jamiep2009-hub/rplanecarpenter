// ── SCROLL PROGRESS ─────────────────────────────────────────────────────
const spbFill = document.getElementById('spb-fill');
window.addEventListener('scroll', () => {
  const d = document.documentElement;
  spbFill.style.width = (d.scrollTop / (d.scrollHeight - d.clientHeight) * 100) + '%';
}, {passive:true});

// ── NAV GLASS ────────────────────────────────────────────────────────────
const navEl = document.getElementById('nav');
window.addEventListener('scroll', () => navEl.classList.toggle('scrolled', scrollY > 60), {passive:true});

// ── HAMBURGER ────────────────────────────────────────────────────────────
const navLinks = document.getElementById('navLinks');
const menuBtn = document.getElementById('menuBtn');
navLinks.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
  navLinks.classList.remove('open'); menuBtn.classList.remove('open'); document.body.style.overflow = '';
}));

// ── STAGGER: inline transition-delay (avoids :nth-child conflicts) ───────
document.querySelectorAll('.svc-card').forEach((el, i) => el.style.transitionDelay = (i * 90) + 'ms');
document.querySelectorAll('#tileGrid .tile').forEach((el, i) => el.style.animationDelay  = (i * 60) + 'ms');

// ── COUNTING: CSS @property handles Quick Look; rAF JS takes over in Safari ─
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
  var heroIO = new IntersectionObserver(function(entries) {
    if (!entries[0].isIntersecting) return;
    countUp(document.getElementById('cnt-years'),    20,  '+',  1400);
    countUp(document.getElementById('cnt-projects'), 250, '+',  1800);
    countUp(document.getElementById('cnt-stars'),    5,   '★', 1200);
    countUp(document.getElementById('cnt-bespoke'),  100, '%',  1600);
    heroIO.disconnect();
  }, {threshold: 0.35});
  var hse = document.querySelector('.hero-stats');
  if (hse) heroIO.observe(hse);
  var aboutIO = new IntersectionObserver(function(entries) {
    if (!entries[0].isIntersecting) return;
    countUp(document.getElementById('astat-proj'), 250, '+',  1800);
    countUp(document.getElementById('astat-rev'),  5,   '★', 1200);
    aboutIO.disconnect();
  }, {threshold: 0.35});
  var ase = document.querySelector('.about-stats');
  if (ase) aboutIO.observe(ase);
  if (window.matchMedia('(hover:none)').matches) {
    var svcIO = new IntersectionObserver(function(entries) {
      entries.forEach(function(e) {
        if (e.isIntersecting) { e.target.classList.add('scrolled-in'); svcIO.unobserve(e.target); }
      });
    }, {threshold: 0.4});
    document.querySelectorAll('.svc-card').forEach(function(c) { svcIO.observe(c); });
  }
});

// ── SCROLL REVEAL (threshold 0.1) ────────────────────────────────────────
var revObs = new IntersectionObserver(function(entries) {
  entries.forEach(function(e) {
    if (e.isIntersecting) { e.target.classList.add('in'); revObs.unobserve(e.target); }
  });
}, {threshold: 0.1});
document.querySelectorAll('.reveal,.reveal-left,.reveal-right,.reveal-scale').forEach(function(el) {
  revObs.observe(el);
});
// Tiles use animation-based stagger — observe the grid and fire on all tiles at once
var tileIO = new IntersectionObserver(function(entries) {
  if (!entries[0].isIntersecting) return;
  document.querySelectorAll('#tileGrid .tile').forEach(function(t) { t.classList.add('in'); });
  tileIO.disconnect();
}, {threshold: 0.05});
var tg = document.getElementById('tileGrid');
if (tg) tileIO.observe(tg);



// ── HERO PARALLAX — 25% scroll speed ─────────────────────────────────────
var heroBg = document.querySelector('.hero-bg');
if (heroBg) {
  window.addEventListener('scroll', function() {
    heroBg.style.transform = 'translateY(' + (scrollY * 0.25) + 'px)';
  }, {passive:true});
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

// ── CONTACT FORM ──────────────────────────────────────────────────────────
document.getElementById('formBtn').addEventListener('click', function() {
  var w = document.querySelector('.form-wrap');
  var v = function(s) { return (w.querySelector(s) || {}).value || ''; };
  var sub  = encodeURIComponent('Carpentry enquiry \u2014 ' + v('input[type=text]'));
  var body = encodeURIComponent('Name: ' + v('input[type=text]') + '\nPhone: ' + v('input[type=tel]') + '\nEmail: ' + v('input[type=email]') + '\nProject: ' + v('select') + '\n\n' + v('textarea'));
  window.location.href = 'mailto:rplanecarpenter@hotmail.co.uk?subject=' + sub + '&body=' + body;
});
