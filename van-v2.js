/* ============================================================
   R. Plane Carpenter — Interactive Van Showcase
   Entrance reveal + gentle scroll parallax ("camera drifting
   around the van"). Driven by a rAF LERP loop reading the
   section's position relative to the viewport — no sticky
   pinning, so it can't break under overflow-x:hidden.
   ============================================================ */
(function () {
  'use strict';

  var section = document.getElementById('van-showcase');
  if (!section) return;

  var van    = section.querySelector('.vsh-van');
  var spot   = section.querySelector('.vsh-spot');
  var warm   = section.querySelector('.vsh-warm');
  var shadow = section.querySelector('.vsh-shadow');
  var dust   = section.querySelector('.vsh-dust');
  if (!van) return;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- floating dust ---- */
  if (dust && !reduced) {
    var frag = document.createDocumentFragment();
    for (var i = 0; i < 16; i++) {
      var m = document.createElement('span');
      m.className = 'vsh-mote';
      m.style.left = (8 + Math.random() * 84) + '%';
      m.style.top  = (12 + Math.random() * 74) + '%';
      m.style.animationDuration = (5 + Math.random() * 6).toFixed(2) + 's';
      m.style.animationDelay    = (Math.random() * 8).toFixed(2) + 's';
      m.style.transform = 'scale(' + (0.5 + Math.random() * 1.1).toFixed(2) + ')';
      frag.appendChild(m);
    }
    dust.appendChild(frag);
  }

  if (reduced) {
    van.style.opacity = '1';
    van.style.transform = 'none';
    section.classList.add('is-in');
    return;
  }

  var revealed = false;   // set true once scrolled into view (entrance)
  var rev = 0;            // eased entrance 0→1
  var par = 0;            // eased parallax -1..1
  var parTarget = 0;
  var running = false;

  function computeParTarget () {
    var r  = section.getBoundingClientRect();
    var vh = window.innerHeight;
    var center = r.top + r.height / 2;
    // 0 when the section is centred, negative below, positive above
    parTarget = Math.max(-1, Math.min(1, (vh / 2 - center) / (vh / 2 + r.height / 2)));
  }

  function apply () {
    var ty    = (1 - rev) * 46;                 // rise in
    var scale = 0.95 + rev * 0.05 + Math.abs(par) * 0.012;
    var rotY  = par * -9;                        // camera pans as you scroll past
    var rotX  = (1 - rev) * 4;
    var tx    = par * 2.6;

    van.style.opacity = rev.toFixed(3);
    van.style.transform =
      'translate3d(' + tx.toFixed(2) + '%, ' + ty.toFixed(1) + 'px, 0) ' +
      'rotateY(' + rotY.toFixed(2) + 'deg) rotateX(' + rotX.toFixed(2) + 'deg) ' +
      'scale(' + scale.toFixed(3) + ')';

    if (spot) {
      spot.style.opacity = (0.4 + rev * 0.22).toFixed(3);
      spot.style.transform =
        'translate(-50%, -50%) translateY(' + (par * -14).toFixed(1) + 'px) scale(' + (0.95 + rev * 0.12).toFixed(3) + ')';
    }
    if (warm) {
      // gentle warm bloom that strengthens as the van settles in view
      warm.style.opacity = (rev * 0.45 * (0.6 + 0.4 * (1 - Math.abs(par)))).toFixed(3);
      warm.style.transform = 'translate(-50%, -50%) scale(' + (0.9 + rev * 0.16).toFixed(3) + ')';
    }
    if (shadow) {
      shadow.style.opacity = (rev * 0.7).toFixed(3);
      shadow.style.transform =
        'translateX(-50%) translateX(' + (tx * 0.6).toFixed(2) + '%) scaleX(' + (0.9 + rev * 0.12).toFixed(3) + ')';
    }
    if (dust) dust.style.transform = 'translateY(' + (par * -18).toFixed(1) + 'px)';
  }

  function loop () {
    var revT = revealed ? 1 : 0;
    rev += (revT - rev) * 0.10;
    par += (parTarget - par) * 0.10;
    apply();

    var settled = Math.abs(revT - rev) < 0.001 && Math.abs(parTarget - par) < 0.001;
    if (settled) { running = false; return; }   // idle until next scroll
    requestAnimationFrame(loop);
  }

  function kick () {
    if (!running) { running = true; requestAnimationFrame(loop); }
  }

  function onScroll () { computeParTarget(); kick(); }

  // Reveal entrance when the section comes into view; keep parallax live while visible
  var io = new IntersectionObserver(function (entries) {
    if (entries[0].isIntersecting) {
      revealed = true;
      section.classList.add('is-in');
      kick();
    }
  }, { threshold: 0.2 });
  io.observe(section);

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);

  computeParTarget();
  apply();
})();
