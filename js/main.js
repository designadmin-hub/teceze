(() => {
  const header = document.querySelector('.site-header');
  const nav = document.getElementById('primary-nav');
  const navToggle = document.querySelector('.nav-toggle');
  const more = nav.querySelector('.nav-more');
  const moreToggle = more.querySelector('.nav-more__toggle');
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const reduceMotion = () => motionQuery.matches; // read live, so changing the OS setting applies straight away

  /* ---------- Display headings: tuck full stops in (the display font spaces them loosely) ---------- */
  document.querySelectorAll('.hero__headline, .section-title, .approach__title, .cta-banner__title').forEach((heading) => {
    const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      const text = node.data;
      const parts = [];
      let from = 0;
      for (const match of text.matchAll(/\w\./g)) { // only full stops that follow a letter or digit
        const dot = match.index + 1;
        const span = document.createElement('span');
        span.className = 'punct';
        span.textContent = '.';
        parts.push(text.slice(from, dot), span);
        from = dot + 1;
      }
      if (!parts.length) return;
      parts.push(text.slice(from));
      node.replaceWith(...parts.filter((part) => part !== ''));
    });
  });

  /* ---------- Header: slides away once scrolled past; the floating section menu takes over ---------- */
  const fab = document.querySelector('[data-fab-nav]');
  const fabBtn = fab?.querySelector('.fab-nav__btn');
  const setFab = (open) => {
    if (!fab) return;
    fab.classList.toggle('is-open', open);
    fabBtn.setAttribute('aria-expanded', String(open));
    fabBtn.setAttribute('aria-label', open ? 'Close section menu' : 'Open section menu');
  };
  const onScroll = () => {
    const menuOpen = document.body.classList.contains('nav-open') || more.classList.contains('is-open');
    const away = window.scrollY > header.offsetHeight + 40 && !menuOpen;
    header.classList.toggle('is-hidden', away);
    fab?.classList.toggle('is-visible', away);
    if (!away) setFab(false);
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ---------- Mobile menu ---------- */
  const setMenu = (open) => {
    navToggle.setAttribute('aria-expanded', String(open));
    navToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    document.body.classList.toggle('nav-open', open);
  };
  navToggle.addEventListener('click', () => setMenu(navToggle.getAttribute('aria-expanded') !== 'true'));
  window.matchMedia('(min-width: 1101px)').addEventListener('change', (e) => e.matches && setMenu(false));

  /* ---------- "More" dropdown ---------- */
  const setMore = (open) => {
    moreToggle.setAttribute('aria-expanded', String(open));
    more.classList.toggle('is-open', open);
  };
  moreToggle.addEventListener('click', () => setMore(!more.classList.contains('is-open')));
  document.addEventListener('click', (e) => {
    if (!more.contains(e.target)) setMore(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    setMore(false);
    setMenu(false);
  });

  // Close menus once a link is chosen
  nav.addEventListener('click', (e) => {
    if (!e.target.closest('a')) return;
    setMenu(false);
    setMore(false);
  });

  /* ---------- Scroll spy: highlight the section on screen ---------- */
  const links = [...nav.querySelectorAll('.nav-list a.nav-link[href^="#"]')];
  const setActive = (id) => {
    links.forEach((link) => {
      const on = link.getAttribute('href') === `#${id}`;
      link.classList.toggle('is-active', on);
      if (on) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    });
    moreToggle.classList.toggle('is-active', Boolean(more.querySelector('a.is-active')));
    fab?.querySelectorAll('.fab-nav__link').forEach((link) => {
      const on = link.getAttribute('href') === `#${id}`;
      link.classList.toggle('is-active', on);
      if (on) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    });
  };

  // Floating menu: toggle, close on a link, outside click or Escape
  if (fab) {
    fabBtn.addEventListener('click', () => setFab(!fab.classList.contains('is-open')));
    fab.addEventListener('click', (e) => e.target.closest('.fab-nav__link') && setFab(false));
    document.addEventListener('click', (e) => !fab.contains(e.target) && setFab(false));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && fab.classList.contains('is-open')) {
        setFab(false);
        fabBtn.focus();
      }
    });
  }

  const spy = new IntersectionObserver(
    (entries) => entries.forEach((entry) => entry.isIntersecting && setActive(entry.target.id)),
    { rootMargin: '-45% 0px -54% 0px' }
  );
  links
    .map((link) => document.querySelector(link.getAttribute('href')))
    .filter(Boolean)
    .forEach((section) => spy.observe(section));

  /* ---------- Stats count-up ---------- */
  const countUp = (el) => {
    const raw = el.dataset.count;
    const target = parseFloat(raw);
    const decimals = (raw.split('.')[1] || '').length;
    const suffix = el.dataset.suffix || '';
    const duration = 1600;
    let start;

    el.style.minWidth = `${el.offsetWidth}px`; // keep layout steady while digits change
    const format = (n) =>
      n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

    const tick = (now) => {
      start ??= now;
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = format(target * eased) + suffix;
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  if (!reduceMotion()) {
    const counterObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          countUp(entry.target);
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.6 }
    );
    document.querySelectorAll('[data-count]').forEach((el) => counterObserver.observe(el));
  }

  /* ---------- Reveal sections as they scroll into view ---------- */
  // CSS hides [data-reveal] only under .reveal-ready, so nothing stays hidden if this script fails to load
  document.documentElement.classList.add('reveal-ready');
  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    },
    { rootMargin: '0px 0px -8% 0px' }
  );
  document.querySelectorAll('[data-reveal]').forEach((el) => revealObserver.observe(el));

  /* ---------- Client logos: endless loop ---------- */
  const initMarquee = (root) => {
    const track = root.querySelector('.marquee__track');
    const originals = [...track.children];
    const hoverZone = root.closest('.clients') || root;
    const prevBtn = document.querySelector(`[data-marquee-prev][aria-controls="${root.id}"]`);
    const nextBtn = document.querySelector(`[data-marquee-next][aria-controls="${root.id}"]`);
    const toggleBtn = document.querySelector(`[data-marquee-toggle][aria-controls="${root.id}"]`);
    const section = root.closest('[data-motion]'); // js/globe.js also pauses when this says "paused"
    const SPEED = 40; // px per second

    let setWidth = 0; // width of one full set of logos
    let step = 0; // width of one logo slot
    let offset = 0; // scroll position, always kept within [0, setWidth)
    let tween = null; // arrow-button glide in progress
    let hovering = false;
    let focused = false;
    let paused = false; // set by the pause button
    let drag = null;
    let onScreen = false;
    let frame = 0;
    let last = 0;

    const wrap = (x) => ((x % setWidth) + setWidth) % setWidth;
    const render = () => {
      track.style.transform = `translate3d(${-offset}px, 0, 0)`;
    };

    // Clone the set until the strip is covered with a full set to spare, so the loop never shows a gap
    const fill = () => {
      const oldWidth = setWidth;
      track.querySelectorAll('[data-clone]').forEach((clone) => clone.remove());
      setWidth = originals.reduce((sum, el) => sum + el.getBoundingClientRect().width, 0); // exact, not rounded
      step = originals[0].getBoundingClientRect().width;
      if (!setWidth || !step) return;

      const copies = Math.ceil(root.clientWidth / setWidth) + 1;
      for (let i = 0; i < copies; i++) {
        originals.forEach((item) => {
          const clone = item.cloneNode(true);
          clone.dataset.clone = '';
          clone.setAttribute('aria-hidden', 'true');
          clone.querySelector('img')?.setAttribute('alt', '');
          track.append(clone);
        });
      }
      offset = oldWidth ? wrap((offset / oldWidth) * setWidth) : 0;
      render();
    };

    const autoScroll = () => !reduceMotion() && !paused;
    const running = () => onScreen && (Boolean(tween) || autoScroll());

    const tick = (now) => {
      if (!running()) {
        frame = 0;
        return;
      }
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      if (tween) {
        const p = Math.min((now - tween.start) / tween.duration, 1);
        const eased = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
        offset = wrap(tween.from + tween.distance * eased);
        if (p === 1) tween = null;
      } else if (autoScroll() && !hovering && !focused && !drag) {
        offset = wrap(offset + SPEED * dt);
      }
      render();
      frame = requestAnimationFrame(tick);
    };

    const start = () => {
      if (frame || !running()) return;
      last = performance.now();
      frame = requestAnimationFrame(tick);
    };

    // Arrow buttons glide one logo along, landing on a slot boundary
    const nudge = (direction) => {
      if (!step) return;
      const base = tween ? tween.from + tween.distance : offset; // chained clicks build on the pending destination
      const target = (Math.round(base / step) + direction) * step;
      tween = { from: offset, distance: target - offset, start: performance.now(), duration: reduceMotion() ? 1 : 550 };
      start();
    };
    prevBtn?.addEventListener('click', () => nudge(-1));
    nextBtn?.addEventListener('click', () => nudge(1));

    // Pause button: stops the logos and the section's globe
    const setPaused = (value) => {
      paused = value;
      if (section) section.dataset.motion = value ? 'paused' : 'running';
      if (toggleBtn) {
        toggleBtn.dataset.state = value ? 'paused' : 'playing';
        toggleBtn.setAttribute('aria-label', value ? 'Play animations' : 'Pause animations');
      }
      start();
    };
    toggleBtn?.addEventListener('click', () => {
      if (paused) hovering = focused = false; // pressing Play should always resume straight away
      setPaused(!paused);
    });

    // Pause while the pointer is over the client strip or keyboard focus is inside it
    hoverZone.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'mouse') hovering = true;
    });
    hoverZone.addEventListener('pointerleave', () => {
      hovering = false;
    });
    // Only keyboard focus pauses; a mouse click focuses buttons too and shouldn't freeze the strip
    hoverZone.addEventListener('focusin', (e) => (focused = e.target.matches(':focus-visible')));
    hoverZone.addEventListener('focusout', () => (focused = false)); // the next focusin sets it again

    // Drag / swipe to scrub through the logos
    root.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      tween = null;
      drag = { x: e.clientX, offset };
      root.setPointerCapture(e.pointerId);
      root.classList.add('is-dragging');
    });
    root.addEventListener('pointermove', (e) => {
      if (!drag) return;
      offset = wrap(drag.offset - (e.clientX - drag.x));
      render();
    });
    const endDrag = () => {
      drag = null;
      root.classList.remove('is-dragging');
    };
    root.addEventListener('pointerup', endDrag);
    root.addEventListener('pointercancel', endDrag);
    root.addEventListener('dragstart', (e) => e.preventDefault());

    new ResizeObserver(fill).observe(root);
    new IntersectionObserver((entries) => {
      onScreen = entries[entries.length - 1].isIntersecting; // the latest entry wins if several queued up
      start();
    }).observe(root);
    motionQuery.addEventListener('change', start);
  };
  document.querySelectorAll('[data-marquee]').forEach(initMarquee);

  /* ---------- Services: featured panel, tabs and autoplay ---------- */
  const initServices = (root) => {
    const source = document.getElementById('services-data');
    if (!source) return;
    let data;
    try {
      data = JSON.parse(source.textContent);
    } catch (err) {
      console.warn('[services] services-data is not valid JSON; showing the static panel only.', err);
      return;
    }

    // Pair each tab with its entry by id (data-service), so the JSON order doesn't matter
    const byId = new Map(data.map((s) => [s.id, s]));
    const items = [...root.querySelectorAll('.service-tab')].flatMap((tab) => {
      const s = byId.get(tab.dataset.service);
      if (s) return [{ tab, s }];
      console.warn(`[services] no services-data entry for tab "${tab.dataset.service}"; hiding it.`);
      tab.hidden = true;
      return [];
    });
    if (!items.length) return;

    const list = root.querySelector('.service-tabs__list');
    const body = root.querySelector('.service-panel__body');
    const media = root.querySelector('.service-panel__media');
    const controls = media.querySelector('.service-panel__controls');

    const toggleBtn = root.querySelector('[data-service-toggle]');
    const slots = (name) => root.querySelectorAll(`[data-slot="${name}"]`);
    const pad = (n) => String(n).padStart(2, '0');
    const AUTOPLAY_MS = 7000;

    let index = 0;
    let autoplay = !reduceMotion(); // the pause/play button toggles it
    let elapsed = 0;
    let last = 0;
    let frame = 0;
    let focused = false;
    let onScreen = false;
    let token = 0;

    slots('total').forEach((el) => (el.textContent = pad(items.length)));

    const renderFeatures = (features) =>
      features.map(([icon, label]) => {
        const li = document.createElement('li');
        li.innerHTML = `<span class="service-features__icon"><svg class="icon" aria-hidden="true"><use href="#${icon}" /></svg></span>`;
        li.append(label);
        return li;
      });

    const fillText = (s, i) => {
      slots('number').forEach((el) => (el.textContent = pad(i + 1)));
      slots('icon').forEach((el) => el.setAttribute('href', `#${s.icon}`));
      slots('title').forEach((el) => (el.textContent = s.title));
      slots('description').forEach((el) => (el.textContent = s.description));
      slots('cta-label').forEach((el) => (el.textContent = s.cta));
      slots('features').forEach((el) => el.replaceChildren(...renderFeatures(s.features)));
    };

    // Reserve the tallest service's height so the page below never jumps between services
    let measuredWidth = 0;
    const reserveHeight = (force = false) => {
      const width = body.clientWidth;
      if (!width || (width === measuredWidth && !force)) return;
      measuredWidth = width;
      body.style.minHeight = '';
      let tallest = 0;
      items.forEach(({ s }, i) => {
        fillText(s, i);
        tallest = Math.max(tallest, body.offsetHeight);
      });
      fillText(items[index].s, index);
      body.style.minHeight = `${tallest}px`;
    };

    // Cross-fade to the new image once it has decoded, so it never flashes in half-loaded
    const swapImage = (s, current) => {
      const shown = media.querySelector('.service-panel__img.is-current');
      if (shown?.getAttribute('src') === s.image) {
        // Already on screen: drop any newer image still loading so it can't take over later
        media.querySelectorAll('.service-panel__img:not(.is-current)').forEach((el) => el.remove());
        return;
      }
      const img = document.createElement('img');
      img.className = 'service-panel__img';
      img.alt = s.alt;
      img.width = 864;
      img.height = 390;
      img.src = s.image;
      media.insertBefore(img, controls);
      const reveal = () => {
        if (current !== token) return img.remove(); // a newer service was picked meanwhile
        requestAnimationFrame(() => {
          if (current !== token) return img.remove(); // …or was picked during this frame
          // Only retire the images this one replaces; never ones still loading
          const replaced = [...media.querySelectorAll('.service-panel__img.is-current')];
          img.classList.add('is-current');
          replaced.forEach((el) => el.classList.remove('is-current'));
          setTimeout(() => replaced.forEach((el) => el.remove()), 700);
        });
      };
      img.decode().then(reveal, reveal);
    };

    // Autoplay countdown, drawn as a ring around the active tab's icon (it holds still while paused)
    const updateProgress = () => {
      const p = Math.min(elapsed / AUTOPLAY_MS, 1);
      items.forEach(({ tab }, t) => tab.style.setProperty('--p', t === index ? p.toFixed(4) : '0'));
    };

    // Optional YouTube video: a play button over the slide image; the player loads only when pressed
    const setVideo = (s) => {
      media.querySelector('.service-video')?.remove();
      media.querySelector('.media-play')?.remove();
      media.classList.remove('is-playing');
      if (!s.video) return;
      const play = document.createElement('button');
      play.type = 'button';
      play.className = 'media-play';
      play.setAttribute('aria-label', `Play video: ${s.title}`);
      play.innerHTML = '<span class="play-btn__icon"><svg aria-hidden="true"><use href="#i-play" /></svg></span>';
      play.addEventListener('click', () => {
        const frame = document.createElement('iframe');
        frame.className = 'service-video';
        frame.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(s.video)}?autoplay=1&rel=0&modestbranding=1`;
        frame.title = `${s.title} video`;
        frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
        frame.allowFullscreen = true;
        play.replaceWith(frame);
        media.classList.add('is-playing');
        autoplay = false; // don't move to the next service mid-video
        syncToggle();
        frame.focus();
      });
      media.insertBefore(play, controls);
    };

    const syncToggle = () => {
      if (!toggleBtn) return;
      toggleBtn.dataset.state = autoplay ? 'playing' : 'paused';
      toggleBtn.setAttribute('aria-label', autoplay ? 'Pause autoplay' : 'Play autoplay');
    };

    const show = (i, { instant = false, focusTab = false, announce = false } = {}) => {
      index = (i + items.length) % items.length;
      const { tab, s } = items[index];
      const current = ++token;
      body.setAttribute('aria-live', announce ? 'polite' : 'off'); // announce the visitor's own changes only

      items.forEach((item, t) => {
        const on = t === index;
        item.tab.setAttribute('aria-selected', String(on));
        item.tab.tabIndex = on ? 0 : -1;
      });
      body.setAttribute('aria-labelledby', tab.id);
      if (focusTab) tab.focus({ preventScroll: true });
      // Keep the active tab in view when the row scrolls (smaller screens)
      if (list.scrollWidth > list.clientWidth) {
        list.scrollTo({
          left: tab.offsetLeft - (list.clientWidth - tab.offsetWidth) / 2,
          behavior: instant || reduceMotion() ? 'auto' : 'smooth',
        });
      }

      if (instant || reduceMotion()) {
        fillText(s, index);
      } else {
        body.classList.add('is-changing');
        setTimeout(() => {
          if (current !== token) return;
          fillText(s, index);
          body.classList.remove('is-changing');
        }, 180);
      }
      swapImage(s, current);
      setVideo(s);
      elapsed = 0;
      updateProgress();
    };

    // Visitor-driven navigation restarts the countdown (show() resets it)
    const go = (i, opts) => {
      show(i, { ...opts, announce: true });
      start();
    };
    root.querySelectorAll('[data-service-prev]').forEach((btn) => btn.addEventListener('click', () => go(index - 1)));
    root.querySelectorAll('[data-service-next]').forEach((btn) => btn.addEventListener('click', () => go(index + 1)));
    items.forEach(({ tab }, t) => tab.addEventListener('click', () => go(t)));

    toggleBtn?.addEventListener('click', () => {
      autoplay = !autoplay; // an explicit choice, so it's honoured even with reduced motion
      if (autoplay) focused = false; // pressing Play should always resume straight away
      syncToggle();
      start(); // carries on from where the ring stopped
    });

    // Tablist keyboard support: arrows, Home and End
    list.addEventListener('keydown', (e) => {
      const keys = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: items.length - 1 };
      if (!(e.key in keys)) return;
      e.preventDefault();
      go(keys[e.key], { focusTab: true });
    });

    // Swipe the image on touch screens
    let swipeX = null;
    media.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' && !e.target.closest('button')) swipeX = e.clientX;
    });
    media.addEventListener('pointerup', (e) => {
      if (swipeX === null) return;
      const dx = e.clientX - swipeX;
      swipeX = null;
      if (Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1));
    });
    media.addEventListener('pointercancel', () => (swipeX = null));

    // A faded edge hints that the tab row scrolls
    const markScrollable = () => list.classList.toggle('is-scrollable', list.scrollWidth > list.clientWidth + 1);

    /* Autoplay: pauses for keyboard focus, when off-screen or in a background tab, or via the pause button */
    const running = () => autoplay && onScreen && !focused && !document.hidden;
    const tick = (now) => {
      frame = 0;
      if (!running()) return;
      elapsed += Math.min(now - last, 100);
      last = now;
      if (elapsed >= AUTOPLAY_MS) show(index + 1);
      updateProgress();
      frame = requestAnimationFrame(tick);
    };
    const start = () => {
      if (frame || !running()) return;
      last = performance.now();
      frame = requestAnimationFrame(tick);
    };

    // Only keyboard focus pauses; a mouse click focuses buttons too
    root.addEventListener('focusin', (e) => (focused = e.target.matches(':focus-visible')));
    root.addEventListener('focusout', () => {
      focused = false; // the next focusin sets it again
      start();
    });
    document.addEventListener('visibilitychange', start);
    motionQuery.addEventListener('change', () => {
      if (reduceMotion()) autoplay = false;
      syncToggle();
    });

    let preloaded = false;
    new IntersectionObserver(
      (entries) => {
        onScreen = entries[entries.length - 1].isIntersecting; // the latest entry wins if several queued up
        if (onScreen && !preloaded) {
          preloaded = true;
          items.forEach(({ s }) => (new Image().src = s.image)); // warm the cache for quick switching
        }
        start();
      },
      { threshold: 0.35 }
    ).observe(root);

    new ResizeObserver(() => {
      reserveHeight();
      markScrollable();
    }).observe(root);
    document.fonts?.ready.then(() => reserveHeight(true)); // web fonts change line breaks

    syncToggle();
    show(0, { instant: true });
  };
  document.querySelectorAll('[data-services]').forEach(initServices);

  /* ---------- Why TECEZE: expanding panels ---------- */
  document.querySelectorAll('[data-why-acc]').forEach((root) => {
    const panels = [...root.querySelectorAll('.why-acc__panel')];
    let active = panels.findIndex((p) => p.classList.contains('is-active'));
    const open = (i) => {
      active = (i + panels.length) % panels.length;
      panels.forEach((p, n) => {
        p.classList.toggle('is-active', n === active);
        p.querySelector('.why-acc__toggle').setAttribute('aria-expanded', String(n === active));
      });
    };
    panels.forEach((p, n) => p.querySelector('.why-acc__toggle').addEventListener('click', () => open(n)));
    root.querySelector('[data-why-prev]')?.addEventListener('click', () => open(active - 1));
    root.querySelector('[data-why-next]')?.addEventListener('click', () => open(active + 1));
  });

  /* ---------- Testimonials: auto-sliding carousel with dots ---------- */
  const quoteTrack = document.getElementById('quote-track');
  const quoteDots = document.querySelector('[data-quote-dots]');
  if (quoteTrack && quoteDots) {
    const cardsList = [...quoteTrack.children];
    const QUOTE_MS = 5000;
    let positions = 0;
    let timer = 0;
    let paused = false;
    const step = () => cardsList[0].offsetWidth + parseFloat(getComputedStyle(quoteTrack).columnGap || 0);
    const current = () => Math.min(Math.round(quoteTrack.scrollLeft / step()), positions - 1);
    const goTo = (i) => quoteTrack.scrollTo({ left: i * step(), behavior: reduceMotion() ? 'auto' : 'smooth' });

    // One dot per scroll position (cards that can sit first in view)
    const buildDots = () => {
      const perView = Math.max(1, Math.round(quoteTrack.clientWidth / step()));
      const count = Math.max(1, cardsList.length - perView + 1);
      if (count === positions) return;
      positions = count;
      quoteDots.replaceChildren(...Array.from({ length: count }, (_, i) => {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'tdots__dot';
        dot.setAttribute('aria-label', `Show testimonials from ${i + 1}`);
        dot.addEventListener('click', () => { goTo(i); restart(); });
        return dot;
      }));
      quoteDots.hidden = count < 2;
      markDot();
    };
    const markDot = () => [...quoteDots.children].forEach((d, i) => d.setAttribute('aria-current', String(i === current())));

    const tick = () => goTo(current() >= positions - 1 ? 0 : current() + 1);
    const restart = () => {
      clearInterval(timer);
      if (!paused && !reduceMotion() && positions > 1) timer = setInterval(tick, QUOTE_MS);
    };
    const section = quoteTrack.closest('section');
    section.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') { paused = true; restart(); } });
    section.addEventListener('pointerleave', () => { paused = false; restart(); });
    section.addEventListener('focusin', () => { paused = true; restart(); });
    section.addEventListener('focusout', () => { paused = false; restart(); });
    quoteTrack.addEventListener('scroll', markDot, { passive: true });
    new ResizeObserver(() => { buildDots(); restart(); }).observe(quoteTrack);
    motionQuery.addEventListener('change', restart);
  }

  /* ---------- Insights: topic filter ---------- */
  const chips = [...document.querySelectorAll('.chip[data-filter]')];
  if (chips.length) {
    const posts = [...document.querySelectorAll('[data-posts] .post')];
    const empty = document.querySelector('[data-posts-empty]');
    chips.forEach((chip) =>
      chip.addEventListener('click', () => {
        const filter = chip.dataset.filter;
        chips.forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
        let shown = 0;
        posts.forEach((post) => {
          const match = filter === 'all' || post.dataset.category === filter;
          post.hidden = !match;
          if (match) shown++;
        });
        if (empty) empty.hidden = shown > 0;
      })
    );
  }

  /* ---------- Contact form: validation and a thank-you message (no backend yet) ---------- */
  const contactForm = document.querySelector('[data-contact-form]');
  if (contactForm) {
    const success = document.querySelector('[data-contact-success]');
    const message = contactForm.querySelector('textarea');
    const charCount = contactForm.querySelector('[data-count-chars]');
    message?.addEventListener('input', () => (charCount.textContent = String(message.value.length)));

    const errorFor = (field) => {
      const value = field.value.trim();
      if (field.required && !value) return 'This field is required.';
      if (field.type === 'email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Please enter a valid email address.';
      return '';
    };
    const check = (field) => {
      const error = errorFor(field);
      const out = document.getElementById(`${field.id}-err`);
      if (out) out.textContent = error;
      field.setAttribute('aria-invalid', String(Boolean(error)));
      return !error;
    };
    const fields = [...contactForm.querySelectorAll('input[required], select[required]')];
    fields.forEach((field) => {
      field.addEventListener('blur', () => field.value && check(field));
      field.addEventListener('input', () => field.getAttribute('aria-invalid') === 'true' && check(field));
    });
    contactForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const invalid = fields.filter((field) => !check(field));
      if (invalid.length) {
        invalid[0].focus();
        return;
      }
      contactForm.hidden = true;
      success.hidden = false;
      success.focus();
    });
  }

  /* ---------- Footer newsletter ---------- */
  const newsletter = document.querySelector('[data-newsletter]');
  if (newsletter) {
    const msg = document.querySelector('[data-newsletter-msg]');
    newsletter.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = newsletter.querySelector('input');
      const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value.trim());
      input.setAttribute('aria-invalid', String(!ok));
      msg.textContent = ok ? 'Thanks for subscribing! Watch your inbox for our next update.' : 'Please enter a valid email address.';
      if (ok) newsletter.reset();
    });
  }

  /* ---------- Video modal ---------- */
  const dialog = document.getElementById('video-modal');
  const frame = dialog.querySelector('.video-modal__frame');

  document.querySelectorAll('[data-video-open]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const src = frame.dataset.videoSrc;
      if (src) {
        const iframe = document.createElement('iframe');
        iframe.src = src;
        iframe.title = 'TECEZE video';
        iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
        frame.append(iframe);
      }
      dialog.showModal();
    })
  );

  // Close on the X button or a click on the backdrop
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog || e.target.closest('[data-video-close]')) dialog.close();
  });
  // Stop playback when closed
  dialog.addEventListener('close', () => frame.querySelector('iframe')?.remove());
})();
