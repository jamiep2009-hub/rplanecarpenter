/* ============================================================
   R. Plane Carpenter — Reviews Section (Option B3)
   Spotlight stage. Cycles through 6 reviews, click chip to jump.
   Auto-advances every 7s; pause when the section is off-screen.
   ============================================================ */
(function () {
  'use strict';

  var section = document.getElementById('reviews');
  if (!section || !section.classList.contains('rv')) return;

  var quoteWrap = section.querySelector('.rv-quote-wrap');
  var quoteEl   = section.querySelector('.rv-quote');
  var initialEl = section.querySelector('.rv-initial');
  var projectEl = section.querySelector('.rv-project');
  var chips     = section.querySelectorAll('.rv-chip');

  /* ADMIN:reviews:start */
  var reviews = [
    { quote: "First class work carried out by Robbie. Very reliable and tidy. We were extremely happy with our kitchen which he fitted. Would highly recommend.",
      project: "Bespoke kitchen", initial: "J" },
    { quote: "Highly recommend Robbie \u2014 he has fitted 14 kitchens for me now and I highly recommend his work. Exceptional quality every time.",
      project: "Trade \u00b7 14 kitchens", initial: "M" },
    { quote: "Robbie recently transformed my out of date bathroom and gave it the modern touch it needed. Nothing was too much trouble, he kept in touch, and achieved a great result in the time frame he gave me.",
      project: "Bathroom joinery", initial: "S" },
    { quote: "We can\u2019t say thank you enough. Robbie gave a quote in a timely fashion and kept to the estimated delivery and installation time. We are so pleased with the end result and would highly recommend him.",
      project: "Fitted wardrobes", initial: "K" },
    { quote: "He\u2019s an absolute professional, neat & tidy, meticulous in his work and a really nice chap as well. It was a pleasure to have him in the house. If you have appointed Robbie for your project you\u2019ve made an excellent choice!",
      project: "Home library", initial: "P" },
    { quote: "Not only was his own work of the highest quality, but he also organised the other trades, ensuring the project ran like clockwork. We would happily employ Robbie again and have no hesitation in recommending him.",
      project: "Whole-room install", initial: "D" },
  ];
  /* ADMIN:reviews:end */

  var i = 0;
  var timer = null;

  function setActive (idx) {
    i = ((idx % reviews.length) + reviews.length) % reviews.length;
    var r = reviews[i];
    quoteEl.textContent   = r.quote;
    initialEl.textContent = r.initial;
    projectEl.textContent = r.project;
    chips.forEach(function (c, k) {
      c.classList.toggle('is-active', k === i);
    });
    // Re-trigger entrance animation
    quoteWrap.classList.remove('rv-bump');
    void quoteWrap.offsetWidth;
    quoteWrap.classList.add('rv-bump');
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
