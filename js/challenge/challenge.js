/* =====================================================================
 * CHALLENGE — two players race on the same track at the same time.
 * ---------------------------------------------------------------------
 *  Lobby:   the host makes a room and shares an invite link (?vs=CODE).
 *           The guest opens it (or types the code) and joins.
 *  Start:   the host presses Start: both get the same seed, so the world
 *           (route, obstacles, coins, power-ups) is identical, then a
 *           3-2-1 countdown.
 *  Race:    each game streams its runner ~10 times a second. The other
 *           player appears as a see-through "ghost" with a name tag on
 *           the same track; the HUD shows their score and the gap.
 *           Players never collide with each other.
 *  Result:  the course is finite (js/runner/course.js): the FIRST to reach
 *           the finish wins (by course time) and gets a coin bag. If nobody
 *           reaches it (both crash), the one who got further wins. When one
 *           player finishes, the other's run stops there (coins kept).
 *  Rematch: both press Rematch -> new seed, new race.
 *
 * Protocol (JSON):  hi {name, ch, host, round}  start {seed, round}
 *   s {r, d, x, y, sl, gr, vy, sp, sc, c, tm}  dead {r, sc, d, c}  fin {r, tm, d, c, sc}  stop {r, d, c}  again {r}  bye
 * ===================================================================== */
(function () {
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => Math.floor(n).toLocaleString('en-US');
  const SEND_EVERY = 0.1;          // s between state packets
  const LOST_AFTER = 8;            // s of silence = connection lost
  const HELLO_EVERY = 1.5;         // s between lobby hellos

  // ---------------------------------------------------------------- strings
  Object.assign(VR.I18N.STRINGS.en, {
    'menu.challenge': 'CHALLENGE A FRIEND',
    'ch.title': 'Challenge a friend',
    'ch.intro': 'Invite a friend and you both run the same course at the same time. First to the finish wins a coin bag!',
    'ch.name': 'Your name', 'ch.defaultName': 'Player',
    'ch.create': 'CREATE INVITE', 'ch.or': 'or type your friend\'s code', 'ch.codePh': 'ROOM CODE', 'ch.join': 'JOIN',
    'ch.back': 'BACK', 'ch.leave': 'LEAVE',
    'ch.roomCode': 'Room code', 'ch.copy': 'COPY LINK', 'ch.copied': 'COPIED!', 'ch.share': 'SHARE', 'ch.whatsapp': 'WHATSAPP',
    'ch.inviteText': 'Race me in Limonat! Open the link to join: {link}',
    'ch.creating': 'Setting up the room…', 'ch.waiting': 'Waiting for your friend… send them the link.',
    'ch.joining': 'Connecting to the room…', 'ch.searching': 'Connected. Looking for your friend in the room…',
    'ch.joined': 'You\'re in! Waiting for {name} to start.', 'ch.ready': '{name} is here! Start when you\'re both ready.',
    'ch.start': 'START THE RACE', 'ch.you': 'You', 'ch.vs': 'VS',
    'ch.noRelay': 'Couldn\'t connect. Check your internet and try again.', 'ch.badCode': 'The code has 6 characters.',
    'ch.notFound': 'Nobody is in this room yet. Check the code with your friend.', 'ch.full': 'This room already has two players.',
    'ch.left': '{name} left the room.', 'ch.offline': 'Connection lost… reconnecting.',
    'ch.ahead': 'ahead', 'ch.behind': 'behind',
    'ch.t.oppDied': '{name} crashed! Beat {score}', 'ch.t.passed': 'You passed {name}!', 'ch.t.lost': 'Lost contact with {name}', 'ch.t.back': '{name} is back',
    'ch.r.win': 'You win!', 'ch.r.lose': 'You lose', 'ch.r.draw': 'Draw!', 'ch.r.waitTitle': 'Waiting…',
    'ch.r.running': '{name} is still running', 'ch.r.oppAhead': '{name} is ahead right now', 'ch.r.youAhead': 'You\'re ahead right now',
    'ch.r.disconnected': '{name} disconnected', 'ch.r.left': '{name} left the race',
    'ch.r.again': 'REMATCH', 'ch.r.againWait': 'Waiting for {name} to accept…', 'ch.r.againAsk': '{name} wants a rematch!',
    'ch.r.menu': 'MAIN MENU', 'ch.r.score': 'Score', 'ch.r.dist': 'Distance', 'ch.r.out': 'OUT', 'ch.r.live': 'LIVE',
  });
  Object.assign(VR.I18N.STRINGS.ar, {
    'menu.challenge': 'تحدَّ صديقًا',
    'ch.title': 'تحدَّ صديقًا',
    'ch.intro': 'ادعُ صديقك وتركضان على المضمار نفسه في اللحظة نفسها. أول من يصل النهاية يفوز بكيس عملات!',
    'ch.name': 'اسمك', 'ch.defaultName': 'لاعب',
    'ch.create': 'إنشاء دعوة', 'ch.or': 'أو اكتب كود صديقك', 'ch.codePh': 'كود الغرفة', 'ch.join': 'انضمام',
    'ch.back': 'رجوع', 'ch.leave': 'خروج',
    'ch.roomCode': 'كود الغرفة', 'ch.copy': 'نسخ الرابط', 'ch.copied': 'تم النسخ!', 'ch.share': 'مشاركة', 'ch.whatsapp': 'واتساب',
    'ch.inviteText': 'تحدَّني في لعبة ليمونات! افتح الرابط وانضم: {link}',
    'ch.creating': 'نجهّز الغرفة…', 'ch.waiting': 'بانتظار صديقك… أرسل له الرابط.',
    'ch.joining': 'نتصل بالغرفة…', 'ch.searching': 'اتصلنا. نبحث عن صديقك في الغرفة…',
    'ch.joined': 'دخلت الغرفة! بانتظار {name} ليبدأ.', 'ch.ready': '{name} وصل! ابدأ حين تكونان جاهزَين.',
    'ch.start': 'ابدأ التحدي', 'ch.you': 'أنت', 'ch.vs': 'ضد',
    'ch.noRelay': 'تعذّر الاتصال. تأكد من الإنترنت وحاول مجددًا.', 'ch.badCode': 'الكود من 6 خانات.',
    'ch.notFound': 'لا أحد في هذه الغرفة بعد. تأكد من الكود مع صديقك.', 'ch.full': 'في هذه الغرفة لاعبان بالفعل.',
    'ch.left': '{name} غادر الغرفة.', 'ch.offline': 'انقطع الاتصال… نعيد المحاولة.',
    'ch.ahead': 'متقدّم', 'ch.behind': 'متأخر',
    'ch.t.oppDied': '{name} اصطدم! تجاوز {score}', 'ch.t.passed': 'تجاوزت {name}!', 'ch.t.lost': 'انقطع الاتصال بـ{name}', 'ch.t.back': 'عاد {name}',
    'ch.r.win': 'فزت!', 'ch.r.lose': 'خسرت', 'ch.r.draw': 'تعادل!', 'ch.r.waitTitle': 'لحظة…',
    'ch.r.running': '{name} ما زال يركض', 'ch.r.oppAhead': '{name} متقدّم عليك الآن', 'ch.r.youAhead': 'أنت المتقدّم الآن',
    'ch.r.disconnected': 'انقطع اتصال {name}', 'ch.r.left': '{name} انسحب من السباق',
    'ch.r.again': 'إعادة التحدي', 'ch.r.againWait': 'بانتظار موافقة {name}…', 'ch.r.againAsk': '{name} يريد إعادة التحدي!',
    'ch.r.menu': 'القائمة الرئيسية', 'ch.r.score': 'النقاط', 'ch.r.dist': 'المسافة', 'ch.r.out': 'خرج', 'ch.r.live': 'يركض',
  });

  // ---------------------------------------------------------------- ghost
  /** The other runner: a see-through copy of their character with a name tag. */
  class Ghost {
    constructor(scene, charId, tone = 'white') {
      const def = VR.CHARACTERS.find(c => c.id === charId) || VR.CHARACTERS[0];
      this.p = new VR.Player(scene);
      this.p.setCharacter(def);
      this.p.shieldMesh.visible = false;
      this.mats = [];
      const cache = new Map();
      this.p.rig.root.traverse((o) => {
        if (!o.isMesh) return;
        const swap = (m) => {
          if (!cache.has(m)) {
            const c = m.clone(); c.transparent = true; c.opacity = 0.55; c.userData.own = true;
            if (m.userData && m.userData.hero) VR.toneColor(c.color, tone);        // the other player's colour
            cache.set(m, c); this.mats.push(c);
          }
          return cache.get(m);
        };
        o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
        o.renderOrder = 2;
      });
      this.tag = null; this.tagName = '';
      this.dead = false; this.deathDz = 0;
    }
    setName(name) {
      if (name === this.tagName) return;
      this.tagName = name;
      if (this.tag) { this.p.object.remove(this.tag); this.tag.material.map.dispose(); this.tag.material.dispose(); }
      const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128;
      const c = cv.getContext('2d');
      const font = (VR.isRTL() || /[؀-ۿ]/.test(name)) ? '"Reem Kufi", "Tajawal", sans-serif' : '"Pixelify Sans", "Chakra Petch", sans-serif';
      c.font = '700 60px ' + font;
      const w = Math.min(500, c.measureText(name).width + 48);
      c.fillStyle = 'rgba(14,17,26,.82)'; c.fillRect((512 - w) / 2, 14, w, 92);
      c.strokeStyle = '#ffe14a'; c.lineWidth = 6; c.strokeRect((512 - w) / 2 + 3, 17, w - 6, 86);
      c.fillStyle = '#ffe14a'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.direction = /[؀-ۿ]/.test(name) ? 'rtl' : 'ltr';
      c.fillText(name, 256, 62, 470);
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
      this.tag = new THREE.Sprite(mat);
      this.tag.scale.set(2.6, 0.65, 1); this.tag.position.y = 2.75; this.tag.renderOrder = 10;
      this.p.object.add(this.tag);
    }
    visible(on) { this.p.object.visible = on; this.p.shadow.visible = on; }
    dispose(scene) {
      scene.remove(this.p.object); scene.remove(this.p.shadow);
      this.mats.forEach(m => m.dispose());
      if (this.tag) { this.tag.material.map.dispose(); this.tag.material.dispose(); }
    }
  }

  // ---------------------------------------------------------------- controller
  class Challenge {
    constructor(game) {
      this.game = game;
      this.link = null;
      this.phase = 'idle';      // idle | lobby | countdown | race | done
      this.isHost = false;
      this.round = 0;
      this.opp = null;          // {name, ch, here, lastHeard, ...}
      this.ghost = null;
      this.sendT = 0; this.helloT = 0; this.hudT = 0;
      this.name = VR.UI.store.get('playerName', '') || '';
      this.bindUI();
      VR.I18N.onChange(() => { if (this.phase !== 'idle') this.refresh(); });
    }

    get active() { return this.phase !== 'idle'; }
    /** True while the runner is in a challenge round (codes and gates are off). */
    get inRace() { return this.phase === 'countdown' || this.phase === 'race' || this.phase === 'done'; }
    myName() { return (this.name || '').trim() || VR.t('ch.defaultName'); }
    oppName() { return (this.opp && this.opp.name) || VR.t('ch.defaultName'); }

    // ---------------------------------------------------------- UI wiring
    bindUI() {
      const UI = VR.UI;
      UI.bind('challengeBtn', () => this.openLobby());
      UI.bind('chBack', () => this.leave(true));
      UI.bind('chCreate', () => this.create());
      $('chJoinForm').addEventListener('submit', (e) => { e.preventDefault(); VR.Audio.unlock(); this.join($('chCode').value); });
      $('chCode').addEventListener('input', () => { $('chCode').value = VR.Net.cleanCode($('chCode').value); this.status(''); });
      $('chName').addEventListener('input', () => {
        this.name = $('chName').value.slice(0, 16);
        VR.UI.store.set('playerName', this.name);
        this.renderVS();
      });
      $('chName').addEventListener('change', () => this.sayHi());
      UI.bind('chCopy', () => this.copyLink());
      UI.bind('chShare', () => this.shareLink());
      UI.bind('chStart', () => this.hostStart());
      UI.bind('crAgain', () => this.askRematch());
      UI.bind('crMenu', () => this.leave(true));
    }

    status(text, kind) {
      const el = $('chStatus'); el.textContent = text || ''; el.className = 'ch-status' + (kind ? ' ' + kind : '');
    }
    inviteLink() {
      const u = new URL(location.href);
      u.search = ''; u.hash = '';
      u.searchParams.set('vs', this.link.room);
      const relay = new URLSearchParams(location.search).get('relay');
      if (relay) u.searchParams.set('relay', relay);
      return u.toString();
    }

    openLobby(joinCode) {
      this.reset();
      this.phase = 'lobby';
      $('chName').value = this.name;
      $('chHome').hidden = false; $('chRoomBox').hidden = true; $('chVS').hidden = true; $('chStart').hidden = true;
      $('chCode').value = joinCode ? VR.Net.cleanCode(joinCode) : '';
      this.status('');
      this.game.setState('challenge');
      if (joinCode) this.join(joinCode);
    }

    async create() {
      if (this.link) return;
      this.isHost = true;
      $('chHome').hidden = true;
      this.status(VR.t('ch.creating'), 'busy');
      const link = this.link = new VR.Net.Link();
      this.wire(link);
      try { await link.host(); }
      catch (e) { if (this.link === link) { this.link = null; $('chHome').hidden = false; this.status(VR.t('ch.noRelay'), 'bad'); } return; }
      if (this.link !== link) return;
      $('chRoom').textContent = link.room;
      $('chLink').value = this.inviteLink();
      $('chWhats').href = 'https://wa.me/?text=' + encodeURIComponent(VR.t('ch.inviteText', { link: this.inviteLink() }));
      $('chShare').hidden = !navigator.share;
      $('chRoomBox').hidden = false;
      this.renderVS();
      this.refresh();
      this.sayHi();
    }

    async join(code) {
      const room = VR.Net.cleanCode(code);
      if (!VR.Net.validCode(room)) { this.status(VR.t('ch.badCode'), 'bad'); return; }
      if (this.link) this.link.close(true);
      this.isHost = false;
      $('chHome').hidden = true;
      this.status(VR.t('ch.joining'), 'busy');
      const link = this.link = new VR.Net.Link();
      this.wire(link);
      try { await link.join(room); }
      catch (e) { if (this.link === link) { this.link = null; $('chHome').hidden = false; this.status(VR.t('ch.noRelay'), 'bad'); } return; }
      if (this.link !== link) return;
      $('chRoom').textContent = link.room;
      this.joinedAt = performance.now();
      this.renderVS();
      this.refresh();
      this.sayHi();
    }

    copyLink() {
      const text = $('chLink').value;
      const done = () => { const b = $('chCopy'); b.textContent = VR.t('ch.copied'); setTimeout(() => { b.textContent = VR.t('ch.copy'); }, 1500); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => { $('chLink').select(); document.execCommand('copy'); done(); });
      else { $('chLink').select(); document.execCommand('copy'); done(); }
    }
    shareLink() {
      if (!navigator.share) return this.copyLink();
      navigator.share({ title: 'ليمونات', text: VR.t('ch.inviteText', { link: '' }).trim(), url: this.inviteLink() }).catch(() => {});
    }

    /** Lobby text and buttons for the current situation. */
    refresh() {
      if (this.phase === 'lobby' && this.link && this.link.room) {
        const here = this.opp && this.opp.here;
        $('chVS').hidden = !here;
        $('chStart').hidden = !(this.isHost && here);
        if (this.isHost) {
          $('chRoomBox').hidden = false;
          this.status(here ? VR.t('ch.ready', { name: this.oppName() }) : VR.t('ch.waiting'), here ? 'good' : 'busy');
        } else {
          $('chRoomBox').hidden = true;
          if (here) this.status(VR.t('ch.joined', { name: this.oppName() }), 'good');
          else this.status(performance.now() - (this.joinedAt || 0) > 6000 ? VR.t('ch.notFound') : VR.t('ch.searching'), 'busy');
        }
        this.renderVS();
      }
      if (this.phase === 'done') this.renderResult();
    }
    renderVS() {
      $('chMe').textContent = this.myName();
      $('chOpp').textContent = this.oppName();
    }

    // ---------------------------------------------------------- network
    wire(link) {
      link.on('message', (m) => { if (link === this.link) this.onMessage(m); });
      link.on('online', (on) => {
        if (link !== this.link) return;
        if (on) this.sayHi();
        else if (this.phase === 'lobby') this.status(VR.t('ch.offline'), 'bad');
      });
    }
    sayHi() {
      if (!this.link) return;
      this.link.send({ t: 'hi', name: this.myName(), ch: VR.CHARACTERS[this.game.charIndex].id, host: this.isHost, round: this.round });
    }

    onMessage(m) {
      const now = performance.now();
      if (m.t === 'bye') return this.onOppLeft();
      // the first player who answers is the opponent; anyone else is turned away
      if (this.opp && this.opp.id !== m.from) { if (m.t === 'hi' && this.isHost) this.link.send({ t: 'full', to: m.from }); return; }
      if (m.t === 'full') { if (m.to === this.link.id && !(this.opp && this.opp.here)) { this.status(VR.t('ch.full'), 'bad'); this.link.close(); this.link = null; $('chHome').hidden = false; } return; }
      if (!this.opp) this.opp = { id: m.from, name: '', ch: null, here: false };
      const o = this.opp;
      const wasLost = o.lost;
      o.lastHeard = now; o.lost = false;
      if (wasLost && this.phase === 'race') VR.UI.toast(VR.t('ch.t.back', { name: this.oppName() }), 1200);

      switch (m.t) {
        case 'hi': {
          const first = !o.here;
          o.name = String(m.name || '').slice(0, 16); o.ch = m.ch; o.here = true;
          if (first) { this.sayHi(); VR.Audio.play('click'); }
          if (this.ghost) this.ghost.setName(this.oppName());
          this.refresh();
          break;
        }
        case 'start':
          if (!this.isHost) this.beginRound(m.seed, m.round);
          break;
        case 's':
          if (m.r !== this.round || !this.inRace) break;
          o.st = m; o.stAt = now;
          if (!o.dead) o.score = m.sc;
          break;
        case 'dead':
          if (m.r !== this.round) break;
          this.onOppDead(m);
          break;
        case 'fin':
          if (m.r !== this.round) break;
          this.onOppFinish(m);
          break;
        case 'stop':                                  // their run stopped because I finished
          if (m.r !== this.round) break;
          if (this.opp) { this.opp.stopped = true; this.opp.dist = m.d; this.opp.coins = m.c; if (this.opp.st) this.opp.st.d = m.d; }
          this.renderResult();
          break;
        case 'duel':
          this.game.duel.onFriendMessage(m.d);
          break;
        case 'again':
          if (m.r !== this.round) break;
          o.again = true;
          this.renderResult();
          this.maybeRematch();
          break;
      }
    }

    onOppLeft() {
      if (!this.opp) return;
      const name = this.oppName();
      if (this.phase === 'lobby') {
        this.opp = null;
        this.refresh();
        if (this.isHost) this.status(VR.t('ch.left', { name }) + ' ' + VR.t('ch.waiting'), 'busy');
        else { this.status(VR.t('ch.left', { name }), 'bad'); }
        return;
      }
      this.opp.left = true;
      if (this.inRace && !this.opp.dead) {
        this.opp.dead = true; this.opp.final = this.opp.score || 0;
        if (this.phase === 'race') VR.UI.toast(VR.t('ch.r.left', { name }), 1600);
      }
      this.opp.here = false;
      this.renderResult();
    }

    onOppDead(m) {
      const o = this.opp;
      if (o.dead && !o.lost) return;
      o.dead = true; o.final = m.sc; o.score = m.sc; o.dist = m.d; o.coins = m.c;
      if (o.st) o.st.d = m.d;
      if (this.ghost && !this.ghost.dead) this.killGhost();
      if (this.phase === 'race') VR.UI.toast(VR.t('ch.t.oppDied', { name: this.oppName(), score: fmt(m.sc) }), 1800);
      this.renderResult();
    }

    /** the other player crossed the finish line */
    onOppFinish(m) {
      const o = this.opp;
      if (o.finished) return;
      o.finished = true; o.time = m.tm; o.dist = m.d; o.coins = m.c; o.final = m.sc; o.score = m.sc;
      if (o.st) o.st.d = m.d;
      // still running (and not already faster): the race is lost, the run stops here
      if (this.phase === 'race' && !this.me.dead && !this.me.finished) {
        VR.UI.toast(VR.t('ch.t.oppFinished', { name: this.oppName() }), 1800);
        this.me.stopped = true; this.me.dist = this.game.distance; this.me.coins = this.game.coins; this.me.score = Math.floor(this.game.score);
        this.phase = 'done';
        this.link && this.link.send({ t: 'stop', r: this.round, d: +this.me.dist.toFixed(2), c: this.me.coins });
        this.game.stopForRaceEnd();
      }
      this.renderResult();
    }
    /** progress of the other runner along the course (0..1), for the HUD bar */
    oppProgress() {
      if (!this.inRace || !this.opp) return null;
      const o = this.opp, d = o.finished ? VR.Course.finishDistance() : (o.shownD || (o.st ? o.st.d : 0));
      return d / VR.Course.finishDistance();
    }
    /**
     * Who won. 'win' | 'lose' | 'draw' | null (not decided yet).
     * First to the finish wins; nobody finished: the one who got further.
     */
    outcome() {
      const me = this.me, o = this.opp || {};
      if (!me) return null;
      const meOut = me.dead || me.stopped || o.left;
      if (me.finished && o.finished) return Math.abs(me.time - o.time) < 0.005 ? 'draw' : me.time < o.time ? 'win' : 'lose';
      if (me.finished) {
        if (o.dead || o.left || o.stopped) return 'win';
        if (o.st && o.st.tm > me.time + 0.05) return 'win';             // they are already slower than my time
        return null;
      }
      if (o.finished) return 'lose';
      if (meOut && (o.dead || o.left)) {
        const od = o.dist || (o.st && o.st.d) || 0, md = me.dist || 0;
        if (o.left && !o.dead) return 'win';
        return Math.abs(md - od) < 0.5 ? 'draw' : md > od ? 'win' : 'lose';
      }
      return null;
    }

    // ---------------------------------------------------------- round flow
    hostStart() {
      if (!this.isHost || !this.opp || !this.opp.here) return;
      const seed = (Math.random() * 0xffffffff) >>> 0;
      const round = this.round + 1;
      this.link.send({ t: 'start', seed, round });
      this.beginRound(seed, round);
    }

    beginRound(seed, round) {
      this.round = round;
      const o = this.opp;
      Object.assign(o, { st: null, stAt: 0, dead: false, final: 0, score: 0, dist: 0, coins: 0, again: false, lost: false, left: false, shownD: 0,
        finished: false, time: 0, stopped: false });
      this.me = { dead: false, score: 0, again: false, passed: false, finished: false, time: 0, stopped: false };
      this.seed = seed; this.bagPaid = false; this.bagShown = 0;
      this.sendT = 0; this.hudT = 0;
      this.phase = 'countdown';
      // automatic colours: the host keeps white, the guest runs in grey ("سكني")
      VR.toneCharacter(this.game.player.rig, this.isHost ? 'white' : 'grey');
      this.makeGhost();
      this.game.startChallengeRun(seed);
      $('vsHud').hidden = false;
      $('vsName').textContent = this.oppName();
      this.updateHud(true);
    }

    makeGhost() {
      if (this.ghost) this.ghost.dispose(this.game.scene);
      this.ghost = new Ghost(this.game.scene, this.opp.ch, this.isHost ? 'grey' : 'white');
      this.ghost.setName(this.oppName());
      this.ghost.visible(false);
    }
    killGhost() {
      const g = this.ghost.p;
      this.ghost.dead = true; this.ghost.deathDz = 0;
      g.groundAtDeath = this.game.world.surfaceAt(g.x, g.z, g.y + 0.01, 0.3).h;
      g.die();
    }

    /** Called by the game when the countdown ends. */
    onRaceStart() { if (this.phase === 'countdown') this.phase = 'race'; }

    /** Called by the game the moment the local runner crashes. */
    onLocalDeath() {
      if (!this.inRace || this.me.dead) return;
      const g = this.game;
      this.me.dead = true; this.me.score = Math.floor(g.score);
      this.me.dist = g.distance; this.me.coins = g.coins;
      this.link && this.link.send({ t: 'dead', r: this.round, sc: this.me.score, d: g.distance, c: g.coins });
      this.phase = 'done';
    }
    /** Called by the game the moment the local runner crosses the finish line. */
    onLocalFinish(time) {
      if (!this.inRace || this.me.finished || this.me.dead || this.me.stopped) return;
      const g = this.game;
      this.me.finished = true; this.me.time = time; this.me.score = Math.floor(g.score);
      this.me.dist = VR.Course.finishDistance(); this.me.coins = g.coins;
      this.link && this.link.send({ t: 'fin', r: this.round, tm: +time.toFixed(3), d: this.me.dist, c: g.coins, sc: this.me.score });
      this.phase = 'done';
    }
    /** Called by the game after the crash animation: show the race result. */
    showResult() {
      this.game.setState('chresult');
      this.renderResult();
    }

    renderResult() {
      if (this.phase !== 'done' || !this.me) return;
      const o = this.opp || {};
      const oppName = this.oppName();
      const res = this.outcome();
      const final = res !== null;
      const T = VR.Course.fmtTime;
      let title = VR.t('ch.r.waitTitle'), cls = '';
      if (res === 'win') { title = VR.t('ch.r.win'); cls = 'win'; }
      else if (res === 'lose') { title = VR.t('ch.r.lose'); cls = 'lose'; }
      else if (res === 'draw') { title = VR.t('ch.r.draw'); cls = 'draw'; }
      // the winner's coin bag, paid once per round
      if (res === 'win' && !this.bagPaid) {
        this.bagPaid = true;
        const bag = VR.Course.CONFIG.RACE_WIN_BAG;
        if (VR.Wallet.of().credit(bag, `race:${this.seed}:${this.round}:win`, 'race')) { this.bagShown = bag; VR.Audio.play('powerup'); }
      }
      $('crTitle').textContent = title; $('crTitle').className = 'heading ' + cls;
      const total = VR.Course.finishDistance();
      const line = (fin, time, dist) => fin ? T(time) : `${Math.min(99, Math.floor(100 * (dist || 0) / total))}%`;
      $('crMeName').textContent = this.myName();
      $('crMeScore').textContent = line(this.me.finished, this.me.time, this.me.dist);
      $('crMeDist').innerHTML = `<span class="num">${fmt(this.me.dist || 0)}</span> ${VR.t('unit.m')} · <span class="coin-ico"></span> ${fmt(this.me.coins || 0)}`;
      $('crOppName').textContent = oppName;
      const od = o.finished ? total : o.dead ? (o.dist || (o.st && o.st.d) || 0) : (o.st ? o.st.d : 0);
      $('crOppScore').textContent = line(o.finished, o.time, od);
      $('crOppDist').innerHTML = `<span class="num">${fmt(od)}</span> ${VR.t('unit.m')}`;
      const oState = o.finished ? 'ch.r.finished' : (o.dead || o.left) ? 'ch.r.out' : 'ch.r.live';
      $('crOppState').textContent = VR.t(oState);
      $('crOppState').className = 'cr-state ' + (o.finished ? 'live' : (o.dead || o.left) ? 'out' : 'live');
      $('crMe').classList.toggle('lead', res === 'win');
      $('crOpp').classList.toggle('lead', res === 'lose');

      let msg = '';
      if (o.left) msg = VR.t('ch.r.left', { name: oppName });
      else if (o.lost && !final) msg = VR.t('ch.r.disconnected', { name: oppName });
      else if (!final) msg = VR.t('ch.r.running', { name: oppName });
      else if (this.me.again) msg = VR.t('ch.r.againWait', { name: oppName });
      else if (o.again) msg = VR.t('ch.r.againAsk', { name: oppName });
      else if (res === 'win' && this.me.finished) msg = VR.t('ch.r.meFirst') + (this.bagShown ? ' · ' + VR.t('ch.r.bag', { coins: this.bagShown }) : '');
      else if (res === 'lose' && o.finished) msg = VR.t('ch.r.oppFirst', { name: oppName });
      else if (res === 'win' && this.bagShown) msg = VR.t('ch.r.bag', { coins: this.bagShown });
      $('crStatus').textContent = msg;
      $('crStatus').className = 'ch-status' + (o.again && !this.me.again ? ' good' : res === 'win' ? ' good' : '');
      // rematch once the round is over and the other player is still in the room
      $('crAgain').hidden = !final || !!o.left;
      $('crAgain').disabled = !!this.me.again;
    }

    askRematch() {
      if (this.phase !== 'done' || this.me.again) return;
      this.me.again = true;
      this.link && this.link.send({ t: 'again', r: this.round });
      this.renderResult();
      this.maybeRematch();
    }
    maybeRematch() {
      if (this.isHost && this.me && this.me.again && this.opp && this.opp.again && this.phase === 'done') {
        setTimeout(() => { if (this.phase === 'done') this.hostStart(); }, 300);
      }
    }

    // ---------------------------------------------------------- per frame
    update(dt) {
      if (this.phase === 'idle') return;
      const now = performance.now();
      const o = this.opp;
      // lobby: keep saying hello so a late joiner (or a reconnect) finds us
      this.helloT -= dt;
      if (this.helloT <= 0 && this.link && this.link.connected) {
        this.helloT = HELLO_EVERY;
        if (this.phase === 'lobby') { this.sayHi(); this.refresh(); }
      }
      if (o && o.here && o.lastHeard && now - o.lastHeard > LOST_AFTER * 1000 && !o.lost) {
        o.lost = true;
        if (this.phase === 'lobby') { this.opp = null; this.refresh(); return; }
        else if (this.phase === 'race') VR.UI.toast(VR.t('ch.t.lost', { name: this.oppName() }), 1600);
        this.renderResult();
      }
      if (!this.inRace) return;

      const g = this.game;
      // stream my runner
      if (this.phase === 'race' && !this.me.dead) {
        this.sendT -= dt;
        if (this.sendT <= 0 && this.link) {
          this.sendT = SEND_EVERY;
          const p = g.player;
          this.link.send({ t: 's', r: this.round, d: +g.distance.toFixed(2), x: +p.x.toFixed(2), y: +p.y.toFixed(2),
            sl: p.sliding ? 1 : 0, gr: p.grounded ? 1 : 0, vy: +p.vy.toFixed(1), sp: +g.speed.toFixed(1), sc: Math.floor(g.score), c: g.coins, tm: +g.courseT.toFixed(2) });
        }
        // passing a crashed opponent
        if (o.dead && !this.me.passed && g.distance > (o.dist || 0)) { this.me.passed = true; VR.UI.toast(VR.t('ch.t.passed', { name: this.oppName() }), 1400); VR.Audio.play('powerup'); }
      }
      this.updateGhost(dt, now);
      this.hudT -= dt;
      if (this.hudT <= 0) { this.hudT = 0.2; this.updateHud(); if (this.phase === 'done') this.renderResult(); }
    }

    updateGhost(dt, now) {
      const gh = this.ghost; if (!gh) return;
      const o = this.opp, st = o.st, g = this.game, me = g.player;
      if (!st || g.state === 'menu') { gh.visible(false); return; }
      const p = gh.p;
      // where the other runner is now: last report + how far they've run since
      const age = Math.min(0.5, (now - o.stAt) / 1000);
      const target = st.d + (o.dead ? 0 : st.sp * age);
      if (!o.shownD || Math.abs(target - o.shownD) > 12) o.shownD = target;
      o.shownD += (target - o.shownD) * Math.min(1, dt * 6);
      const gap = o.shownD - g.distance;                 // + = they are ahead
      const z = me.z - gap;
      if (gh.dead) {
        const before = p.z; p.animateDeath(dt); gh.deathDz += p.z - before;
        p.z = z + gh.deathDz; p.place();
      } else {
        const k = Math.min(1, dt * 14);
        p.x += (st.x - p.x) * k;
        p.y = st.gr ? st.y : p.y + (st.y - p.y) * Math.min(1, dt * 18);
        p.lateralVel = (st.x - p.x) * 8;
        p.slideTimer = st.sl ? 1 : 0; p.grounded = !!st.gr; p.vy = st.vy;
        p.z = z;
        p.animate(dt, st.sp);
      }
      const show = gap > -14 && gap < 190;
      gh.visible(show);
      if (show) p.updateShadow(g.world);
    }

    updateHud(force) {
      if (!this.inRace || !this.opp) return;
      const o = this.opp, g = this.game;
      const score = Math.floor(o.dead ? o.final : (o.score || 0));
      $('vsScore').textContent = fmt(score);
      const gapEl = $('vsGap');
      if (o.dead) { gapEl.textContent = VR.t('ch.r.out'); gapEl.className = 'vs-gap out'; }
      else if (o.lost) { gapEl.textContent = '…'; gapEl.className = 'vs-gap'; }
      else if (o.st || force) {
        const gap = Math.round((o.shownD || (o.st ? o.st.d : 0)) - g.distance);
        const ahead = gap > 0;
        gapEl.innerHTML = `<span class="num">${ahead ? '▲' : gap < 0 ? '▼' : '='} ${Math.abs(gap)}</span> ${VR.t('unit.m')}`;
        gapEl.className = 'vs-gap ' + (ahead ? 'ahead' : gap < 0 ? 'behind' : '');
      }
      $('vsHud').classList.toggle('leading', score > g.score);
    }

    // ---------------------------------------------------------- leaving
    reset() {
      if (this.link) this.link.close(true);
      this.link = null;
      if (this.ghost) { this.ghost.dispose(this.game.scene); this.ghost = null; }
      this.opp = null; this.me = null; this.round = 0; this.phase = 'idle'; this.isHost = false;
      if (this.game.player && this.game.player.rig) VR.toneCharacter(this.game.player.rig, 'white');
      $('vsHud').hidden = true;
    }
    /** Leave the room (Back / Main menu / quitting a race). */
    leave(toMenu) {
      const was = this.phase;
      this.reset();
      if (toMenu && was !== 'idle') this.game.toMenu();
    }

    /** Opened from an invite link: ?vs=CODE */
    boot() {
      let code = null;
      try { code = new URLSearchParams(location.search).get('vs'); } catch (e) { /* no URL */ }
      if (!code) return;
      try {
        const u = new URL(location.href); u.searchParams.delete('vs');
        history.replaceState(null, '', u.toString());
      } catch (e) { /* keep the URL */ }
      this.openLobby(code);
    }
  }

  VR.Challenge = Challenge;
})();
