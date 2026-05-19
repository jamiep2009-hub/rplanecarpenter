/* ============================================================
   R. Plane Carpenter — Before / After Drag Slider
   ============================================================ */
(function () {
  'use strict';

  var slider    = document.getElementById('baSlider');
  if (!slider) return;

  var afterWrap = document.getElementById('baAfterWrap');
  var divider   = document.getElementById('baDivider');

  var pct      = 50;
  var dragging = false;

  function setPosition (clientX) {
    var rect = slider.getBoundingClientRect();
    var raw  = (clientX - rect.left) / rect.width * 100;
    pct = Math.max(2, Math.min(98, raw));

    // Reveal the after image from left up to pct%
    afterWrap.style.clipPath = 'inset(0 ' + (100 - pct).toFixed(2) + '% 0 0)';
    divider.style.left       = pct.toFixed(2) + '%';
  }

  slider.addEventListener('pointerdown', function (e) {
    dragging = true;
    slider.classList.add('is-dragging');
    slider.setPointerCapture(e.pointerId);
    setPosition(e.clientX);
  });

  slider.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    setPosition(e.clientX);
  });

  function stopDrag () {
    dragging = false;
    slider.classList.remove('is-dragging');
  }

  slider.addEventListener('pointerup',     stopDrag);
  slider.addEventListener('pointercancel', stopDrag);
})();
