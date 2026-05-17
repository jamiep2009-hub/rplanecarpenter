/* ============================================================
   R. PLANE CARPENTER — script.js
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {

  /* ── SCROLL PROGRESS ────────────────────────────────────── */
  const spb = document.getElementById('spb-bar');
  if (spb) {
    window.addEventListener('scroll', () => {
      const d = document.documentElement;
      spb.style.width = Math.min(d.scrollTop / (d.scrollHeight - d.clientHeight) * 100, 100) + '%';
    }, { passive: true });
  }

  /* ── NAV SCROLL BEHAVIOUR ───────────────────────────────── */
  const nav = document.getElementById('nav');
  let lastY = 0, navTick = false;

  window.addEventListener('scroll', () => {
    if (navTick) return;
    navTick = true;
    requestAnimationFrame(() => {
      const y = window.scrollY;
      if (nav) {
        nav.classList.toggle('scrolled', y > 20);
        nav.classList.toggle('hidden', y > 300 && y > lastY + 8);
        if (y < lastY - 8 || y < 80) nav.classList.remove('hidden');
      }
      lastY = y;
      navTick = false;
    });
  }, { passive: true });

  /* ── MOBILE MENU ────────────────────────────────────────── */
  const menuBtn  = document.getElementById('menuBtn');
  const navLinks = document.getElementById('navLinks');

  if (menuBtn && navLinks) {
    menuBtn.addEventListener('click', () => {
      const open = navLinks.classList.toggle('open');
      menuBtn.setAttribute('aria-expanded', String(open));
      menuBtn.innerHTML = open
        ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>`
        : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>`;
    });
    navLinks.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
      navLinks.classList.remove('open');
      menuBtn.setAttribute('aria-expanded', 'false');
      menuBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>`;
    }));
  }

  /* ── ACTIVE NAV LINK ────────────────────────────────────── */
  const sections = ['home','services','portfolio','about','contact']
    .map(id => document.getElementById(id)).filter(Boolean);

  const updateNav = () => {
    const y = window.scrollY + 140;
    let current = sections[0]?.id;
    sections.forEach(s => { if (s.offsetTop <= y) current = s.id; });
    if (navLinks) navLinks.querySelectorAll('a').forEach(a =>
      a.classList.toggle('active', a.getAttribute('href') === '#' + current)
    );
  };
  window.addEventListener('scroll', updateNav, { passive: true });
  updateNav();

  /* ── INTERSECTION OBSERVER — REVEAL ─────────────────────── */
  const revealObs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('in');
        revealObs.unobserve(e.target);
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.reveal, .reveal-left, .reveal-right, .reveal-scale')
    .forEach(el => revealObs.observe(el));

  /* ── STAGGER CHILDREN ───────────────────────────────────── */
  document.querySelectorAll('[data-stagger]').forEach(parent => {
    Array.from(parent.children).forEach((child, i) => {
      child.classList.add('reveal');
      child.style.transitionDelay = (i * 0.1) + 's';
      revealObs.observe(child);
    });
  });

  /* ── COUNTERS ────────────────────────────────────────────── */
  const counterObs = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el     = entry.target;
      const target = parseInt(el.dataset.target, 10);
      const suffix = el.dataset.suffix || '';
      if (isNaN(target)) return;
      const dur = target > 100 ? 1600 : 1100;
      const t0  = performance.now();
      const tick = now => {
        const p = Math.min((now - t0) / dur, 1);
        const e = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(target * e) + suffix;
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      counterObs.unobserve(el);
    });
  }, { threshold: 0.8 });

  document.querySelectorAll('[data-target]').forEach(el => counterObs.observe(el));

  /* ── PARALLAX HERO (desktop only) ───────────────────────── */
  const heroBg = document.querySelector('.hero-bg');
  const isMobile = () => window.innerWidth <= 768;

  window.addEventListener('scroll', () => {
    if (heroBg && !isMobile() && window.scrollY < window.innerHeight * 1.5) {
      heroBg.style.transform = `translateY(${window.scrollY * 0.22}px)`;
    } else if (heroBg && isMobile()) {
      heroBg.style.transform = '';
    }
  }, { passive: true });

  /* ── PORTFOLIO FILTER ───────────────────────────────────── */
  const filterGrid  = document.getElementById('filterGrid');
  const filterTabs  = document.getElementById('filterTabs');
  const filterCount = document.getElementById('filterCount');

  if (filterGrid && filterTabs) {
    const tiles = Array.from(filterGrid.querySelectorAll('.filter-tile'));

    const applyFilter = active => {
      let count = 0;
      tiles.forEach(tile => {
        const show = active === 'all' || tile.dataset.category === active;
        tile.classList.toggle('hidden', !show);
        if (show) count++;
      });
      if (filterCount) filterCount.textContent = `Showing ${count} project${count !== 1 ? 's' : ''}`;
    };

    filterTabs.querySelectorAll('.filter-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        filterTabs.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        applyFilter(tab.dataset.filter);
      });
    });

    applyFilter('all');
  }

  /* ── CONTACT FORM ───────────────────────────────────────── */
  const form    = document.getElementById('contactForm');
  const formBtn = document.getElementById('formBtn');
  const success = document.getElementById('formSuccess');

  if (form && formBtn) {
    form.addEventListener('submit', e => {
      e.preventDefault();
      let valid = true;

      form.querySelectorAll('[required]').forEach(field => {
        field.classList.remove('error');
        if (!field.value.trim()) {
          field.classList.add('error');
          valid = false;
        }
        if (field.type === 'email' && field.value && !/\S+@\S+\.\S+/.test(field.value)) {
          field.classList.add('error');
          valid = false;
        }
      });

      if (valid) {
        formBtn.textContent = 'Sending…';
        formBtn.disabled = true;
        setTimeout(() => {
          form.style.display = 'none';
          if (success) success.classList.add('show');
        }, 1000);
      }
    });

    /* Clear error on input */
    form.querySelectorAll('input, select, textarea').forEach(f =>
      f.addEventListener('input', () => f.classList.remove('error'))
    );
  }

});
