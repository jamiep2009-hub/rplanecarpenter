/* ============================================================
   R. Plane Carpenter — Header v2 (Drawer Index)
   Drop-in companion to header-v2.css. Owns:
   - Scroll-condense behaviour
   - Drawer open/close + body scroll lock
   - Escape-key to close
   - Backdrop click to close
   ============================================================ */
(function () {
  'use strict';

  var nav      = document.getElementById('rpcNav');
  var openBtn  = document.getElementById('rpcMenuOpen');
  var menuBtn  = document.getElementById('rpcMenuBtn');
  var drawer   = document.getElementById('rpcDrawer');
  var closeBtn = document.getElementById('rpcDrawerClose');
  if (!nav || !drawer) return;

  // ── Scroll condense ──
  function onScroll () {
    nav.classList.toggle('scrolled', window.scrollY > 60);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // ── Drawer open/close ──
  function openDrawer (e) {
    if (e) e.preventDefault();
    drawer.classList.add('open');
    document.body.classList.add('rpc-drawer-open');
    drawer.setAttribute('aria-hidden', 'false');
    // Move focus into the drawer for keyboard users
    if (closeBtn) closeBtn.focus();
  }
  function closeDrawer () {
    drawer.classList.remove('open');
    document.body.classList.remove('rpc-drawer-open');
    drawer.setAttribute('aria-hidden', 'true');
    if (menuBtn) menuBtn.focus();
  }

  if (menuBtn)  menuBtn.addEventListener('click', openDrawer);
  if (openBtn)  openBtn.addEventListener('click', function (e) {
    // The brand mark links home, so only intercept on touch-/no-href situations
    if (!openBtn.getAttribute('href')) openDrawer(e);
  });
  if (closeBtn) closeBtn.addEventListener('click', closeDrawer);

  // ── Escape key ──
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && drawer.classList.contains('open')) closeDrawer();
  });

  // ── Close after navigating to an anchor inside the same page ──
  drawer.querySelectorAll('.rpc-drawer-row').forEach(function (row) {
    row.addEventListener('click', function () {
      // Small delay so the drawer fade-out doesn't fight the page scroll
      setTimeout(closeDrawer, 100);
    });
  });
})();
