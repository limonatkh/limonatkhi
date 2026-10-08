/* =====================================================================
 * WORLD TEXT — readable writing that physically exists in the mission
 * world (wall paint, chalk, paper notes, signs, glow paint).
 *
 * Text is drawn into a canvas texture on a thin plane, so it is lit and
 * occluded like the rest of the room. Inline symbols: write {lemon},
 * {moon}, ... to draw a puzzle symbol inside the text.
 * ===================================================================== */
(function () {
  const STYLES = {
    // wall paint: big bold letters straight on the wall
    paint:  { font: '700 {s}px "Cairo", "Courier New", monospace', color: '#f4efe1', shadow: 'rgba(0,0,0,.45)', bg: null, pad: 0.06, lit: true },
    redpaint: { font: '700 {s}px "Cairo", "Courier New", monospace', color: '#c4271b', shadow: 'rgba(0,0,0,.35)', bg: null, pad: 0.06, lit: true },
    chalk:  { font: '500 {s}px "Cairo", "Courier New", monospace', color: '#eef2ea', shadow: null, bg: '#2c3a33', frame: '#6b4a2e', pad: 0.12, lit: true },
    paper:  { font: '700 {s}px "Cairo", "Trebuchet MS", sans-serif', color: '#2a2622', shadow: null, bg: '#efe6cf', frame: '#cbbd98', pad: 0.12, lit: true },
    sign:   { font: '700 {s}px "Cairo", "Trebuchet MS", sans-serif', color: '#ffd83a', shadow: null, bg: '#23313f', frame: '#ffd83a', pad: 0.1, lit: true },
    stencil:{ font: '700 {s}px "Cairo", "Trebuchet MS", sans-serif', color: '#f2c230', shadow: 'rgba(0,0,0,.4)', bg: null, pad: 0.04, lit: true },
    // glow paint: unlit, readable in total darkness
    glow:   { font: '700 {s}px "Cairo", "Courier New", monospace', color: '#c8ff7a', shadow: 'rgba(160,255,90,.9)', bg: null, pad: 0.06, lit: false, glowBlur: 18 },
  };

  const PX_PER_M = 220;

  function layoutLines(ctx, text, maxW) {
    const out = [];
    for (const para of String(text).split('\n')) {
      const words = para.split(' ');
      let line = '';
      for (const w of words) {
        const test = line ? line + ' ' + w : w;
        if (ctx.measureText(test.replace(/\{(\w+)\}/g, 'MM')).width > maxW && line) { out.push(line); line = w; }
        else line = test;
      }
      out.push(line);
    }
    return out;
  }

  /**
   * Build a text plane. Options:
   *   text, style, width (m), size (letter height in m), align
   * The plane faces +Z in its local space; rotate/position it like any mesh.
   */
  function make(opts) {
    const st = STYLES[opts.style || 'paint'] || STYLES.paint;
    const width = opts.width || 2;
    const letter = opts.size || 0.18;
    const fs = Math.round(letter * PX_PER_M);
    const padPx = Math.round(st.pad * PX_PER_M);
    const cw = Math.round(width * PX_PER_M);
    const meas = document.createElement('canvas').getContext('2d');
    meas.font = st.font.replace('{s}', fs);
    const lines = layoutLines(meas, opts.text, cw - padPx * 2);
    const lineH = Math.round(fs * 1.28);
    const ch = lines.length * lineH + padPx * 2;

    const cv = document.createElement('canvas');
    cv.width = cw; cv.height = ch;
    const c = cv.getContext('2d');
    if (st.bg) {
      c.fillStyle = st.bg; c.fillRect(0, 0, cw, ch);
      if (st.frame) { c.strokeStyle = st.frame; c.lineWidth = Math.max(4, fs * 0.12); c.strokeRect(c.lineWidth / 2, c.lineWidth / 2, cw - c.lineWidth, ch - c.lineWidth); }
      if (opts.style === 'paper') {                        // ruled lines + fold
        c.strokeStyle = 'rgba(120,100,70,.18)'; c.lineWidth = 2;
        for (let y = padPx + lineH; y < ch - padPx; y += lineH) { c.beginPath(); c.moveTo(padPx, y + 4); c.lineTo(cw - padPx, y + 4); c.stroke(); }
      }
    }
    c.font = st.font.replace('{s}', fs);
    c.direction = 'ltr';
    c.textBaseline = 'top';
    c.fillStyle = st.color;
    const align = opts.align || 'center';
    // Arabic text is right-to-left; in Arabic mode so are sign/number-only notes, so a
    // row of symbols is read in the same order as the surrounding language
    const bare = String(opts.text).replace(/\{\w+\}/g, '');
    const rtl = /[\u0600-\u06FF]/.test(bare) || (VR.isRTL() && !/[A-Za-z]/.test(bare));
    c.direction = rtl ? 'rtl' : 'ltr';
    lines.forEach((ln, i) => {
      // split into text and {symbol} tokens; right-to-left lines are laid out from the right
      // in right-to-left lines, digits / Latin runs are their own left-to-right parts
      let parts = ln.split(rtl ? /(\{\w+\}|[0-9A-Za-z][0-9A-Za-z.,:%×+\-]*)/ : /(\{\w+\})/).filter(Boolean);
      const widthOf = (p) => (/^\{\w+\}$/.test(p) ? fs * 1.15 : c.measureText(p).width);
      const total = parts.reduce((a, p) => a + widthOf(p), 0);
      if (rtl) parts = parts.slice().reverse();
      let x = align === 'left' ? padPx : align === 'right' ? cw - padPx - total : (cw - total) / 2;
      const y = padPx + i * lineH;
      for (const p of parts) {
        const m = /^\{(\w+)\}$/.exec(p);
        if (m) {
          if (st.glowBlur) { c.shadowColor = st.shadow; c.shadowBlur = st.glowBlur; }
          VR.Symbols.draw(c, m[1], x, y - fs * 0.05, fs * 1.1);
          c.shadowBlur = 0;
          x += fs * 1.15;
          continue;
        }
        if (st.shadow) {
          c.shadowColor = st.shadow;
          c.shadowBlur = st.glowBlur || 0;
          c.shadowOffsetX = st.glowBlur ? 0 : Math.max(2, fs * 0.06);
          c.shadowOffsetY = st.glowBlur ? 0 : Math.max(2, fs * 0.06);
        }
        if (rtl && /[\u0600-\u06FF]/.test(p)) { c.direction = 'rtl'; c.textAlign = 'right'; c.fillText(p, x + c.measureText(p).width, y); }
        else { c.direction = 'ltr'; c.textAlign = 'left'; c.fillText(p, x, y); }
        c.shadowColor = 'transparent'; c.shadowBlur = 0; c.shadowOffsetX = c.shadowOffsetY = 0;
        x += c.measureText(p).width;
      }
    });

    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const h = ch / PX_PER_M;
    const mat = st.lit
      ? new THREE.MeshLambertMaterial({ map: tex, transparent: !st.bg, alphaTest: st.bg ? 0 : 0.02 })
      : new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
    if (!st.lit) mat.toneMapped = false;
    mat.polygonOffset = true; mat.polygonOffsetFactor = -2;
    mat.userData.own = true;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, h), mat);
    mesh.userData.size = { w: width, h };
    return mesh;
  }

  VR.WorldText = { make, STYLES };
})();
