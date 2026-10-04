/* =====================================================================
 * UI — screens, HUD, toasts, settings persistence.
 * All DOM lives in index.html; this module only toggles and fills it.
 * ===================================================================== */
(function () {
  const $ = (id) => document.getElementById(id);
  const SCREENS = ['loading', 'menu', 'character', 'settings', 'pause', 'gameover', 'challenge', 'chresult', 'missionsList'];

  const store = {
    get(k, d) { try { const v = localStorage.getItem('cubeexpress.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('cubeexpress.' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
  };

  const fmt = (n) => Math.floor(n).toLocaleString('en-US');
  let toastTimer = 0, biomeTimer = 0;
  const bars = {};

  // paint the pixel-art lemon next to the game title
  window.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('canvas.lemon-ico').forEach(cv => {
      const ctx = cv.getContext('2d'); ctx.drawImage(VR.Tex.canvasFor((c) => VR.Tex.paint('lemon_icon', c)), 0, 0);
    });
  });

  /* ---- Fullscreen: the browser's own bars (and swipes near them) steal
   * touches and the mouse; fullscreen gives the whole screen to the game.
   * iPhone Safari has no fullscreen for pages: there, "Add to Home Screen"
   * opens the game without browser bars (see manifest.webmanifest). */
  const fsEl = () => document.documentElement;
  VR.Fullscreen = {
    supported() { const d = document; return !!(d.fullscreenEnabled || d.webkitFullscreenEnabled); },
    isOn() { return !!(document.fullscreenElement || document.webkitFullscreenElement); },
    request() {
      if (!this.supported() || this.isOn()) return;
      const el = fsEl();
      try {
        const p = el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : el.webkitRequestFullscreen && el.webkitRequestFullscreen();
        if (p && p.catch) p.catch(() => {});
      } catch (e) { /* refused */ }
    },
    exit() {
      if (!this.isOn()) return;
      try { const p = document.exitFullscreen ? document.exitFullscreen() : document.webkitExitFullscreen && document.webkitExitFullscreen(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ }
    },
    toggle() { if (this.isOn()) this.exit(); else this.request(); },
    standalone() { return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true; },
  };

  VR.UI = {
    store, fmt,
    show(name) {
      for (const s of SCREENS) $(s).hidden = s !== name;
    },
    overlay(name, on) { $(name).hidden = !on; },
    hud(on) { $('hud').hidden = !on; },

    setHUD(score, dist, coins, mult) {
      $('hudScore').textContent = fmt(score);
      $('hudDist').innerHTML = `<span class="num">${fmt(dist)}</span> ${VR.t('unit.m')}`;
      $('hudCoins').textContent = fmt(coins);
      const m = 'x' + mult;
      if ($('hudMult').textContent !== m) {
        $('hudMult').textContent = m;
        $('hudMult').animate([{ transform: 'scale(1.5)' }, { transform: 'scale(1)' }], { duration: 300 });
      }
    },

    setPowerups(state) {
      const holder = $('powerbars');
      const active = new Set(state.list());
      for (const k in bars) if (!active.has(k)) { bars[k].el.remove(); delete bars[k]; }
      for (const k of active) {
        if (!bars[k]) {
          const el = document.createElement('div');
          el.className = 'pbar panel';
          const cv = VR.Tex.canvasFor(VR.POWERUP_ICONS[k]);
          const track = document.createElement('div'); track.className = 'track';
          const fill = document.createElement('div'); fill.className = 'fill';
          fill.style.background = '#' + VR.POWERUP_COLORS[k].toString(16).padStart(6, '0');
          track.appendChild(fill);
          el.append(cv, track);
          holder.appendChild(el);
          bars[k] = { el, fill };
        }
        const frac = state.remaining(k) / VR.CONFIG.POWERUPS[k].duration;
        bars[k].fill.style.transform = `scaleX(${Math.max(0, Math.min(1, frac))})`;
      }
    },
    clearPowerups() { for (const k in bars) { bars[k].el.remove(); delete bars[k]; } },

    toast(text, ms = 900) {
      const t = $('toast');
      t.textContent = text; t.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => t.classList.remove('show'), ms);
    },
    biome(name) {
      const b = $('biomeName');
      b.textContent = name; b.classList.add('show');
      clearTimeout(biomeTimer);
      biomeTimer = setTimeout(() => b.classList.remove('show'), 2200);
    },

    menuStats(best, bank) { $('menuBest').textContent = fmt(best); $('menuBank').textContent = fmt(bank); },
    character(def) { $('charName').textContent = VR.L(def.name); $('charTag').textContent = VR.L(def.tagline) || ''; },

    /** result of a course: kind 'finish' (crossed the line) or 'crash' */
    courseResult({ kind, score, dist, total, coins, best, isBest, time, bestTime, isBestTime, fromWorld }) {
      const fin = kind === 'finish';
      // from the runner portal: the main button takes you back into the world
      $('againBtn').textContent = VR.t(fromWorld ? 'portal.back' : 'go.again');
      $('goTitle').textContent = VR.t(fin ? 'go.title.finish' : 'go.title.crash');
      $('goTitle').className = 'heading ' + (fin ? 'win' : '');
      $('goMainLbl').textContent = VR.t(fin ? 'go.time' : 'go.progress');
      $('goScore').textContent = fin ? VR.Course.fmtTime(time) : Math.min(99, Math.floor(100 * dist / total)) + '%';
      $('goDist').innerHTML = fin ? `<span class="num">${fmt(total)}</span> ${VR.t('unit.m')}` : `<span class="num">${fmt(Math.min(dist, total))} / ${fmt(total)}</span> ${VR.t('unit.m')}`;
      $('goCoins').textContent = fmt(coins);
      $('goBest').textContent = bestTime ? VR.Course.fmtTime(bestTime) : '–';
      $('newBest').hidden = !(fin && isBestTime);
      $('newBest').textContent = VR.t('go.newBestTime');
    },
    /** the progress bar along the top of the runner HUD */
    setCourse(dist, total, t, opp) {
      $('courseFill').style.transform = `scaleX(${Math.max(0, Math.min(1, dist / total))})`;
      $('courseTime').textContent = VR.Course.fmtTime(t);
      const o = $('courseOpp');
      o.hidden = opp === null || opp === undefined;
      if (!o.hidden) o.style.left = (Math.max(0, Math.min(1, opp)) * 100) + '%';
    },

    setToggle(id, on, onText = VR.t('on'), offText = VR.t('off')) {
      const b = $(id); b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.textContent = on ? onText : offText;
    },
    fps(on, value) { $('fps').hidden = !on; if (on && value !== undefined) $('fps').textContent = value + ' FPS'; },

    bind(id, fn) {
      $(id).addEventListener('click', (e) => { VR.Audio.unlock(); VR.Audio.play('click'); fn(e); });
    },
  };
})();
