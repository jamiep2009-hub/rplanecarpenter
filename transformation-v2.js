/* ============================================================
   R. Plane Carpenter — Transformation Section (Option B)
   Scroll-trapped reveal. When the section enters the viewport
   wheel/touch/keyboard input drives the animation instead of
   scrolling the page. Normal scroll resumes once complete.
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

  var captions = [
    { title: 'Bare walls, screeded floor',  sub: 'Raw plaster · unpainted · unfitted' },
    { title: 'Stripped out, first-fixed',   sub: 'Services in · walls re-plastered' },
    { title: 'Cabinetry installed',         sub: 'In-frame doors · soft-close runners' },
    { title: 'Solid oak worktops laid',     sub: '40mm hand-finished · quartz sink' },
    { title: 'Bespoke kitchen, fitted',     sub: 'Handleless · wax-oil finished' },
  ];

  // Respect reduced-motion — skip all locking, fall back to passive scroll.
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var progress = 0;   // 0 → 1
  var lastCi   = -1;
  var locked   = false;
  var cooldown = false;
  var savedY   = 0;
  var touchStartY = 0;

  // Virtual pixels of wheel input to traverse the full animation.
  var TOTAL = 900;

  /* ----------------------------------------------------------
     Apply progress (identical visual logic to before)
  ---------------------------------------------------------- */
  function applyProgress (p) {
    p = Math.max(0, Math.min(1, p));
    progress = p;

    after.style.clipPath = 'inset(' + ((1 - p) * 100).toFixed(2) + '% 0 0 0)';
    seam.style.top       = ((1 - p) * 100).toFixed(2) + '%';
    marker.style.left    = (p * 100).toFixed(2) + '%';

    var stops = labels.length;
    for (var i = 0; i < stops; i++) {
      var threshold = i / Math.max(1, stops - 1);
      labels[i].classList.toggle('is-reached', threshold <= p + 0.001);
    }

    section.classList.toggle('is-progressing', p > 0.02 && p < 0.98);

    var ci = Math.min(captions.length - 1, Math.max(0, Math.floor(p * captions.length)));
    if (ci !== lastCi) {
      lastCi = ci;
      title.textContent = captions[ci].title;
      sub.textContent   = captions[ci].sub;
      caption.classList.remove('tx-bump');
      void caption.offsetWidth;
      caption.classList.add('tx-bump');
    }
  }

  /* ----------------------------------------------------------
     Body lock / unlock
  ---------------------------------------------------------- */
  function lockBody () {
    if (locked) return;
    locked = true;
    savedY = window.pageYOffset;

    var sbWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.position   = 'fixed';
    document.body.style.top        = '-' + savedY + 'px';
    document.body.style.left       = '0';
    document.body.style.right      = '0';
    document.body.style.paddingRight = sbWidth ? sbWidth + 'px' : '';
    document.body.style.overflow   = 'hidden';
  }

  function unlockBody (direction) {
    if (!locked) return;
    locked = false;

    document.body.style.position    = '';
    document.body.style.top         = '';
    document.body.style.left        = '';
    document.body.style.right       = '';
    document.body.style.paddingRight = '';
    document.body.style.overflow    = '';

    // Jump to the correct page position.
    if (direction === 'forward') {
      // Land below the section so it scrolls out of view naturally.
      window.scrollTo(0, section.offsetTop + section.offsetHeight);
    } else {
      // Land just above the section.
      window.scrollTo(0, section.offsetTop - 4);
    }

    // Brief cooldown so the restored scroll event doesn't immediately re-lock.
    cooldown = true;
    setTimeout(function () { cooldown = false; }, 700);
  }

  /* ----------------------------------------------------------
     Passive scroll — watch for section entry to engage lock
  ---------------------------------------------------------- */
  function onPassiveScroll () {
    if (locked || cooldown || reducedMotion) return;

    var r = section.getBoundingClientRect();
    // Engage when the section top reaches (or is at) the viewport top.
    if (r.top <= 2 && r.top > -(section.offsetHeight - window.innerHeight + 2)) {
      // Only lock if animation hasn't already completed.
      if (progress >= 0.995) return;
      lockBody();
    }
  }

  /* ----------------------------------------------------------
     Wheel handler — drive progress while locked
  ---------------------------------------------------------- */
  function onWheel (e) {
    if (!locked) return;
    e.preventDefault();

    var raw = e.deltaY;
    // Normalise deltaMode: 0=px, 1=lines, 2=pages
    if (e.deltaMode === 1) raw *= 30;
    if (e.deltaMode === 2) raw *= 300;

    var delta = raw / TOTAL;
    var next  = Math.max(0, Math.min(1, progress + delta));
    applyProgress(next);

    if (next >= 0.999 && delta > 0) {
      applyProgress(1);
      unlockBody('forward');
    } else if (next <= 0.001 && delta < 0) {
      applyProgress(0);
      unlockBody('backward');
    }
  }

  /* ----------------------------------------------------------
     Touch handlers
  ---------------------------------------------------------- */
  function onTouchStart (e) {
    if (!locked) return;
    touchStartY = e.touches[0].clientY;
  }

  function onTouchMove (e) {
    if (!locked) return;
    e.preventDefault();

    var dy    = touchStartY - e.touches[0].clientY;
    touchStartY = e.touches[0].clientY;
    var delta = dy / TOTAL;
    var next  = Math.max(0, Math.min(1, progress + delta));
    applyProgress(next);

    if (next >= 0.999 && dy > 0) {
      applyProgress(1);
      unlockBody('forward');
    } else if (next <= 0.001 && dy < 0) {
      applyProgress(0);
      unlockBody('backward');
    }
  }

  /* ----------------------------------------------------------
     Keyboard handler
  ---------------------------------------------------------- */
  function onKeyDown (e) {
    if (!locked) return;
    var step = 0;
    if (e.key === 'ArrowDown' || e.key === 'PageDown') step = 0.18;
    if (e.key === 'ArrowUp'   || e.key === 'PageUp')   step = -0.18;
    if (!step) return;

    e.preventDefault();
    var next = Math.max(0, Math.min(1, progress + step));
    applyProgress(next);

    if (next >= 0.999 && step > 0) { applyProgress(1); unlockBody('forward'); }
    if (next <= 0.001 && step < 0) { applyProgress(0); unlockBody('backward'); }
  }

  /* ----------------------------------------------------------
     Click capture — allow link navigation while locked
  ---------------------------------------------------------- */
  function onClickCapture (e) {
    if (!locked) return;
    var el = e.target;
    while (el && el !== document.body) {
      if (el.tagName === 'A' && el.href) { unlockBody('forward'); return; }
      el = el.parentElement;
    }
  }

  /* ----------------------------------------------------------
     Resize — re-apply current progress (layout may have shifted)
  ---------------------------------------------------------- */
  function onResize () {
    applyProgress(progress);
  }

  /* ----------------------------------------------------------
     Attach listeners
  ---------------------------------------------------------- */
  if (!reducedMotion) {
    window.addEventListener('scroll',     onPassiveScroll, { passive: true });
    window.addEventListener('wheel',      onWheel,         { passive: false });
    window.addEventListener('touchstart', onTouchStart,    { passive: true });
    window.addEventListener('touchmove',  onTouchMove,     { passive: false });
    window.addEventListener('keydown',    onKeyDown);
    document.addEventListener('click',    onClickCapture,  { capture: true });
  } else {
    // Reduced-motion: passive read only.
    window.addEventListener('scroll', function () {
      var r  = section.getBoundingClientRect();
      var vh = window.innerHeight;
      var scrollable = Math.max(1, section.offsetHeight - vh);
      applyProgress(-r.top / scrollable);
    }, { passive: true });
  }

  window.addEventListener('resize', onResize);

  // Initial paint.
  applyProgress(0);
})();
