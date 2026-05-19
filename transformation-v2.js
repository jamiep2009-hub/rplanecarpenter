/* ============================================================
   R. Plane Carpenter — Transformation Section (Option B)
   Scroll-driven reveal. Drives clip-path, seam position, tape
   marker, caption stage, and label-highlight states from the
   section's scroll progress (0 → 1).
   ============================================================ */
(function () {
  'use strict';

  var section = document.getElementById('transformation');
  if (!section) return;

  var after   = section.querySelector('.tx-after');
  var seam    = section.querySelector('.tx-seam');
  var marker  = section.querySelector('.tx-marker');
  var title   = section.querySelector('.tx-title');
  var sub     = section.querySelector('.tx-sub');
  var caption = section.querySelector('.tx-caption');
  var labels  = section.querySelectorAll('.tx-tape text');

  // Build stages — captions for the centred title/sub.
  var captions = [
    { title: 'Bare walls, screeded floor',  sub: 'Raw plaster \u00b7 unpainted \u00b7 unfitted' },
    { title: 'Stripped out, first-fixed',   sub: 'Services in \u00b7 walls re-plastered' },
    { title: 'Cabinetry installed',         sub: 'In-frame doors \u00b7 soft-close runners' },
    { title: 'Solid oak worktops laid',     sub: '40mm hand-finished \u00b7 quartz sink' },
    { title: 'Bespoke kitchen, fitted',     sub: 'Handleless \u00b7 wax-oil finished' },
  ];
  var lastCi = -1;
  var ticking = false;

  function applyProgress (p) {
    // Clip-path reveal of AFTER over BEFORE
    after.style.clipPath = 'inset(' + ((1 - p) * 100).toFixed(2) + '% 0 0 0)';

    // Seam line travels with the reveal edge
    seam.style.top = ((1 - p) * 100).toFixed(2) + '%';

    // Marker position along the tape
    marker.style.left = (p * 100).toFixed(2) + '%';

    // Light up tape labels the marker has passed
    var stops = labels.length;
    for (var i = 0; i < stops; i++) {
      var threshold = i / Math.max(1, stops - 1);
      labels[i].classList.toggle('is-reached', threshold <= p + 0.001);
    }

    // Section progressing state (used to hide the eyebrow + show seam)
    section.classList.toggle('is-progressing', p > 0.02 && p < 0.98);

    // Caption stage — only re-render on change so we can bump-animate
    var ci = Math.min(captions.length - 1, Math.max(0, Math.floor(p * captions.length)));
    if (ci !== lastCi) {
      lastCi = ci;
      title.textContent = captions[ci].title;
      sub.textContent   = captions[ci].sub;
      // Re-trigger the bump animation
      caption.classList.remove('tx-bump');
      // Force reflow so the animation restarts
      void caption.offsetWidth;
      caption.classList.add('tx-bump');
    }
  }

  function compute () {
    var r  = section.getBoundingClientRect();
    var vh = window.innerHeight;
    var scrollable = Math.max(1, r.height - vh);
    var p = Math.max(0, Math.min(1, -r.top / scrollable));
    applyProgress(p);
    ticking = false;
  }

  function onScroll () {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(compute);
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);

  // Initial paint
  compute();
})();
