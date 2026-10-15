/* ==========================================================================
   Dotted globe — decorative canvas behind the Trust & Credibility stats

   Markup:  <canvas class="…" data-globe aria-hidden="true"></canvas>
   Size the canvas with CSS (a square); it is drawn at devicePixelRatio (max 2).

   Optional attributes
     data-globe-speed="3.6"     spin in degrees per second (default 3.6 = one turn
                                per 100 s; 0 = still, negative = spin the other way)
     data-globe-center="60,20"  initial view centre as "lon,lat" in degrees

   An ancestor with data-motion="paused" (set by a pause button) stops the spin.

   Land shapes come from world-atlas on jsDelivr. If they can't be loaded the
   canvas is left empty and a single console warning is logged.
   ========================================================================== */
(() => {
  const D3_GEO = 'https://cdn.jsdelivr.net/npm/d3-geo@3.1.1/+esm';
  const TOPOJSON = 'https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/+esm';
  const LAND = 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/land-110m.json';
  const LAND_LOCAL = 'assets/data/land-110m.json'; // bundled copy, for hosts that block external data requests

  const RAD = Math.PI / 180;
  const GLOBE_SCALE = 0.41; // globe radius as a share of the canvas
  const DOT_STEP = 0.85; // dot grid spacing, degrees
  const DOT_COLOR = '#8fb4e8';
  const DOT_ALPHA = 0.55;
  const LEVELS = 6; // alpha steps as dots fade towards the limb
  const LIMB_FADE = 0.55; // depth (0 at the limb, 1 facing us) where the fade ends
  const ARC_COLOR = '#3b8ef5';
  const ARC_ALPHA = 0.5;
  const ARC_LEVELS = 4; // alpha steps as arcs fade out over the horizon
  const ARC_HORIZON_FADE = 0.2; // depth in front of the limb plane where arcs start to fade out
  const PULSE_COLOR = '#0c8bf4';
  const ARC_STEPS = 56; // samples per arc
  const FADE_IN = 900; // ms
  const DEFAULT_SPEED = 3.6;
  const DEFAULT_CENTER = [60, 20];

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const toVec = (lon, lat) => {
    const l = lon * RAD;
    const p = lat * RAD;
    return [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)];
  };

  /* ---------- Cities and the routes between them ---------- */
  const CITIES = {
    chennai: { lon: 80.27, lat: 13.08, color: '#0c8bf4', r: 3.6 },
    london: { lon: -0.13, lat: 51.51, color: '#0c8bf4', r: 3.4 },
    dubai: { lon: 55.27, lat: 25.2, color: '#51a8fc', r: 3 },
    frankfurt: { lon: 8.68, lat: 50.11, color: '#92cafd', r: 3 },
    singapore: { lon: 103.82, lat: 1.35, color: '#51a8fc', r: 3.2 },
    sydney: { lon: 151.21, lat: -33.87, color: '#92cafd', r: 3 },
    newYork: { lon: -74.01, lat: 40.71, color: '#51a8fc', r: 3.2 },
    sanFrancisco: { lon: -122.42, lat: 37.77, color: '#92cafd', r: 3 },
  };
  const ROUTES = [
    ['chennai', 'london'],
    ['chennai', 'singapore'],
    ['dubai', 'chennai'],
    ['dubai', 'frankfurt'],
    ['london', 'newYork'],
    ['frankfurt', 'sanFrancisco'],
    ['singapore', 'sydney'],
  ];

  const NODES = Object.values(CITIES).map((c) => ({ ...c, v: toVec(c.lon, c.lat) }));

  // Great circles lifted off the surface by sin(pi*t); longer routes fly higher
  const ARC_POINTS = new Float32Array(ROUTES.length * ARC_STEPS * 3);
  ROUTES.forEach(([from, to], r) => {
    const a = toVec(CITIES[from].lon, CITIES[from].lat);
    const b = toVec(CITIES[to].lon, CITIES[to].lat);
    const omega = Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
    const lift = Math.min(0.18, 0.05 + 0.12 * omega);
    for (let s = 0; s < ARC_STEPS; s++) {
      const t = s / (ARC_STEPS - 1);
      const wa = Math.sin((1 - t) * omega) / Math.sin(omega);
      const wb = Math.sin(t * omega) / Math.sin(omega);
      const h = 1 + lift * Math.sin(Math.PI * t);
      const i = (r * ARC_STEPS + s) * 3;
      for (let k = 0; k < 3; k++) ARC_POINTS[i + k] = (wa * a[k] + wb * b[k]) * h;
    }
  });

  // A faint orbit ring, fixed in view space (x right, y up, z towards the viewer)
  const RING_STEPS = 160;
  const RING = new Float32Array(RING_STEPS * 3); // x, y, visible
  (() => {
    const size = 1.13;
    const tilt = 78 * RAD; // how edge-on the ring is
    const roll = -16 * RAD;
    for (let s = 0; s < RING_STEPS; s++) {
      const th = (s / (RING_STEPS - 1)) * Math.PI * 2;
      const x = size * Math.cos(th);
      const y = size * Math.sin(th) * Math.cos(tilt);
      const z = -size * Math.sin(th) * Math.sin(tilt);
      const rx = x * Math.cos(roll) - y * Math.sin(roll);
      const ry = x * Math.sin(roll) + y * Math.cos(roll);
      RING[s * 3] = rx;
      RING[s * 3 + 1] = ry;
      RING[s * 3 + 2] = z > 0 || rx * rx + ry * ry > 1 ? 1 : 0;
    }
  })();

  /* ---------- Land dots: built once, shared by every globe ---------- */
  let landPromise;
  let warned = false;
  const warn = (err) => {
    if (warned) return;
    warned = true;
    console.warn('[globe] Map data could not be loaded; the globe is left empty.', err);
  };

  const buildDots = async () => {
    const [geo, topo, atlas] = await Promise.all([
      import(D3_GEO),
      import(TOPOJSON),
      fetch(LAND_LOCAL)
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
        .catch(() => fetch(LAND).then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status} for ${LAND}`);
          return res.json();
        })),
    ]);

    // Paint the land onto an equirectangular map, then sample it on an even grid
    const W = 1440;
    const H = 720;
    const map = document.createElement('canvas');
    map.width = W;
    map.height = H;
    const g = map.getContext('2d', { willReadFrequently: true });
    const projection = geo.geoEquirectangular().scale(W / (2 * Math.PI)).translate([W / 2, H / 2]);
    g.beginPath();
    geo.geoPath(projection, g)(topo.feature(atlas, atlas.objects.land));
    g.fill();
    const alpha = g.getImageData(0, 0, W, H).data;

    const out = [];
    for (let lat = -90 + DOT_STEP / 2; lat < 90; lat += DOT_STEP) {
      const cosLat = Math.cos(lat * RAD);
      const perRow = Math.max(1, Math.round((360 / DOT_STEP) * cosLat)); // fewer dots near the poles
      const y = Math.min(H - 1, Math.floor(((90 - lat) / 180) * H));
      for (let i = 0; i < perRow; i++) {
        const lon = -180 + ((i + 0.5) * 360) / perRow;
        const x = Math.min(W - 1, Math.floor(((lon + 180) / 360) * W));
        if (alpha[(y * W + x) * 4 + 3] > 127) out.push(...toVec(lon, lat));
      }
    }
    return new Float32Array(out);
  };

  const loadLand = () =>
    (landPromise ??= buildDots().catch((err) => {
      warn(err);
      return null;
    }));

  /* ---------- One globe per canvas ---------- */
  const parseCenter = (value) => {
    const [lon, lat] = String(value || '').split(',').map(Number);
    return Number.isFinite(lon) && Number.isFinite(lat) ? [lon, Math.max(-90, Math.min(90, lat))] : DEFAULT_CENTER;
  };

  const createGlobe = (canvas) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const speedAttr = parseFloat(canvas.dataset.globeSpeed);
    const speed = Number.isFinite(speedAttr) ? speedAttr : DEFAULT_SPEED;
    const [lon0, lat0] = parseCenter(canvas.dataset.globeCenter);
    const cosLat0 = Math.cos(lat0 * RAD);
    const sinLat0 = Math.sin(lat0 * RAD);

    let width = 0;
    let height = 0;
    let dpr = 1;
    let cx = 0;
    let cy = 0;
    let radius = 0;
    let dotSize = 2;
    let lon = lon0;
    let clock = 0; // ms of animation since the land arrived
    let last = 0;
    let raf = 0;
    let onScreen = true;
    let requested = false;
    let sheen = null;

    // Scratch buffers, allocated once the land is known
    let dots = null;
    let dotX;
    let dotY;
    let dotLevel;
    const arcX = new Float32Array(ARC_POINTS.length / 3);
    const arcY = new Float32Array(arcX.length);
    const arcW = new Float32Array(arcX.length); // 1 in front, fading to 0 at the horizon

    // Point on an arc at fractional sample f (written to pt); returns its visibility, 0 if hidden
    const pt = { x: 0, y: 0 };
    const arcAt = (base, f) => {
      const i = Math.min(Math.floor(f), ARC_STEPS - 2);
      const t = f - i;
      const a = base + i;
      const w = Math.min(arcW[a], arcW[a + 1]);
      if (w > 0) {
        pt.x = arcX[a] + (arcX[a + 1] - arcX[a]) * t;
        pt.y = arcY[a] + (arcY[a + 1] - arcY[a]) * t;
      }
      return w;
    };

    const dot = (x, y, r, color, alpha) => {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    };

    // live = animating (fade-in, pulses, satellites); otherwise one still frame
    const draw = (live) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      if (!dots || radius <= 0) return;

      const fade = live ? Math.min(1, clock / FADE_IN) : 1;
      const cosLon = Math.cos(lon * RAD);
      const sinLon = Math.sin(lon * RAD);

      // Orbit ring (behind everything else)
      ctx.globalAlpha = 0.28 * fade;
      ctx.strokeStyle = DOT_COLOR;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let s = 0, pen = false; s < RING_STEPS; s++) {
        const x = cx + radius * RING[s * 3];
        const y = cy - radius * RING[s * 3 + 1];
        if (!RING[s * 3 + 2]) {
          pen = false;
        } else if (pen) {
          ctx.lineTo(x, y);
        } else {
          ctx.moveTo(x, y);
          pen = true;
        }
      }
      ctx.stroke();

      // Sphere: soft fill and a faint outline
      ctx.globalAlpha = fade;
      ctx.fillStyle = sheen;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.32 * fade;
      ctx.stroke();

      // Land dots on the near hemisphere, bucketed by depth so each alpha is one fill
      let count = 0;
      for (let i = 0, n = dots.length; i < n; i += 3) {
        const x = dots[i];
        const y = dots[i + 1];
        const z = dots[i + 2];
        const a = x * cosLon + y * sinLon;
        const depth = sinLat0 * z + cosLat0 * a;
        if (depth <= 0.015) continue;
        dotX[count] = cx + radius * (y * cosLon - x * sinLon);
        dotY[count] = cy - radius * (cosLat0 * z - sinLat0 * a);
        dotLevel[count] = depth >= LIMB_FADE ? LEVELS - 1 : ((depth / LIMB_FADE) * LEVELS) | 0;
        count++;
      }
      ctx.fillStyle = DOT_COLOR;
      for (let l = 0; l < LEVELS; l++) {
        const k = (l + 1) / LEVELS;
        const size = dotSize * (0.6 + 0.4 * k);
        const half = size / 2;
        ctx.globalAlpha = DOT_ALPHA * k * fade;
        ctx.beginPath();
        for (let j = 0; j < count; j++) {
          if (dotLevel[j] === l) ctx.rect(dotX[j] - half, dotY[j] - half, size, size);
        }
        ctx.fill();
      }

      // Arcs: full strength in front, fading out towards the horizon so nothing behind the globe shows
      for (let i = 0, n = arcX.length; i < n; i++) {
        const x = ARC_POINTS[i * 3];
        const y = ARC_POINTS[i * 3 + 1];
        const z = ARC_POINTS[i * 3 + 2];
        const a = x * cosLon + y * sinLon;
        const vx = y * cosLon - x * sinLon;
        const vy = cosLat0 * z - sinLat0 * a;
        const depth = sinLat0 * z + cosLat0 * a;
        arcX[i] = cx + radius * vx;
        arcY[i] = cy - radius * vy;
        arcW[i] = depth > 0 ? Math.min(1, depth / ARC_HORIZON_FADE) : 0;
      }
      ctx.strokeStyle = ARC_COLOR;
      ctx.lineWidth = 1.25;
      ctx.lineCap = 'butt'; // round caps would double up where two alpha steps meet
      for (let level = 1; level <= ARC_LEVELS; level++) {
        ctx.globalAlpha = ARC_ALPHA * (level / ARC_LEVELS) * fade;
        ctx.beginPath();
        for (let i = 1, n = arcX.length, pen = false; i < n; i++) {
          const w = Math.min(arcW[i - 1], arcW[i]);
          if (i % ARC_STEPS === 0 || Math.ceil(w * ARC_LEVELS) !== level) {
            pen = false;
            continue;
          }
          if (!pen) ctx.moveTo(arcX[i - 1], arcY[i - 1]);
          ctx.lineTo(arcX[i], arcY[i]);
          pen = true;
        }
        ctx.stroke();
      }

      // A light pulse running along each arc, then a pause
      if (live) {
        ctx.strokeStyle = PULSE_COLOR;
        ctx.lineWidth = 1.8;
        ctx.lineCap = 'round';
        for (let r = 0; r < ROUTES.length; r++) {
          const travel = 2600 + r * 330;
          const head = ((clock / travel + r * 0.37) % 1.7) * (ARC_STEPS - 1); // > ARC_STEPS - 1 = resting
          const tail = Math.max(0, head - 0.22 * (ARC_STEPS - 1));
          const end = Math.min(head, ARC_STEPS - 1);
          if (tail >= end) continue;
          const base = r * ARC_STEPS;
          const parts = 10;
          for (let p = 0; p < parts; p++) {
            const w0 = arcAt(base, tail + ((end - tail) * p) / parts);
            if (!w0) continue;
            const x0 = pt.x;
            const y0 = pt.y;
            const w1 = arcAt(base, tail + ((end - tail) * (p + 1)) / parts);
            if (!w1) continue;
            ctx.globalAlpha = 0.9 * fade * Math.min(w0, w1) * ((p + 1) / parts) ** 1.6;
            ctx.beginPath();
            ctx.moveTo(x0, y0);
            ctx.lineTo(pt.x, pt.y);
            ctx.stroke();
          }
          const w = head <= ARC_STEPS - 1 ? arcAt(base, head) : 0;
          if (w) {
            dot(pt.x, pt.y, 5, PULSE_COLOR, 0.18 * fade * w);
            dot(pt.x, pt.y, 2, PULSE_COLOR, 0.95 * fade * w);
          }
        }
      }

      // City nodes with a soft halo
      for (const node of NODES) {
        const x = node.v[0];
        const y = node.v[1];
        const z = node.v[2];
        const a = x * cosLon + y * sinLon;
        const depth = sinLat0 * z + cosLat0 * a;
        if (depth <= 0.03) continue;
        const nx = cx + radius * (y * cosLon - x * sinLon);
        const ny = cy - radius * (cosLat0 * z - sinLat0 * a);
        const k = Math.min(1, depth / 0.35) * fade;
        dot(nx, ny, node.r * 2.6, node.color, 0.16 * k);
        dot(nx, ny, node.r, node.color, k);
      }

      // Two small satellites on the orbit ring
      if (live) {
        for (let m = 0; m < 2; m++) {
          const f = ((clock / 26000 + m * 0.5) % 1) * (RING_STEPS - 1);
          const s = Math.floor(f);
          if (!RING[s * 3 + 2] || !RING[s * 3 + 5]) continue;
          const t = f - s;
          const x = RING[s * 3] + (RING[s * 3 + 3] - RING[s * 3]) * t;
          const y = RING[s * 3 + 1] + (RING[s * 3 + 4] - RING[s * 3 + 1]) * t;
          const color = m ? '#92cafd' : '#51a8fc';
          dot(cx + radius * x, cy - radius * y, 6, color, 0.18 * fade);
          dot(cx + radius * x, cy - radius * y, 2.6, color, 0.85 * fade);
        }
      }
      ctx.globalAlpha = 1;
    };

    /* ---------- Motion: spin while on screen, one still frame for reduced motion ---------- */
    const frame = (now) => {
      const dt = last ? Math.min(now - last, 64) : 16;
      last = now;
      clock += dt;
      lon -= (speed * dt) / 1000; // the view drifts west, so the surface moves eastward like the Earth's
      if (lon < -180) lon += 360;
      else if (lon >= 180) lon -= 360;
      draw(true);
      raf = requestAnimationFrame(frame);
    };
    // A pause button elsewhere on the page can set data-motion="paused" on an ancestor
    const host = canvas.closest('[data-motion]');
    const paused = () => host?.dataset.motion === 'paused';

    const update = () => {
      const run = dots && onScreen && !document.hidden && !reduceMotion.matches && !paused();
      if (run && !raf) {
        last = 0;
        raf = requestAnimationFrame(frame);
      } else if (!run && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };

    new IntersectionObserver(
      (entries) => {
        const e = entries[entries.length - 1]; // the latest entry wins if several queued up
        // The page fades the canvas out towards the bottom, so only count the top 80% as visible
        const hiddenFrom = e.boundingClientRect.top + e.boundingClientRect.height * 0.8;
        onScreen = e.isIntersecting && e.intersectionRect.top < hiddenFrom;
        update();
      },
      { rootMargin: '100px', threshold: Array.from({ length: 11 }, (_, i) => i / 10) }
    ).observe(canvas);
    document.addEventListener('visibilitychange', update);
    if (host) new MutationObserver(update).observe(host, { attributes: true, attributeFilter: ['data-motion'] });
    reduceMotion.addEventListener?.('change', () => {
      if (reduceMotion.matches) draw(false);
      update();
    });

    // Called once the shared land dots are ready
    const start = (data) => {
      if (!data) return;
      dots = data;
      dotX = new Float32Array(data.length / 3);
      dotY = new Float32Array(data.length / 3);
      dotLevel = new Uint8Array(data.length / 3);
      draw(!reduceMotion.matches); // blank until the fade-in starts, unless motion is reduced
      update();
    };

    /* ---------- Size: follow CSS, crisp at devicePixelRatio ---------- */
    const resize = (entries) => {
      const box = entries[entries.length - 1].contentRect; // fractional CSS px, unlike clientWidth
      width = box.width;
      height = box.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(width * dpr);
      const h = Math.round(height * dpr);
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;

      cx = width / 2;
      cy = height / 2;
      radius = Math.min(width, height) * GLOBE_SCALE;
      dotSize = Math.max(1, Math.min(3.2, radius * DOT_STEP * RAD * 0.52));
      if (radius <= 0) return;
      sheen = ctx.createRadialGradient(cx - radius * 0.35, cy - radius * 0.4, radius * 0.05, cx, cy, radius);
      sheen.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
      sheen.addColorStop(1, 'rgba(222, 234, 250, 0.25)');
      if (!requested) {
        requested = true; // only fetch the map once the canvas is actually laid out
        loadLand().then(start).catch(warn);
      }
      draw(!reduceMotion.matches);
    };
    const sizer = new ResizeObserver(resize);
    try {
      sizer.observe(canvas, { box: 'device-pixel-content-box' }); // also fires when only the pixel ratio changes
    } catch {
      sizer.observe(canvas);
    }
  };

  const init = () => {
    if (!('ResizeObserver' in window && 'IntersectionObserver' in window)) return;
    document.querySelectorAll('canvas[data-globe]').forEach((canvas) => {
      if (canvas.dataset.globeReady) return;
      canvas.dataset.globeReady = 'true';
      try {
        createGlobe(canvas);
      } catch (err) {
        warn(err);
      }
    });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
