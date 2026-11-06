/**
 * Reconnect Canvas Dot-Matrix Hands Background Simulation
 * Exact math, crop tiles, dissolve shaders, and loop preserved 100% as-is.
 */
export function initDotMatrixCanvas() {
  const canvas = document.getElementById('dots');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');

  const SHEET_URL = 'https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20261030_025250_100df7b8-31fd-4614-aa4a-c1b7d5b6b273.png&w=1600&q=85';
  const SHEET_W = 2688;
  const SHEET_H = 1520;

  // Crop coordinates in fractions [x, y, w, h]
  const RECTS = {
    LA: [0, 0.06, 0.47, 0.40],
    RA: [0.53, 0.06, 0.47, 0.40],
    LB: [0, 0.55, 0.47, 0.40],
    RB: [0.53, 0.55, 0.47, 0.40]
  };

  const tiles = {};
  let tilesLoaded = false;

  // Prepare tiles
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = SHEET_URL;
  img.onload = () => {
    const sw = img.naturalWidth || 1600;
    const sh = img.naturalHeight || 905;

    for (const [key, [rx, ry, rw, rh]] of Object.entries(RECTS)) {
      const tileCanvas = document.createElement('canvas');
      const tw = 420;
      const th = Math.round(tw * ((rh * sh) / (rw * sw)));
      tileCanvas.width = tw;
      tileCanvas.height = th;
      const tctx = tileCanvas.getContext('2d');
      tctx.imageSmoothingQuality = 'high';
      tctx.imageSmoothingEnabled = true;

      tctx.drawImage(
        img,
        rx * sw, ry * sh, rw * sw, rh * sh,
        0, 0, tw, th
      );
      tiles[key] = { canvas: tileCanvas, aspect: (rh * 1520) / (rw * 2688) };
    }
    tilesLoaded = true;
  };

  // Math helpers
  function clamp(x, min, max) {
    return Math.max(min, Math.min(max, x));
  }
  function smooth(a, b, x) {
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  }
  function mixAt(t, on, off, dur) {
    return smooth(on, on + dur, t) * (1 - smooth(off, off + dur, t));
  }
  function hash(a, b) {
    const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453123;
    return s - Math.floor(s);
  }

  let W = 0, H = 0, DPR = 1;
  let step = 7, rowStep = 14.35;
  let cols = 0, rows = 0;
  let R = 3.2;
  let seeds = null;

  // Offscreen field canvases
  const fACanvas = document.createElement('canvas');
  const fBCanvas = document.createElement('canvas');
  const fACtx = fACanvas.getContext('2d', { willReadFrequently: true });
  const fBCtx = fBCanvas.getContext('2d', { willReadFrequently: true });

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    DPR = Math.min(2, window.devicePixelRatio || 1);

    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);

    step = Math.max(5, W / 205);
    rowStep = step * 2.05;
    cols = Math.ceil(W / step);
    rows = Math.ceil(H / rowStep);
    R = step * 0.46;

    fACanvas.width = cols;
    fACanvas.height = rows;
    fBCanvas.width = cols;
    fBCanvas.height = rows;

    // Precompute seed array
    seeds = new Float32Array(cols * rows);
    for (let j = 0; j < rows; j++) {
      const rowBias = hash(j * 3.1, 7.7);
      for (let i = 0; i < cols; i++) {
        const h = hash(i, j);
        seeds[j * cols + i] = 0.55 * h + 0.45 * rowBias;
      }
    }
  }

  window.addEventListener('resize', resize);
  resize();

  const LOOP = 20;
  const LEVELS = [0, 0.26, 0.52, 0.78, 1];

  function render(timeSec) {
    const t = ((timeSec % LOOP) + LOOP) % LOOP;

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);

    if (!tilesLoaded || !seeds || cols === 0 || rows === 0) {
      return;
    }

    const isPortrait = H > W;
    const cy = isPortrait ? H * 0.66 : H * 0.54;
    const hw = isPortrait ? W * 0.66 : W * 0.53;
    const hh = hw * (0.40 * 1520) / (0.47 * 2688);

    const a = (2 * Math.PI * t) / LOOP;

    // Draw pose A into fA, pose B into fB
    fACtx.setTransform(1, 0, 0, 1, 0, 0);
    fACtx.fillStyle = '#ffffff';
    fACtx.fillRect(0, 0, cols, rows);

    fBCtx.setTransform(1, 0, 0, 1, 0, 0);
    fBCtx.fillStyle = '#ffffff';
    fBCtx.fillRect(0, 0, cols, rows);

    const sx = cols / W;
    const sy = rows / H;

    // Draw Left Hand (Pose A: LA, Pose B: LB)
    {
      const ph = 0;
      const reach = (0.035 * Math.sin(a + ph) + 0.012 * Math.sin(2 * a + 1.3 + ph)) * W;
      const scale = 1 + 0.07 * Math.sin(a + 0.9 + ph);
      const rot = 1 * 0.045 * Math.sin(a + 2.1 + ph);
      const x = reach - W * 0.045;
      const pivotX = 0;
      const pivotY = cy;

      function drawHand(fctx, tile) {
        if (!tile) return;
        fctx.save();
        fctx.scale(sx, sy);
        fctx.translate(pivotX, pivotY);
        fctx.rotate(rot);
        fctx.scale(scale, scale);
        fctx.translate(-pivotX, -pivotY);
        fctx.drawImage(tile.canvas, x, cy - hh / 2, hw, hh);
        fctx.restore();
      }

      drawHand(fACtx, tiles.LA);
      drawHand(fBCtx, tiles.LB);
    }

    // Draw Right Hand (Pose A: RA, Pose B: RB)
    {
      const ph = Math.PI;
      const reach = (0.035 * Math.sin(a + ph) + 0.012 * Math.sin(2 * a + 1.3 + ph)) * W;
      const scale = 1 + 0.07 * Math.sin(a + 0.9 + ph);
      const rot = -1 * 0.045 * Math.sin(a + 2.1 + ph);
      const x = W - hw + W * 0.045 - reach;
      const pivotX = W;
      const pivotY = cy;

      function drawHand(fctx, tile) {
        if (!tile) return;
        fctx.save();
        fctx.scale(sx, sy);
        fctx.translate(pivotX, pivotY);
        fctx.rotate(rot);
        fctx.scale(scale, scale);
        fctx.translate(-pivotX, -pivotY);
        fctx.drawImage(tile.canvas, x, cy - hh / 2, hw, hh);
        fctx.restore();
      }

      drawHand(fACtx, tiles.RA);
      drawHand(fBCtx, tiles.RB);
    }

    const dataA = fACtx.getImageData(0, 0, cols, rows).data;
    const dataB = fBCtx.getImageData(0, 0, cols, rows).data;

    // Pose switch mix parameters
    const mL = mixAt(t, 6.2, 14.6, 1.6);
    const mR = mixAt(t, 2.4, 10.4, 1.6);
    const tick = Math.floor(t * 7);

    ctx.fillStyle = '#0d0d0d';
    ctx.beginPath();

    const halfCols = cols / 2;
    const quietWidth = isPortrait ? 0.44 : 0.20;
    const quietCenterY = isPortrait ? 0.33 : 0.385;

    for (let j = 0; j < rows; j++) {
      const rowY = (j + 0.5) * rowStep;

      // Row glitch check
      let shift = 0;
      if (hash(j, tick) > 0.965) {
        shift = Math.round((hash(tick, j) - 0.5) * 8);
      }

      const ey = (rowY / H - quietCenterY) / 0.085;

      for (let i = 0; i < cols; i++) {
        const idx = j * cols + i;
        const seed = seeds[idx];
        const m = (i < halfCols) ? mL : mR;
        const useB = seed < m;

        // Apply row shift to sampling
        const sampleI = clamp(i - shift, 0, cols - 1);
        const pIdx = (j * cols + sampleI) * 4;

        const red = useB ? dataB[pIdx] : dataA[pIdx];
        const lum = red / 255;

        let v = clamp((1 - lum - 0.16) / 0.42, 0, 1);
        if (v <= 0) continue;

        // Front edge sparkle during glitch dissolve
        if (m > 0.001 && m < 0.999) {
          const diff = Math.abs(seed - m);
          if (diff < 0.12) {
            v *= (diff / 0.12);
            if (hash(i + tick, j) <= 0.4) {
              v *= 0.3;
            }
          }
        }

        // Shimmer
        v *= 0.86 + 0.14 * Math.sin(t * 3.2 + seed * 40);

        // Centre fade (fingertips never touch)
        const cx = Math.abs((i + 0.5) / cols - 0.5);
        v *= smooth(0.035, 0.11, cx);

        // Copy quiet zone
        const ex = cx / quietWidth;
        const dist = Math.hypot(ex, ey);
        v *= smooth(0.85, 1.25, dist);

        if (v <= 0.01) continue;

        // Quantise to levels [0, 0.26, 0.52, 0.78, 1]
        let qLevel = 0;
        for (let k = LEVELS.length - 1; k >= 0; k--) {
          if (v >= LEVELS[k] - 0.13) {
            qLevel = LEVELS[k];
            break;
          }
        }

        if (qLevel <= 0) continue;

        let radius;
        if (qLevel === LEVELS[1]) {
          radius = R * 0.38; // pinpoint dots
        } else {
          radius = R * qLevel;
        }

        const dotX = (i + 0.5) * step;
        ctx.moveTo(dotX + radius, rowY);
        ctx.arc(dotX, rowY, radius, 0, Math.PI * 2);
      }
    }

    ctx.fill();
  }

  window.__render = render;

  const t0 = performance.now();
  function loop(now) {
    render((now - t0) / 1000);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

