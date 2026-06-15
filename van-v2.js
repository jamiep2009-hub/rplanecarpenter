/* ============================================================
   R. Plane Carpenter — Interactive Van Showcase
   Layered scroll sequence (drive-in, rotation swing, forward
   zoom, light-sweep, headlight bloom) + pointer-driven 3D tilt.
   One rAF LERP loop, no sticky/fixed pinning — robust under the
   global overflow-x:hidden and smooth on mobile.
   ============================================================ */
(function () {
  'use strict';

  var section = document.getElementById('van-showcase');
  if (!section) return;

  var stage  = section.querySelector('.vsh-stage');
  var van    = section.querySelector('.vsh-van');
  var spot   = section.querySelector('.vsh-spot');
  var warm   = section.querySelector('.vsh-warm');
  var shadow = section.querySelector('.vsh-shadow');
  var dust   = section.querySelector('.vsh-dust');
  var sheen  = section.querySelector('.vsh-sheen');
  var lights = section.querySelector('.vsh-lights');
  if (!van) return;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- floating dust ---- */
  if (dust && !reduced) {
    var frag = document.createDocumentFragment();
    for (var i = 0; i < 18; i++) {
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

  function clamp (v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  var revealed = false;
  var rev = 0;                       // entrance 0→1
  var par = 0, parTarget = 0;        // scroll pass -1..1 (eased)
  var pX = 0, pY = 0;                // pointer target -1..1
  var eX = 0, eY = 0;                // eased pointer
  var running = false;

  function computeParTarget () {
    var r  = section.getBoundingClientRect();
    var vh = window.innerHeight;
    var center = r.top + r.height / 2;
    parTarget = clamp((vh / 2 - center) / (vh / 2 + r.height / 2), -1, 1);
  }

  function apply () {
    // --- entrance ---
    var ty      = (1 - rev) * 44;          // rise in
    var txEnter = (1 - rev) * -16;         // drive in from the left
    var rotXin  = (1 - rev) * 5;

    // --- scroll pass ---
    var rotYscroll = par * -15;            // swings as it passes through view
    var txScroll   = par * 3.4;
    var zoom       = (1 - Math.abs(par)) * 0.05;   // comes forward at centre

    // --- pointer tilt ---
    var rotYp = eX * 11;
    var rotXp = -eY * 7;
    var txP   = eX * 1.6;

    var rotY  = rotYscroll + rotYp;
    var rotX  = rotXin + rotXp;
    var tx    = txEnter + txScroll + txP;
    var scale = 0.95 + rev * 0.05 + zoom;

    van.style.opacity = rev.toFixed(3);
    van.style.transform =
      'translate3d(' + tx.toFixed(2) + '%, ' + ty.toFixed(1) + 'px, 0) ' +
      'rotateX(' + rotX.toFixed(2) + 'deg) rotateY(' + rotY.toFixed(2) + 'deg) ' +
      'scale(' + scale.toFixed(3) + ')';

    // --- light-sweep across the bodywork ---
    if (sheen) {
      var sweep = ((par + 1) / 2) * 120 - 10 + eX * 18;   // travels with scroll + pointer
      sheen.style.backgroundPosition = clamp(sweep, 0, 100).toFixed(1) + '% 0';
      sheen.style.opacity = (rev * (0.32 + 0.28 * (1 - Math.abs(par)))).toFixed(3);
    }

    // --- headlights glow strongest when the van faces you (centred) ---
    if (lights) {
      lights.style.opacity = (rev * clamp(1 - Math.abs(par) * 1.25, 0, 1) * (0.7 + 0.3 * Math.abs(eX))).toFixed(3);
    }

    // --- ambient layers, parallaxed ---
    if (spot) {
      spot.style.opacity = (0.4 + rev * 0.22).toFixed(3);
      spot.style.transform =
        'translate(-50%, -50%) translate(' + (eX * 14).toFixed(1) + 'px, ' + (par * -14 + eY * 10).toFixed(1) + 'px) ' +
        'scale(' + (0.95 + rev * 0.12).toFixed(3) + ')';
    }
    if (warm) {
      warm.style.opacity = (rev * 0.45 * (0.6 + 0.4 * (1 - Math.abs(par)))).toFixed(3);
      warm.style.transform = 'translate(-50%, -50%) scale(' + (0.9 + rev * 0.16).toFixed(3) + ')';
    }
    if (shadow) {
      shadow.style.opacity = (rev * 0.7).toFixed(3);
      shadow.style.transform =
        'translateX(-50%) translateX(' + (tx * 0.55).toFixed(2) + '%) scaleX(' + (0.9 + rev * 0.12 + Math.abs(eX) * 0.04).toFixed(3) + ')';
    }
    if (dust) dust.style.transform = 'translate(' + (eX * -10).toFixed(1) + 'px, ' + (par * -18).toFixed(1) + 'px)';
  }

  function loop () {
    var revT = revealed ? 1 : 0;
    rev += (revT - rev) * 0.10;
    par += (parTarget - par) * 0.10;
    eX  += (pX - eX) * 0.12;
    eY  += (pY - eY) * 0.12;
    apply();

    var settled =
      Math.abs(revT - rev) < 0.001 &&
      Math.abs(parTarget - par) < 0.001 &&
      Math.abs(pX - eX) < 0.001 && Math.abs(pY - eY) < 0.001;
    if (settled) { running = false; return; }
    requestAnimationFrame(loop);
  }

  function kick () { if (!running) { running = true; requestAnimationFrame(loop); } }

  /* ---- pointer interactivity (mouse / touch / pen) ---- */
  function onPointerMove (e) {
    var r = stage.getBoundingClientRect();
    pX = clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1);
    pY = clamp(((e.clientY - r.top) / r.height) * 2 - 1, -1, 1);
    kick();
  }
  function onPointerLeave () { pX = 0; pY = 0; kick(); }

  if (stage) {
    stage.addEventListener('pointermove',  onPointerMove,  { passive: true });
    stage.addEventListener('pointerleave', onPointerLeave, { passive: true });
    stage.addEventListener('pointercancel', onPointerLeave, { passive: true });
  }

  /* ---- scroll + reveal ---- */
  function onScroll () { computeParTarget(); kick(); }

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
