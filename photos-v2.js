/* ============================================================
   R. Plane Carpenter — Photos / Featured Work (Option A)
   Bento mosaic. Triggers the staggered tile reveal when the
   section scrolls into view.
   ============================================================ */
(function () {
  'use strict';

  var grid = document.querySelector('.gx-grid');
  if (!grid) return;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    grid.classList.add('is-in');
    return;
  }

  var io = new IntersectionObserver(function (entries) {
    if (entries[0].isIntersecting) {
      grid.classList.add('is-in');
      io.disconnect();
    }
  }, { threshold: 0.15 });
  io.observe(grid);
})();
