/* ============================================================
   R. Plane Carpenter — Before / After Drag Slider
   Frame-paced LERP smoothing: the divider eases toward the
   pointer each animation frame for a fluid, buttery feel
   rather than snapping on every raw pointer event.
   ============================================================ */
(function () {
  'use strict';

  var slider    = document.getElementById('baSlider');
  if (!slider) return;

  var afterWrap = document.getElementById('baAfterWrap');
  var divider   = document.getElementById('baDivider');

  var reduced  = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var target   = 50;   // where the pointer wants the divider
  var current  = 50;   // the actual rendered position
  var dragging = false;
  var rafId    = null;

  function pctFromX (clientX) {
    var rect = slider.getBoundingClientRect();
    var raw  = (clientX - rect.left) / rect.width * 100;
    return Math.max(2, Math.min(98, raw));
  }

  function render (pct) {
    afterWrap.style.clipPath = 'inset(0 ' + (100 - pct).toFixed(2) + '% 0 0)';
    divider.style.left       = pct.toFixed(2) + '%';
  }

  function loop () {
    // Ease toward the target — higher factor = more responsive,
    // lower = silkier. 0.2 keeps the handle close to the cursor
    // while smoothing out sparse / jittery pointer events.
    current += (target - current) * 0.2;

    if (Math.abs(target - current) < 0.04) {
      current = target;
      render(current);
      rafId = null;          // settled — stop the loop
      return;
    }
    render(current);
    rafId = requestAnimationFrame(loop);
  }

  function setTarget (clientX) {
    target = pctFromX(clientX);
    if (reduced) {
      current = target;
      render(current);
    } else if (rafId == null) {
      rafId = requestAnimationFrame(loop);
    }
  }

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

  function stopDrag () {
    dragging = false;
    slider.classList.remove('is-dragging');
  }

  slider.addEventListener('pointerup',     stopDrag);
  slider.addEventListener('pointercancel', stopDrag);

  // Initial paint at the midpoint
  render(current);
})();
