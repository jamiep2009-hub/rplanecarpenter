/* ============================================================
   R. Plane Carpenter — Before / After Drag Slider
   Premium build:
     • frame-paced LERP drag (buttery, not snappy)
     • one-time scroll-reveal sweep (full "before" -> 50/50)
     • tap-anywhere to move + full keyboard control
     • position-aware Before / After label fade
     • blur-up image loading
   Initialises every .ba-slider on the page independently.
   ============================================================ */
(function () {
  'use strict';

  var sliders = document.querySelectorAll('.ba-slider');
  if (!sliders.length) return;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function clamp (v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function initSlider (slider) {
    var afterWrap   = slider.querySelector('.ba-after-wrap');
    var divider     = slider.querySelector('.ba-divider');
    var handle      = slider.querySelector('.ba-handle');
    var beforeImg   = slider.querySelector('.ba-before');
    var afterImg    = slider.querySelector('.ba-after');
    var labelBefore = slider.querySelector('.ba-label-before');
    var labelAfter  = slider.querySelector('.ba-label-after');
    if (!afterWrap || !divider) return;

    var target   = reduced ? 50 : 0;    // start fully on "before" (after clipped) for the reveal
    var current  = target;
    var dragging = false;
    var rafId    = null;
    var interrupted = false;            // user took control before/over the intro

    function render (pct) {
      afterWrap.style.clipPath = 'inset(0 ' + (100 - pct).toFixed(2) + '% 0 0)';
      divider.style.left       = pct.toFixed(2) + '%';
      if (handle) handle.setAttribute('aria-valuenow', Math.round(pct));
      // Fade each label out as the divider sweeps past it
      if (labelBefore) labelBefore.style.opacity = clamp((94 - pct) / 14, 0, 1).toFixed(2);
      if (labelAfter)  labelAfter.style.opacity  = clamp((pct - 6) / 14, 0, 1).toFixed(2);
    }

    function pctFromX (clientX) {
      var rect = slider.getBoundingClientRect();
      return clamp((clientX - rect.left) / rect.width * 100, 2, 98);
    }

    function loop () {
      // Ease toward the target — 0.2 keeps the handle close to the
      // cursor while smoothing out sparse / jittery pointer events.
      current += (target - current) * 0.2;
      if (Math.abs(target - current) < 0.04) {
        current = target;
        render(current);
        rafId = null;
        return;
      }
      render(current);
      rafId = requestAnimationFrame(loop);
    }

    function kick () {
      if (reduced) { current = target; render(current); }
      else if (rafId == null) { rafId = requestAnimationFrame(loop); }
    }

    function takeControl () {
      interrupted = true;               // stop the intro tween handing back to 50
    }

    function setTarget (clientX) {
      takeControl();
      target = pctFromX(clientX);
      kick();
    }

    /* ---- pointer (tap anywhere + drag) ---- */
    slider.addEventListener('pointerdown', function (e) {
      dragging = true;
      slider.classList.add('is-dragging');
      slider.setPointerCapture(e.pointerId);
      setTarget(e.clientX);
    });
    slider.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      setTarget(e.clientX);
    });
    function stopDrag () { dragging = false; slider.classList.remove('is-dragging'); }
    slider.addEventListener('pointerup',     stopDrag);
    slider.addEventListener('pointercancel', stopDrag);

    /* ---- keyboard ---- */
    if (handle) {
      handle.addEventListener('keydown', function (e) {
        var nt = null, step = 2;
        switch (e.key) {
          case 'ArrowLeft':  case 'ArrowDown': nt = target - step; break;
          case 'ArrowRight': case 'ArrowUp':   nt = target + step; break;
          case 'PageDown': nt = target - 10; break;
          case 'PageUp':   nt = target + 10; break;
          case 'Home': nt = 2;  break;
          case 'End':  nt = 98; break;
        }
        if (nt == null) return;
        e.preventDefault();
        takeControl();
        target = clamp(nt, 2, 98);
        kick();
      });
    }

    /* ---- blur-up: fade images in once decoded ---- */
    [beforeImg, afterImg].forEach(function (img) {
      if (!img) return;
      if (img.complete && img.naturalWidth) img.classList.add('is-loaded');
      else img.addEventListener('load', function () { img.classList.add('is-loaded'); });
    });

    /* ---- one-time reveal sweep when scrolled into view ---- */
    function runIntro () {
      if (reduced) {
        target = current = 50;
        render(current);
        slider.classList.add('is-revealed');
        return;
      }
      var start = 0, end = 50, dur = 1100, t0 = null;
      function step (ts) {
        if (t0 == null) t0 = ts;
        var p = Math.min((ts - t0) / dur, 1);
        var e = 1 - Math.pow(1 - p, 3);          // easeOutCubic
        if (interrupted) { return; }             // user grabbed it — bail, LERP loop owns it now
        current = start + (end - start) * e;
        render(current);
        if (p < 1) requestAnimationFrame(step);
        else { current = target = 50; slider.classList.add('is-revealed'); }
      }
      requestAnimationFrame(step);
    }

    render(current);                              // initial paint (full "before")

    if (reduced || !('IntersectionObserver' in window)) {
      runIntro();
    } else {
      var io = new IntersectionObserver(function (entries, obs) {
        if (entries[0].isIntersecting) { obs.disconnect(); runIntro(); }
      }, { threshold: 0.35 });
      io.observe(slider);
    }
  }

  Array.prototype.forEach.call(sliders, initSlider);
})();
