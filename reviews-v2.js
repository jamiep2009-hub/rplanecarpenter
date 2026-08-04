/* ============================================================
   R. Plane Carpenter — Reviews Section

   Every review is written into the page markup, so all of them are
   real text for search engines and screen readers on first load.
   This file only decides which one is shown; it holds no content
   of its own.

   Cycles every 7s, click a chip to jump, pauses when off-screen.
   ============================================================ */
(function () {
  'use strict';

  var section = document.getElementById('reviews');
  if (!section || !section.classList.contains('rv')) return;

  var quoteWrap = section.querySelector('.rv-quote-wrap');
  var slides    = section.querySelectorAll('.rv-slide');
  var chips     = section.querySelectorAll('.rv-chip');
  if (!slides.length) return;

  var i = 0;
  var timer = null;

  function setActive (idx) {
    i = ((idx % slides.length) + slides.length) % slides.length;

    slides.forEach(function (s, k) {
      var on = k === i;
      s.classList.toggle('is-active', on);
      // Keep the hidden ones out of the accessibility tree, but still
      // in the document — they are the reason the copy is crawlable.
      if (on) s.removeAttribute('aria-hidden');
      else s.setAttribute('aria-hidden', 'true');
    });

    chips.forEach(function (c, k) { c.classList.toggle('is-active', k === i); });

    // Re-trigger the entrance animation
    if (quoteWrap) {
      quoteWrap.classList.remove('rv-bump');
      void quoteWrap.offsetWidth;
      quoteWrap.classList.add('rv-bump');
    }
  }

  function start () {
    if (timer) return;
    timer = setInterval(function () { setActive(i + 1); }, 7000);
  }
  function stop () {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
  }

  chips.forEach(function (c, k) {
    c.addEventListener('click', function () {
      stop();
      setActive(k);
      start();
    });
  });

  // Pause the rotation when the section is out of view (saves cycles +
  // prevents the chip animation from racing while the user isn't watching)
  var io = new IntersectionObserver(function (entries) {
    if (entries[0].isIntersecting) start();
    else stop();
  }, { threshold: 0.2 });
  io.observe(section);
})();
