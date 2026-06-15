/* ============================================================
   R. Plane Carpenter — Interactive Van Showcase
   Scroll progress (0→1) drives a 2.5D "camera around the van"
   move via GPU 3D transforms, with LERP smoothing for a steady
   60fps glide. Layers parallax independently for depth.
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

  /* ---- Build the floating dust field ---- */
  if (dust && !reduced) {
    var motes = 16;
    var frag = document.createDocumentFragment();
    for (var i = 0; i < motes; i++) {
      var m = document.createElement('span');
      m.className = 'vsh-mote';
      m.style.left = (8 + Math.random() * 84) + '%';
      m.style.top  = (12 + Math.random() * 74) + '%';
      var dur   = (5 + Math.random() * 6).toFixed(2);
      var delay = (Math.random() * 8).toFixed(2);
      var scale = (0.5 + Math.random() * 1.1).toFixed(2);
      m.style.animationDuration = dur + 's';
      m.style.animationDelay    = delay + 's';
      m.style.transform = 'scale(' + scale + ')';
      frag.appendChild(m);
    }
    dust.appendChild(frag);
  }

  /* ---- Keyframes: p, opacity, ty(px), rotY, rotX, scale, tx(%), spot ---- */
  var KF = [
    [0.00, 0.0,  90, -15,  8, 0.90, -4, 0.30],
    [0.25, 1.0,   0,  -6,  5, 0.96, -2, 0.46],
    [0.50, 1.0,   0,   1,  3, 1.05,  4, 0.56],
    [0.75, 1.0,   0,   4,  1, 1.07,  4, 0.86],
    [1.00, 1.0,   0,   6,  0, 1.02,  2, 0.66]
  ];

  function smooth (t) { return t * t * (3 - 2 * t); }   // smoothstep

  function sample (p) {
    // find surrounding keyframes
    var a = KF[0], b = KF[KF.length - 1];
    for (var i = 0; i < KF.length - 1; i++) {
      if (p >= KF[i][0] && p <= KF[i + 1][0]) { a = KF[i]; b = KF[i + 1]; break; }
    }
    var span = (b[0] - a[0]) || 1;
    var t = smooth(Math.max(0, Math.min(1, (p - a[0]) / span)));
    var out = [];
    for (var k = 1; k < a.length; k++) out[k] = a[k] + (b[k] - a[k]) * t;
    return out; // [_,opacity,ty,rotY,rotX,scale,tx,spot]
  }

  function apply (p) {
    var v = sample(p);
    var opacity = v[1], ty = v[2], rotY = v[3], rotX = v[4], scale = v[5], tx = v[6], spotI = v[7];

    // Van — the "subject", full 3D transform
    van.style.opacity = opacity.toFixed(3);
    van.style.transform =
      'translate3d(' + tx.toFixed(2) + '%, ' + ty.toFixed(1) + 'px, 0) ' +
      'rotateY(' + rotY.toFixed(2) + 'deg) rotateX(' + rotX.toFixed(2) + 'deg) ' +
      'scale(' + scale.toFixed(3) + ')';

    // Spotlight — parallax slower, brightens through the sequence
    if (spot) {
      spot.style.opacity = spotI.toFixed(3);
      spot.style.transform =
        'translate(-50%, -50%) translateY(' + (p * -16).toFixed(1) + 'px) scale(' + (0.92 + p * 0.22).toFixed(3) + ')';
    }

    // Warm "lighting change" — peaks around 75% then eases back
    if (warm) {
      var w = Math.max(0, 1 - Math.abs(p - 0.78) / 0.32);
      warm.style.opacity = (w * 0.9).toFixed(3);
      warm.style.transform = 'translate(-50%, -50%) scale(' + (0.9 + p * 0.18).toFixed(3) + ')';
    }

    // Ground shadow — tracks the van's scale & horizontal shift, fades with entrance
    if (shadow) {
      shadow.style.opacity = (opacity * (0.55 + (scale - 0.9) * 1.2)).toFixed(3);
      shadow.style.transform =
        'translateX(-50%) translateX(' + (tx * 0.6).toFixed(2) + '%) scaleX(' + (0.86 + (scale - 0.9) * 1.4).toFixed(3) + ')';
    }

    // Dust — fastest parallax layer for depth
    if (dust) dust.style.transform = 'translateY(' + (p * -30).toFixed(1) + 'px)';

    // CTA reveal once the van has essentially settled
    section.classList.toggle('is-settled', p > 0.82);
  }

  /* ---- Scroll → target progress, eased by a rAF LERP loop ---- */
  var target = 0, current = 0, rafId = null;

  function computeTarget () {
    var r  = section.getBoundingClientRect();
    var vh = window.innerHeight;
    var scrollable = Math.max(1, section.offsetHeight - vh);
    target = Math.max(0, Math.min(1, -r.top / scrollable));
  }

  function loop () {
    current += (target - current) * 0.12;
    if (Math.abs(target - current) < 0.0005) {
      current = target;
      apply(current);
      rafId = null;
      return;
    }
    apply(current);
    rafId = requestAnimationFrame(loop);
  }

  function onScroll () {
    computeTarget();
    if (rafId == null) rafId = requestAnimationFrame(loop);
  }

  if (reduced) {
    apply(1);                       // static, fully-settled pose
    return;
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);

  // Initial paint
  computeTarget();
  current = target;
  apply(current);
})();
