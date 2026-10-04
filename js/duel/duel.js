/* =====================================================================
 * DUEL — 1v1 Sniper Arena, a live side-challenge between two players.
 * ---------------------------------------------------------------------
 *  ROAD     A 1v1 gate stands beside the track (world.js). Near it the
 *           prompt "E — Challenge a player" appears. Pressing it freezes
 *           only this runner and opens the opponent picker:
 *             - the friend in your challenge room (if any)
 *             - players online right now (VR.Online), free ones first
 *  INVITE   inv → the other player gets a pop-up (Accept / Decline,
 *           12 s). Busy players (mission, other duel, race…) answer
 *           automatically with the reason. Declined / unanswered
 *           invites put that player on a short cooldown (no spam).
 *  ENTER    Both runs are saved (game.snapshotRun) and the same TPP→FPV
 *           transition as mission gates plays, then the arena loads.
 *  MATCH    Rounds: 3-2-1, fight, 45 s timer, first to 5 wins.
 *           The INVITER's game is the referee (host-authoritative):
 *           it checks every shot (rate, origin, line of sight, recent
 *           positions for lag) and owns health, rounds and score.
 *           The guest only sends input results and shows what the host
 *           decides, so a player can't change the result locally.
 *  RETURN   Result card → each runner is restored exactly where they
 *           were (3-2-1, short star). Disconnects end the duel for the
 *           remaining player as a win; nothing is left hanging.
 *
 * Messages (d.k): inv ans cancel ready rs st fire hit nade boom re end bye
 * ===================================================================== */
(function () {
  const T = THREE;
  const FP = () => VR.CONFIG.FP;
  const D = {
    FIRST_TO: 5, MAX_ROUNDS: 11, ROUND_TIME: 45, COUNT: 3, END_PAUSE: 2.4,
    INVITE_TIME: 12, COOLDOWN: 15, LOST_AFTER: 7, SEND_EVERY: 0.05,
    HP: 100, HEAD: 100, BODY: 55, BOLT: 1.0, MAG: 5, RELOAD: 1.9, SWITCH: 0.25,
    SPREAD_HIP: 0.012, SPREAD_AIR: 0.004,
    NADES: 2, NADE_RECHARGE: 3.2, NADE_SPEED: 15, NADE_FUSE: 1.3, NADE_R: 3.8, NADE_PUSH: 17,
    SCOPE_FOV: 32, SCOPE_SENS: 0.35, REWARD_WIN: 150, REWARD_LOSE: 30,
  };
  const OTHER = { h: 'g', g: 'h' };

  class DuelManager {
    constructor(game) {
      this.game = game;
      this.ui = new VR.DuelUI(this);
      this.scene = new T.Scene();
      this.camera = new T.PerspectiveCamera(FP().FOV, 1, 0.05, 260);
      this.ctrl = new VR.FirstPersonController(this.camera);
      this.hands = new VR.HandsView();
      this.gun = VR.DuelWeapons.sniper();
      this.gunHolder = new T.Group(); this.gunHolder.add(this.gun); this.gun.scale.setScalar(0.62);
      this.hands.root.add(this.gunHolder);
      this.nadeModel = VR.DuelWeapons.grenade();
      this.fx = new VR.DuelFx(this.scene);
      this.match = null; this.pending = null; this.incoming = null;
      this.cool = new Map(); this.declinedFrom = new Map();
      this.pickOpen = false; this.pickNotice = null; this.pickT = 0;
      this.ray = new T.Ray();
      this._v = new T.Vector3(); this._w = new T.Vector3();

      VR.Online.onMessage((m) => { if (m.t === 'duel' && m.d) this.onNet(m.d, this.onlineChan(m.from, m.d.name, m.d.ch)); });
      window.addEventListener('keydown', (e) => {
        if (!this.incoming || e.repeat) return;
        const t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
        if (e.code === 'KeyY') { e.preventDefault(); this.acceptInvite(); }
        else if (e.code === 'KeyN') { e.preventDefault(); this.declineInvite(); }
      });
    }

    myName() { return this.game.challenge.myName(); }
    myChar() { return VR.CHARACTERS[this.game.charIndex].id; }
    get active() { return !!this.match; }

    // ================================================================ channels
    friendChan() {
      const ch = this.game.challenge;
      if (!ch.link || !ch.link.connected || !ch.opp || !ch.opp.here || ch.opp.left) return null;
      return { kind: 'friend', key: 'f:' + ch.opp.id, peer: ch.opp.id, name: ch.oppName(), ch: ch.opp.ch,
        send: (d) => ch.link && ch.link.send({ t: 'duel', d }) };
    }
    onlineChan(id, name, chId) {
      const p = VR.Online.peer(id);
      return { kind: 'online', key: 'o:' + id, peer: id, name: (p && p.name) || name || VR.t('ch.defaultName'), ch: (p && p.ch) || chId,
        send: (d) => VR.Online.sendTo(id, { t: 'duel', d }) };
    }
    /** Called by challenge.js for duel messages that arrive over the friend room. */
    onFriendMessage(d) { const c = this.friendChan(); if (c) this.onNet(d, c); }

    // ================================================================ availability
    busyReason(kind) {
      const st = this.game.state;
      if (this.match && this.match.solo) return '';          // waiting in the arena: anyone may come and play
      if (this.match || (this.pending && !this.pending.auto)) return 'duel';
      if (['mission', 'gateEnter', 'gateReturn', 'adventure'].includes(st)) return 'mission';   // the adventure world counts as a mission for invites
      if (['duelEnter', 'duel', 'duelReturn'].includes(st)) return 'duel';
      if (st === 'duelPick') return 'busy';
      if (this.game.challenge.inRace && kind !== 'friend') return 'race';
      if (['loading', 'dying', 'countdown', 'challenge'].includes(st)) return 'busy';
      return '';
    }
    gateAvailable() { return VR.Online.enabled || !!this.friendChan(); }

    // ================================================================ road gate
    /** Runner frame: show the prompt while a 1v1 gate is just ahead. */
    roadUpdate(p) {
      let near = false;
      for (const g of this.game.world.duelGates || []) { if (g.z < p.z + 1.5 && g.z > p.z - 48) { near = true; break; } }
      this.nearGate = near;
      this.ui.showPrompt(near && this.game.state === 'playing');
    }
    onRunnerInteract() { if (this.nearGate && this.game.state === 'playing') this.openPicker(); }

    // ================================================================ waiting arena
    /**
     * Main menu → "Wait for a player": enter the arena alone and move/shoot freely.
     * You show up online as "waiting". When another player arrives (another waiting
     * player, or someone who challenges you from the road) the duel starts from round 1.
     */
    openWaitingArena() {
      if (this.match || this.game.state !== 'menu') return;
      if (!this.game.settings.online) { this.game.settings.online = true; this.game.applySettings(); VR.UI.toast(VR.t('du.onlineOn'), 1400); }
      if (!VR.Online.connected) VR.Online.connect();
      this.match = this.soloMatch();
      this.matchT = 0;
      this.game.beginDuel();
    }
    soloMatch() {
      return {
        solo: true, role: 'h', me: 'h', op: 'g', did: 'solo', chan: { kind: 'none', key: '', send() {} },
        names: { h: this.myName(), g: '' }, tones: { h: 'white', g: 'grey' }, chars: { h: this.myChar(), g: null },
        sc: { h: 0, g: 0 }, hp: { h: D.HP, g: D.HP }, round: 0, phase: 'practice', countT: 0, timeLeft: D.ROUND_TIME, endT: 0,
        lastHeard: performance.now(), sendT: 0, history: [], oppLastFire: -9, rounds: 0, over: false, result: null,
      };
    }
    /** While waiting: quietly invite another waiting player (the lower id invites, so only one does). */
    matchmake(dt) {
      this.matchT -= dt;
      if (this.matchT > 0 || this.pending || !VR.Online.connected) return;
      this.matchT = 1.5;
      const other = VR.Online.list().find(p => p.st === 'wait' && p.id > VR.Online.id && !((this.cool.get('o:' + p.id) || 0) > performance.now()));
      if (!other) return;
      const chan = this.onlineChan(other.id, other.name, other.ch);
      this.pending = { did: VR.Net.randomCode(8), chan, auto: true, left: 6, until: performance.now() + 6000 };
      chan.send({ k: 'inv', did: this.pending.did, name: this.myName(), ch: this.myChar(), auto: 1 });
    }

    // ================================================================ picker (inviter)
    openPicker() {
      if (this.game.state !== 'playing' || !this.nearGate) return;
      this.ui.showPrompt(false);
      this.game.setState('duelPick');
      this.pickOpen = true; this.pickNotice = null;
      if (VR.Online.enabled && !VR.Online.connected) VR.Online.connect();
      this.renderPicker();
    }
    candidates() {
      const busyTxt = (why) => VR.t('du.why.' + (why || 'busy'));
      const now = performance.now();
      const fc = this.friendChan();
      const friend = fc ? { key: fc.key, name: fc.name, st: 'free', whyText: '' } : null;
      const online = [];
      if (VR.Online.connected) {
        for (const p of VR.Online.list()) {
          if (fc && p.name === fc.name && false) continue;
          const key = 'o:' + p.id;
          const cooling = (this.cool.get(key) || 0) > now;
          const free = (p.st === 'free' || p.st === 'wait') && !cooling;
          online.push({ key, name: p.name || VR.t('ch.defaultName'), st: free ? 'free' : 'busy', freeText: p.st === 'wait' ? busyTxt('wait') : '',
            whyText: cooling ? busyTxt('cooldown') : p.st === 'wait' ? busyTxt('wait') : busyTxt(p.why) });
        }
      }
      if (friend && (this.cool.get(friend.key) || 0) > now) { friend.st = 'busy'; friend.whyText = busyTxt('cooldown'); }
      // in a race only your race opponent can be challenged
      const inRace = this.game.challenge.inRace;
      return { friend, online: inRace ? [] : online, onlineOn: VR.Online.enabled && !inRace, connected: VR.Online.connected, firstTo: D.FIRST_TO };
    }
    renderPicker() {
      if (!this.pickOpen || this.pending) return;
      const data = this.candidates();
      if (this.pickNotice) { data.notice = this.pickNotice.text; data.noticeKind = this.pickNotice.kind; }
      this.ui.showPicker(data, { pick: (key) => this.invite(key), close: () => this.closePicker() });
    }
    refreshOpen() { if (this.pickOpen && !this.pending) this.renderPicker(); }
    closePicker() {
      if (this.pending) this.cancelInvite();
      this.pickOpen = false; this.ui.hidePicker();
      if (this.game.state === 'duelPick') this.game.resumeAfterPause();
    }

    invite(key) {
      if (this.pending || this.match) return;
      const chan = key.startsWith('f:') ? this.friendChan() : this.onlineChan(key.slice(2));
      if (!chan || chan.key !== key) { this.pickNotice = { text: VR.t('du.lost', { name: '' }), kind: 'bad' }; return this.renderPicker(); }
      if ((this.cool.get(key) || 0) > performance.now()) return;
      this.pending = { did: VR.Net.randomCode(8), chan, left: D.INVITE_TIME, until: performance.now() + D.INVITE_TIME * 1000 };
      chan.send({ k: 'inv', did: this.pending.did, name: this.myName(), ch: this.myChar() });
      this.ui.showWaiting(chan.name, D.INVITE_TIME, D.INVITE_TIME, () => this.cancelInvite());
    }
    cancelInvite() {
      const p = this.pending; if (!p) return;
      p.chan.send({ k: 'cancel', did: p.did });
      this.pending = null;
      this.ui.hidePicker();
      this.renderPicker();
    }
    endPending(kind, why) {
      const p = this.pending; if (!p) return;
      this.pending = null;
      if (p.auto) { this.cool.set(p.chan.key, performance.now() + 4000); return; }   // waiting-room match attempt: just try again later
      if (kind !== 'unavailable' || why === 'cooldown') this.cool.set(p.chan.key, performance.now() + D.COOLDOWN * 1000);
      const name = p.chan.name;
      const text = kind === 'declined' ? VR.t('du.declined', { name }) : kind === 'timeout' ? VR.t('du.timeout', { name })
        : VR.t('du.unavailable', { name, why: VR.t('du.why.' + (why || 'busy')) });
      this.pickNotice = { text, kind: 'bad' };
      VR.Audio.play('buzz');
      this.ui.hidePicker();
      this.renderPicker();
    }

    // ================================================================ invite (invitee)
    onInvite(d, chan) {
      const why = this.busyReason(chan.kind);
      if (why) return chan.send({ k: 'ans', did: d.did, ok: false, why });
      if (this.incoming) return chan.send({ k: 'ans', did: d.did, ok: false, why: 'busy' });
      if ((this.declinedFrom.get(chan.key) || 0) > performance.now()) return chan.send({ k: 'ans', did: d.did, ok: false, why: 'cooldown' });
      this.incoming = { did: d.did, chan, name: String(d.name || chan.name).slice(0, 16), ch: d.ch, left: D.INVITE_TIME, until: performance.now() + D.INVITE_TIME * 1000 };
      chan.name = this.incoming.name; chan.ch = d.ch || chan.ch;
      // waiting in the arena = waiting for exactly this: start right away
      if (this.match && this.match.solo) return this.acceptInvite();
      this.ui.showInvite(this.incoming.name, D.INVITE_TIME, D.INVITE_TIME, () => this.acceptInvite(), () => this.declineInvite());
    }
    acceptInvite() {
      const inc = this.incoming; if (!inc) return;
      this.incoming = null; this.ui.hideInvite();
      const why = this.busyReason(inc.chan.kind);
      if (why) { inc.chan.send({ k: 'ans', did: inc.did, ok: false, why }); return; }
      if (this.pending && this.pending.auto) { this.pending.chan.send({ k: 'cancel', did: this.pending.did }); this.pending = null; }
      inc.chan.send({ k: 'ans', did: inc.did, ok: true, name: this.myName(), ch: this.myChar() });
      this.startMatch('g', inc.chan, inc.did);
    }
    declineInvite(silent) {
      const inc = this.incoming; if (!inc) return;
      this.incoming = null; this.ui.hideInvite();
      this.declinedFrom.set(inc.chan.key, performance.now() + 8000);
      if (!silent) inc.chan.send({ k: 'ans', did: inc.did, ok: false, why: 'declined' });
    }

    // ================================================================ network
    onNet(d, chan) {
      if (!d || !d.k) return;
      switch (d.k) {
        case 'inv': return this.onInvite(d, chan);
        case 'cancel':
          if (this.incoming && this.incoming.did === d.did) { this.incoming = null; this.ui.hideInvite(); }
          return;
        case 'ans': {
          const p = this.pending;
          if (!p || p.did !== d.did) return;
          if (d.ok) {
            this.pending = null;
            if (d.name) p.chan.name = String(d.name).slice(0, 16);
            if (d.ch) p.chan.ch = d.ch;
            this.startMatch('h', p.chan, p.did);
          } else this.endPending(d.why === 'declined' ? 'declined' : d.why === 'timeout' ? 'timeout' : 'unavailable', d.why);
          return;
        }
      }
      const m = this.match;
      if (!m || d.did !== m.did) {
        // a stray duel message (old match): tell the sender this duel is over
        if (d.k === 'st' || d.k === 'ready') chan.send({ k: 'bye', did: d.did });
        return;
      }
      m.lastHeard = performance.now(); m.heard = true;
      switch (d.k) {
        case 'ready': m.oppReady = true; if (m.role === 'h') this.hostMaybeStart(true); break;
        case 'rs': if (m.role === 'g') this.beginRound(d.n, d.sc); break;
        case 'st': this.onOppState(d); break;
        case 'fire': this.onOppFire(d); break;
        case 'hit': this.onHit(d); break;
        case 'nade': this.spawnNade(d.id, d.p, d.v, false); break;
        case 'boom': this.onBoom(d.id, d.p); break;
        case 're': if (m.role === 'g') this.onRoundEnd(d.w, d.why, d.sc); break;
        case 'end': if (m.role === 'g') this.onMatchEnd(d.sc, null); break;
        case 'bye': this.onOppLeft(); break;
      }
    }
    send(d) { const m = this.match; if (!m) return; d.did = m.did; m.chan.send(d); }

    // ================================================================ match lifecycle
    startMatch(role, chan, did) {
      this.ui.hidePicker(); this.pickOpen = false; this.ui.hideInvite(); this.ui.showPrompt(false);
      if (this.incoming) this.declineInvite();
      const fromWaiting = !!(this.match && this.match.solo);
      this.match = {
        role, chan, did, me: role, op: OTHER[role],
        names: { [role]: this.myName(), [OTHER[role]]: chan.name },
        tones: { h: 'white', g: 'grey' },          // automatic colours: inviter white, invited player grey
        chars: { [role]: this.myChar(), [OTHER[role]]: chan.ch },
        sc: { h: 0, g: 0 }, hp: { h: D.HP, g: D.HP }, round: 0, phase: 'enter', countT: 0, timeLeft: D.ROUND_TIME, endT: 0,
        readyMe: false, oppReady: false, readyT: 0, lastHeard: performance.now(), sendT: 0,
        history: [], oppLastFire: -9, rounds: 0, over: false, result: null,
      };
      if (fromWaiting) {
        // already in the arena: rebuild it with the opponent and start from round 1
        this.enterArena();
        this.ui.feed(VR.t('du.found', { name: chan.name }), 'good');
        VR.Audio.play('gem');
      } else this.game.beginDuel();
    }

    /** game.js: the screen is black, build the arena and hand over. */
    enterArena() {
      const m = this.match; if (!m) return;
      this.hands.setCharacter(VR.CHARACTERS[this.game.charIndex]);
      this.hands.setTone(m.tones[m.me]);
      this.buildWorld();
      VR.Input.setMode('fp'); VR.Input.setFPEnabled(true); VR.Input.requestLock();
      this.ui.show(true);
      this.ui.setSolo(!!m.solo);
      if (m.solo) {
        this.ui.hideBig(); this.ui.setHP(D.HP);
        this.resetMe();
        m.phase = 'practice';
        this.updateWaitText(true);
        return;
      }
      const col = VR.DuelArena.COLORS;
      this.ui.setPlayers(m.names[m.me], m.names[m.op], col[m.me], col[m.op], D.FIRST_TO);
      this.ui.setScore(0, 0); this.ui.setHP(D.HP);
      this.ui.big(VR.t('du.waitingOpp'), 'small', 0);
      this.resetMe();
      m.phase = 'wait'; m.readyMe = true; m.readyT = 0;
      m.lastHeard = performance.now();
      this.send({ k: 'ready' });
      if (m.role === 'h') this.hostMaybeStart();
    }
    hostMaybeStart(resend) {
      const m = this.match;
      if (!m || m.role !== 'h') return;
      if (m.phase === 'wait' && m.readyMe && m.oppReady) this.startRound(1);
      else if (resend && (m.phase === 'count' || m.phase === 'fight')) this.send({ k: 'rs', n: m.round, sc: m.sc });
    }

    buildWorld() {
      this.clearWorld();
      const L = VR.DuelArena.build();
      this.level = L;
      const sc = this.scene;
      sc.add(L.group);
      sc.background = new T.Color(L.ambient.background);
      sc.fog = L.ambient.fog ? new T.Fog(...L.ambient.fog) : null;
      sc.add(new T.HemisphereLight(L.ambient.sky, L.ambient.ground, L.ambient.intensity * 2.2));
      const sun = new T.DirectionalLight(L.sun.color, L.sun.intensity * 2); sun.position.set(...L.sun.dir); sc.add(sun);
      this.solidBoxes = L.solids.map(s => new T.Box3(new T.Vector3(...s.min), new T.Vector3(...s.max)));
      if (!this.match.solo) this.buildAvatar();
      this.nades = [];
      this.camera.fov = this.baseFov(); this.camera.updateProjectionMatrix();
      this.game.renderer.compile(sc, this.camera);
    }
    clearWorld() {
      this.fx.clear();
      const sc = this.scene;
      for (const child of [...sc.children]) {
        sc.remove(child);
        child.traverse(o => {
          if (o.geometry && o.geometry.userData && o.geometry.userData.own) o.geometry.dispose();
          if (o.material && o.material.userData && o.material.userData.own) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
        });
      }
      this.level = null; this.avatar = null; this.nades = [];
    }
    baseFov() { return (this.game.missions.settings && this.game.missions.settings.fov) || FP().FOV; }
    sens() { return FP().MOUSE_SENS * ((this.game.missions.settings && this.game.missions.settings.sens) || 1); }

    // ---- the other player's body
    buildAvatar() {
      const m = this.match;
      const def = VR.CHARACTERS.find(c => c.id === m.chars[m.op]) || VR.CHARACTERS[0];
      const rig = VR.buildCharacter(def);
      VR.toneCharacter(rig, m.tones[m.op]);
      const g = new T.Group(); g.add(rig.root);
      const gun = VR.DuelWeapons.sniper(m.op === 'h' ? VR.DuelArena.COLORS.h : VR.DuelArena.COLORS.g);
      gun.scale.setScalar(1.5); gun.position.set(def.model.armR.pivot[0] * VR.CHARACTER_PX + 0.02, 1.02, -0.32);
      g.add(gun);
      // team ring under the feet + name tag
      const col = VR.DuelArena.COLORS[m.op];
      const ring = new T.Mesh(new T.RingGeometry(0.45, 0.6, 24), new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.8, depthWrite: false }));
      ring.material.userData.own = true; ring.geometry.userData.own = true;
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; g.add(ring);
      g.add(nameTag(m.names[m.op], col));
      this.scene.add(g);
      this.avatar = { g, rig, gun, pos: new T.Vector3(), target: null, yaw: 0, pitch: 0, low: false, slide: false, phase: 0, speed: 0, last: new T.Vector3() };
      const sp = this.level.extras.spawns[m.op];
      this.avatar.pos.set(...sp.pos); this.avatar.yaw = sp.yaw;
      this.placeAvatar(0);
    }
    placeAvatar(dt) {
      const a = this.avatar; if (!a) return;
      const t = a.target;
      if (t) {
        const k = dt ? Math.min(1, dt * 14) : 1;
        a.pos.x += (t.p[0] - a.pos.x) * k; a.pos.y += (t.p[1] - a.pos.y) * k; a.pos.z += (t.p[2] - a.pos.z) * k;
        let dy = t.yw - a.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); a.yaw += dy * k;
        a.pitch += (t.pt - a.pitch) * k; a.low = !!(t.c || t.s); a.slide = !!t.s;
        if (a.gun) a.gun.visible = !t.w;
      }
      const moved = dt ? a.pos.distanceTo(a.last) / dt : 0; a.last.copy(a.pos);
      a.speed += (Math.min(9, moved) - a.speed) * Math.min(1, dt * 8 || 1);
      a.g.position.copy(a.pos); a.g.rotation.y = a.yaw;
      // animation (same rig the runner uses)
      const r = a.rig, p = r.parts;
      a.phase += dt * (4 + a.speed * 1.4);
      const s = Math.sin(a.phase), run = Math.min(1, a.speed / 5);
      const air = t && t.p[1] > 0.15 && !a.low;
      let legL = s * 0.9 * run, legR = -s * 0.9 * run, lean = -0.08 * run, iy = 0;
      if (a.low) { legL = -1.3; legR = -1.1; lean = a.slide ? -0.5 : 0.35; iy = -0.45; }
      else if (air) { legL = -0.9; legR = 0.5; }
      const k = Math.min(1, dt * 14 || 1);
      p.legL.rotation.x += (legL - p.legL.rotation.x) * k; p.legR.rotation.x += (legR - p.legR.rotation.x) * k;
      p.armL.rotation.x = -1.35 - a.pitch * 0.8; p.armR.rotation.x = -1.45 - a.pitch * 0.8;
      p.head.rotation.x = -a.pitch * 0.5;
      r.inner.rotation.x += (lean - r.inner.rotation.x) * k;
      r.inner.position.y += (iy - r.inner.position.y) * k;
      if (a.gun) { a.gun.rotation.x = a.pitch; a.gun.position.y = 1.02 + iy; }
    }

    // ---- my own state
    resetMe() {
      const m = this.match;
      const sp = this.level.extras.spawns[m.me];
      this.ctrl.reset({ pos: sp.pos.slice(), yaw: sp.yaw });
      this.ctrl.update(0.016, this.level, { x: 0, y: 0 }, false);
      this.weapon = 'sniper'; this.ammo = D.MAG; this.reloadT = 0; this.boltT = 0; this.switchT = 0;
      this.charges = D.NADES; this.rechargeT = 0; this.scoped = false;
      this.kick = 0; this.shake = 0; this.dmgFlash = 0; this.stepAcc = 0;
      this.hands.hold(null); this.gunHolder.visible = true;
      for (const n of this.nades || []) this.scene.remove(n.obj);
      this.nades = [];
      if (this.avatar) {
        const so = this.level.extras.spawns[m.op];
        this.avatar.target = null; this.avatar.pos.set(...so.pos); this.avatar.yaw = so.yaw; this.avatar.g.visible = true;
        this.placeAvatar(0);
      }
      m.history.length = 0;
    }

    // ================================================================ rounds
    startRound(n) {   // host
      const m = this.match;
      m.round = n; m.hp = { h: D.HP, g: D.HP };
      this.send({ k: 'rs', n, sc: m.sc });
      this.beginRound(n, m.sc);
    }
    beginRound(n, sc) {
      const m = this.match; if (!m || m.over) return;
      if (m.phase !== 'wait' && m.phase !== 'end' && m.round === n) return;     // duplicate
      m.round = n; m.sc = { h: sc.h, g: sc.g }; m.hp = { h: D.HP, g: D.HP };
      m.phase = 'count'; m.countT = D.COUNT; m.timeLeft = D.ROUND_TIME;
      this.resetMe();
      this.ui.setScore(m.sc[m.me], m.sc[m.op]); this.ui.setHP(D.HP);
      this.ui.big(String(D.COUNT), 'count', 0); VR.Audio.play('click');
      this.fx.clear();
    }
    endRound(w, why) {   // host
      const m = this.match;
      if (!m || m.phase !== 'fight') return;
      const sc = { h: m.sc.h, g: m.sc.g };
      if (w) sc[w]++;
      this.send({ k: 're', w, why, sc });
      this.onRoundEnd(w, why, sc);
    }
    onRoundEnd(w, why, sc) {
      const m = this.match; if (!m || m.phase === 'end' || m.over) return;
      m.phase = 'end'; m.endT = 0; m.sc = sc; m.rounds = m.round;
      this.scoped = false; this.ui.scope(false);
      this.ui.setScore(sc[m.me], sc[m.op]);
      if (why === 'kill' && w) this.ui.feed(VR.t('du.kill', { a: m.names[w], b: m.names[OTHER[w]] }), w === m.me ? 'good' : 'bad');
      if (why === 'time') this.ui.feed(VR.t('du.timeUp'));
      if (!w) { this.ui.big(VR.t('du.roundDraw'), 'draw', 0); VR.Audio.play('buzz'); }
      else if (w === m.me) { this.ui.big(VR.t('du.roundWon'), 'win', 0); VR.Audio.play('success'); }
      else { this.ui.big(VR.t('du.roundLost'), 'lose', 0); VR.Audio.play('crash'); }
      if (w && w !== m.me) this.shake = Math.max(this.shake, 0.35);
    }
    endMatch() {   // host
      const m = this.match;
      this.send({ k: 'end', sc: m.sc });
      this.onMatchEnd(m.sc, null);
    }
    onMatchEnd(sc, note) {
      const m = this.match; if (!m || m.over) return;
      m.over = true; m.phase = 'over'; m.sc = sc;
      const mine = sc[m.me], theirs = sc[m.op];
      const win = mine > theirs ? true : mine < theirs ? false : null;
      this.showResult(win, note);
    }
    onOppLeft() {
      const m = this.match; if (!m || m.over) return;
      m.over = true; m.phase = 'over';
      this.ui.hideBig();
      this.showResult(true, VR.t('du.oppLeft', { name: m.names[m.op] }));
    }
    /** EXIT on the "Waiting for a player" bar: leave the empty arena for the main menu. */
    exitWaiting() {
      const m = this.match;
      if (!m || !m.solo || m.leaving) return;
      m.result = { win: null, reward: 0 };
      this.leave();
    }
    forfeit() {
      const m = this.match; if (!m) return;
      if (m.solo) { this.ui.closeOverlay(); m.result = { win: null, reward: 0 }; return this.leave(); }
      this.send({ k: 'bye' });
      if (m.over) return this.leave();
      m.over = true; m.phase = 'over';
      this.ui.closeOverlay();
      this.showResult(false, null, true);
    }
    showResult(win, note, forfeited) {
      const m = this.match;
      VR.Input.setFPEnabled(false); VR.Input.releaseLock();
      this.scoped = false; this.ui.scope(false); this.ui.hideBig();
      const reward = forfeited ? 0 : win === true ? D.REWARD_WIN : D.REWARD_LOSE;
      m.result = { win, reward };
      // stats + coins (banked straight away, so nothing depends on the run)
      const st = VR.Profiles.player().stats.duel;
      if (win === true) st.w++; else if (win === false) st.l++; else st.d++;
      VR.Profiles.save();
      if (reward) VR.Wallet.of().credit(reward, `duel:${m.did}`, 'duel');
      VR.Audio.play(win === true ? 'success' : win === false ? 'crash' : 'buzz');
      m.autoT = 8; m.autoAt = performance.now() + 8000;
      const col = VR.DuelArena.COLORS;
      setTimeout(() => {
        if (this.match !== m) return;
        this.ui.showResult({ win, me: m.names[m.me], opp: m.names[m.op], sc: [m.sc[m.me], m.sc[m.op]], rounds: Math.max(m.rounds, m.round),
          colMe: col[m.me], colOpp: col[m.op], note, reward, fromRun: !!this.game.duelFromRun, autoLeft: m.autoT }, () => this.leave());
      }, win === true && !note ? 900 : 300);
    }
    /** Leave the arena (after the result card, or forfeit). */
    leave() {
      const m = this.match; if (!m || m.leaving) return;
      m.leaving = true;
      this.ui.closeOverlay();
      VR.Input.setFPEnabled(false); VR.Input.releaseLock();
      this.game.onDuelReturn(m.result || { win: false, reward: 0 });
    }
    /** game.js: the screen is black again; tear the arena down. */
    exit() {
      this.clearWorld();
      if (this.pending && this.pending.auto) { this.pending.chan.send({ k: 'cancel', did: this.pending.did }); this.pending = null; }
      this.ui.setSolo(false);
      this.ui.show(false); this.ui.resetTouch();
      VR.Input.setMode('runner');
      this.match = null;
    }
    /** Hard stop (quit to menu). */
    abort() {
      if (this.pending) this.cancelInvite();
      this.pickOpen = false; this.ui.hidePicker();
      if (this.incoming) this.declineInvite();
      if (this.match) { if (!this.match.over) this.send({ k: 'bye' }); this.exit(); }
    }
    onPauseKey() {
      const m = this.match; if (!m) return;
      if (m.over) return;
      if (this.ui.modal) { this.ui.closeOverlay(); VR.Input.setFPEnabled(true); VR.Input.requestLock(); return; }
      VR.Input.setFPEnabled(false); VR.Input.releaseLock();
      this.ui.showPause(() => { this.ui.closeOverlay(); VR.Input.setFPEnabled(true); VR.Input.requestLock(); }, () => this.forfeit(), !!m.solo);
    }

    // ================================================================ combat
    // aim comes from the controller (not the camera, which carries recoil, shake and roll)
    eyePos(out) { const c = this.ctrl; return out.set(c.pos.x, c.pos.y + c.eye, c.pos.z); }
    aimDir(out) { const c = this.ctrl, cp = Math.cos(c.pitch); return out.set(-Math.sin(c.yaw) * cp, Math.sin(c.pitch), -Math.cos(c.yaw) * cp); }
    // ---- shared with the single-player combat (js/combat/weaponkit.js)
    /** Head and body boxes of a player standing at feet position p. */
    boxesAt(p, low) { return VR.WeaponKit.boxesAt(p, low); }
    wallDist(o, d, max = 200) { return VR.WeaponKit.wallDist(this.ray, this.solidBoxes, o, d, max); }
    /** Ray against one set of boxes, blocked by walls. */
    trace(o, d, sets) {
      const r = VR.WeaponKit.traceParts(this.ray, this.solidBoxes, o, d, sets.map(s => ({ parts: { head: s.head, body: s.body } })));
      return { hit: r.hit, end: r.end, wall: r.wall };
    }

    fire() {
      const m = this.match;
      if (m.phase !== 'fight' && m.phase !== 'practice') return;
      if (this.weapon === 'nade') return this.throwNade();
      if (this.switchT > 0 || this.boltT > 0 || this.reloadT > 0) return;
      if (this.ammo <= 0) return this.startReload();
      this.ammo--; this.boltT = D.BOLT;
      const o = this.eyePos(new T.Vector3()), d = this.aimDir(new T.Vector3());
      const spread = this.scoped ? (this.ctrl.grounded ? 0 : D.SPREAD_AIR) : D.SPREAD_HIP;
      if (spread) { d.x += (Math.random() - 0.5) * spread * 2; d.y += (Math.random() - 0.5) * spread * 2; d.z += (Math.random() - 0.5) * spread * 2; d.normalize(); }
      // what I see: the avatar where it is drawn
      const a = this.avatar;
      const res = this.trace(o, d, a ? [this.boxesAt(a.pos, a.low)] : []);
      const muzzle = this.muzzleWorld();
      this.fx.tracer(muzzle, res.end); this.fx.flash(muzzle); if (!res.hit) this.fx.puff(res.end);
      this.kick = 1; this.shake = Math.max(this.shake, 0.06);
      VR.Audio.play('sniper');
      this.send({ k: 'fire', o: o.toArray().map(r2), d: d.toArray().map(r4) });
      if (m.role === 'h' && !m.solo) this.applyShot(m.me, res.hit);
      if (this.ammo <= 0) setTimeout(() => { if (this.match === m && this.ammo <= 0) this.startReload(); }, D.BOLT * 600);
    }
    muzzleWorld() {
      // a point slightly right/below the eye, along the aim: matches where the gun is drawn
      const o = this.eyePos(new T.Vector3()), d = this.aimDir(new T.Vector3());
      if (this.scoped) return o.addScaledVector(d, 0.6).add(new T.Vector3(0, -0.08, 0));
      const r = this.ctrl.right();
      return o.addScaledVector(d, 0.75).addScaledVector(r, 0.16).add(new T.Vector3(0, -0.14, 0));
    }
    startReload() { if (this.reloadT > 0 || this.ammo >= D.MAG) return; this.reloadT = D.RELOAD; this.scoped = false; VR.Audio.play('reload'); }
    switchTo(w) {
      if (w === this.weapon) return;
      this.weapon = w; this.switchT = D.SWITCH; this.scoped = false;
      VR.Audio.play('click');
    }

    /** Host only: decide what a shot did. */
    applyShot(shooter, part) {
      const m = this.match;
      if (!part || m.phase !== 'fight') return;
      const target = OTHER[shooter];
      const dmg = part === 'head' ? D.HEAD : D.BODY;
      m.hp[target] = Math.max(0, m.hp[target] - dmg);
      const msg = { k: 'hit', t: target, by: shooter, head: part === 'head' ? 1 : 0, dmg, hp: { h: m.hp.h, g: m.hp.g } };
      this.send(msg); this.onHit(msg);
      if (m.hp[target] <= 0) this.endRound(shooter, 'kill');
    }
    onOppFire(d) {
      const m = this.match;
      const o = new T.Vector3().fromArray(d.o), dir = new T.Vector3().fromArray(d.d).normalize();
      // tracer from the avatar's gun
      const muzzle = this.avatar ? this.avatar.pos.clone().add(new T.Vector3(0, 1.45, 0)) : o;
      if (m.role === 'h') {
        // referee: is this shot possible? (fire rate, origin near the shooter, line of sight)
        const now = performance.now() / 1000;
        let ok = m.phase === 'fight' && now - m.oppLastFire >= D.BOLT * 0.75;
        const t = this.avatar && this.avatar.target;
        if (t) { const eye = new T.Vector3(t.p[0], t.p[1] + 1.3, t.p[2]); if (eye.distanceTo(o) > 3) ok = false; }
        if (ok) m.oppLastFire = now;
        // lag tolerance: test where I was during the last ~300 ms
        const sets = [this.boxesAt(this.ctrl.pos, this.ctrl.crouching)];
        const cutoff = performance.now() - 300;
        for (const h of m.history) if (h.t >= cutoff) sets.push(this.boxesAt(h.p, h.low));
        const res = this.trace(o, dir, sets);
        this.fx.tracer(muzzle, res.end, 0xffe14a); this.fx.flash(muzzle);
        if (!res.hit) this.fx.puff(res.end);
        if (ok) this.applyShot(m.op, res.hit);
      } else {
        const res = this.trace(o, dir, [this.boxesAt(this.ctrl.pos, this.ctrl.crouching)]);
        this.fx.tracer(muzzle, res.end, 0xffe14a); this.fx.flash(muzzle);
        if (!res.hit) this.fx.puff(res.end);
      }
      VR.Audio.play('sniperFar');
    }
    onHit(d) {
      const m = this.match; if (!m) return;
      m.hp = d.hp;
      if (d.t === m.me) {
        this.dmgFlash = 1; this.shake = Math.max(this.shake, d.head ? 0.3 : 0.18);
        VR.Audio.play('hurt');
        this.ui.setHP(m.hp[m.me]);
      } else {
        this.ui.hitmarker(!!d.head);
        VR.Audio.play(d.head ? 'headshot' : 'hitmark');
        if (d.head) this.ui.feed(VR.t('du.headshot'), 'good');
      }
    }

    // ---- impulse grenade
    throwNade() {
      const m = this.match;
      if ((m.phase !== 'fight' && m.phase !== 'practice') || this.charges < 1) return;
      this.charges--;
      if (this.rechargeT <= 0) this.rechargeT = D.NADE_RECHARGE;
      const o = this.eyePos(new T.Vector3()), d = this.aimDir(new T.Vector3());
      const p = o.addScaledVector(d, 0.5).addScaledVector(this.ctrl.right(), -0.12);
      const v = d.multiplyScalar(D.NADE_SPEED).add(new T.Vector3(0, 2.5, 0)).addScaledVector(this.ctrl.vel, 0.4);
      const id = VR.Net.randomCode(5);
      this.spawnNade(id, p.toArray(), v.toArray(), true);
      this.send({ k: 'nade', id, p: p.toArray().map(r2), v: v.toArray().map(r2) });
      this.hands.pokeReach(); this.switchT = Math.max(this.switchT, 0.18);
      VR.Audio.play('throw');
    }
    spawnNade(id, p, v, mine) {
      const obj = VR.DuelWeapons.grenade(); obj.scale.setScalar(1.6);
      obj.position.fromArray(p); this.scene.add(obj);
      this.nades.push({ id, obj, pos: new T.Vector3().fromArray(p), vel: new T.Vector3().fromArray(v), t: 0, mine });
    }
    updateNades(dt) {
      for (let i = this.nades.length - 1; i >= 0; i--) {
        const n = this.nades[i];
        n.t += dt;
        let boom = VR.WeaponKit.stepNade(n, dt, this.solidBoxes);
        n.obj.position.copy(n.pos); n.obj.rotation.x += dt * 9; n.obj.rotation.z += dt * 5;
        if (!n.mine) { if (n.t > 3) { this.scene.remove(n.obj); this.nades.splice(i, 1); } continue; }
        if (!boom && this.avatar && n.pos.distanceTo(this._v.copy(this.avatar.pos).setY(this.avatar.pos.y + 0.9)) < 0.9) boom = n.pos.clone();
        if (!boom && n.t >= D.NADE_FUSE) boom = n.pos.clone();
        if (boom) { this.send({ k: 'boom', id: n.id, p: boom.toArray().map(r2) }); this.onBoom(n.id, boom.toArray()); }
      }
    }
    onBoom(id, pArr) {
      const p = new T.Vector3().fromArray(pArr);
      const i = this.nades.findIndex(n => n.id === id);
      if (i >= 0) { this.scene.remove(this.nades[i].obj); this.nades.splice(i, 1); }
      this.fx.wave(p);
      VR.Audio.play('burst');
      const m = this.match;
      if (m && (m.phase === 'fight' || m.phase === 'practice')) this.impulse(p);
    }
    /** Push me away from a blast. Under the feet = rocket jump. No damage. */
    impulse(p) {
      if (VR.WeaponKit.impulse(this.ctrl, p, D.NADE_R, D.NADE_PUSH, this._v)) this.shake = Math.max(this.shake, 0.22);
    }

    onOppState(d) {
      if (!this.avatar) return;
      this.avatar.target = d;
    }

    // ================================================================ per frame
    /** Always called (any game state): invites, presence, timeouts. */
    tick(dt) {
      VR.Online.setProfile(this.myName(), this.myChar());
      const why = this.busyReason('online');
      if (this.match && this.match.solo) VR.Online.setStatus('wait', '');
      else VR.Online.setStatus(why ? 'busy' : 'free', why);
      VR.Online.update(dt);
      if (this.pending && this.pending.auto) {
        if (performance.now() > this.pending.until) this.endPending('timeout');
      } else if (this.pending) {
        this.pending.left = (this.pending.until - performance.now()) / 1000;   // real seconds
        this.ui.showWaiting(this.pending.chan.name, this.pending.left, D.INVITE_TIME, () => this.cancelInvite());
        if (this.pending.left <= 0) { this.pending.chan.send({ k: 'cancel', did: this.pending.did }); this.endPending('timeout'); }
      } else if (this.pickOpen) {
        this.pickT -= dt;
        if (this.pickT <= 0) { this.pickT = 1; this.renderPicker(); }
      }
      if (this.incoming) {
        this.incoming.left = (this.incoming.until - performance.now()) / 1000;
        if (this.incoming.left <= 0 || this.busyReason(this.incoming.chan.kind)) this.declineInvite(this.incoming.left > 0 ? false : true);
        else this.ui.showInvite(this.incoming.name, this.incoming.left, D.INVITE_TIME, () => this.acceptInvite(), () => this.declineInvite());
      }
      const m = this.match;
      if (m && m.solo) { if (this.game.state === 'duel') { this.matchmake(dt); this.updateWaitText(); } return; }
      // until the opponent's first message (they may still be loading the arena) allow 25 s
      if (m && !m.over && m.phase !== 'enter' && performance.now() - m.lastHeard > (m.heard ? D.LOST_AFTER : 25) * 1000) this.onOppLeft();
    }

    updateWaitText(force) {
      this.waitTextT = (this.waitTextT || 0) - 1;
      if (!force && this.waitTextT > 0) return;
      this.waitTextT = 30;
      const n = VR.Online.list().length;
      this.ui.setWaitText(VR.t('du.lobbyTitle'), VR.Online.connected ? VR.t('du.lobbyOnline', { n }) : VR.t('du.lobbyConnecting'), VR.t('du.lobbySub'));
    }

    /** Arena frame (game state 'duel'). */
    update(dt) {
      const m = this.match; if (!m || !this.level) return;
      const c = this.ctrl, L = this.level;
      const canMove = (m.phase === 'fight' || m.phase === 'practice') && !this.ui.modal;
      const canLook = (m.phase === 'fight' || m.phase === 'count' || m.phase === 'practice') && !this.ui.modal;

      // timers
      this.boltT = Math.max(0, this.boltT - dt);
      this.switchT = Math.max(0, this.switchT - dt);
      if (this.reloadT > 0) { this.reloadT -= dt; if (this.reloadT <= 0) { this.reloadT = 0; this.ammo = D.MAG; } }
      if (this.charges < D.NADES) {
        this.rechargeT -= dt;
        if (this.rechargeT <= 0) { this.charges++; this.rechargeT = this.charges < D.NADES ? D.NADE_RECHARGE : 0; }
      }

      // actions
      let a;
      while ((a = VR.Input.nextAction())) {
        if (!canMove) continue;
        if (a === 'jump') c.jump();
        else if (a === 'slide') c.slidePress();
        else if (a === 'fire') this.fire();
        else if (a === 'burst') this.throwNade();
        else if (a === 'reload') this.startReload();
        else if (a === 'slot1') this.switchTo('sniper');
        else if (a === 'slot2') this.switchTo('nade');
        else if (a === 'slotNext' || a === 'slotPrev') this.switchTo(this.weapon === 'sniper' ? 'nade' : 'sniper');
      }
      // aim / scope
      const wantScope = canMove && this.weapon === 'sniper' && VR.Input.aimHeld() && this.reloadT <= 0 && this.switchT <= 0;
      if (wantScope !== this.scoped) { this.scoped = wantScope; this.ui.scope(wantScope); if (wantScope) VR.Audio.play('scope'); }
      const look = VR.Input.takeLook();
      if (canLook) c.look(look.x, look.y, this.sens() * (this.scoped ? D.SCOPE_SENS : 1));
      const move = canMove ? VR.Input.moveVector() : { x: 0, y: 0 };
      if (m.phase !== 'end' && m.phase !== 'over' && m.phase !== 'wait') {
        const evs = c.update(dt, L, move, canMove && VR.Input.crouchHeld());
        for (const e of evs) {
          if (e.type === 'jump') VR.Audio.play('jump');
          else if (e.type === 'land' && e.speed > 7) { VR.Audio.play('land'); this.fx.puff(c.pos.clone().setY(c.pos.y + 0.05), 0xe0d4b4, 5); }
          else if (e.type === 'slide') VR.Audio.play('slide');
        }
        evs.length = 0;
        if (c.grounded && c.speed > 2 && !c.slideTimer) { this.stepAcc += c.speed * dt; if (this.stepAcc > 2.1) { this.stepAcc = 0; VR.Audio.play('fpStep'); } }
      } else c.update(0, L, { x: 0, y: 0 }, false);

      // round phases
      if (m.phase === 'count') {
        const before = Math.ceil(m.countT);
        m.countT -= dt;
        const now = Math.ceil(m.countT);
        if (now !== before && now > 0) { this.ui.big(String(now), 'count', 0); VR.Audio.play('click'); }
        if (m.countT <= 0) { m.phase = 'fight'; this.ui.big(VR.t('du.fight'), 'fight', 700); VR.Audio.play('powerup'); }
      } else if (m.phase === 'fight') {
        m.timeLeft -= dt;
        if (m.role === 'h' && m.timeLeft <= 0) {
          const w = m.hp.h > m.hp.g ? 'h' : m.hp.g > m.hp.h ? 'g' : null;
          this.endRound(w, 'time');
        }
      } else if (m.phase === 'end' && m.role === 'h') {
        m.endT += dt;
        if (m.endT >= D.END_PAUSE) {
          const done = m.sc.h >= D.FIRST_TO || m.sc.g >= D.FIRST_TO || m.round >= D.MAX_ROUNDS;
          if (done) this.endMatch(); else this.startRound(m.round + 1);
          m.endT = -99;
        }
      } else if (m.phase === 'wait') {
        m.readyT -= dt;
        if (m.readyT <= 0) { m.readyT = 1; this.send({ k: 'ready' }); }
      } else if (m.phase === 'over' && m.result) {
        m.autoT = (m.autoAt - performance.now()) / 1000;          // real seconds, whatever the frame rate
        this.ui.setContinue(!!this.game.duelFromRun, m.autoT);
        if (m.autoT <= 0) this.leave();
      }

      // stream my state
      m.sendT -= dt;
      if (m.sendT <= 0 && m.phase !== 'over') {
        m.sendT = D.SEND_EVERY;
        this.send({ k: 'st', p: [r2(c.pos.x), r2(c.pos.y), r2(c.pos.z)], yw: r2(c.yaw), pt: r2(c.pitch), c: c.crouching ? 1 : 0, s: c.slideTimer > 0 ? 1 : 0, w: this.weapon === 'nade' ? 1 : 0 });
      }
      if (m.role === 'h') {
        m.history.push({ t: performance.now(), p: c.pos.clone(), low: c.crouching });
        while (m.history.length && performance.now() - m.history[0].t > 400) m.history.shift();
      }

      this.placeAvatar(dt);
      this.updateNades(dt);
      this.fx.update(dt);
      this.updateView(dt, look);

      // HUD
      this.ui.setTimer(m.phase === 'count' || m.phase === 'wait' ? D.ROUND_TIME : m.timeLeft, Math.max(1, m.round));
      this.ui.setHP(m.hp[m.me]);
      this.ui.setWeapon(this.weapon, this.ammo, D.MAG, this.reloadT > 0 ? this.reloadT / D.RELOAD : 0, this.charges, D.NADES,
        this.charges < D.NADES ? 1 - this.rechargeT / D.NADE_RECHARGE : 0);
      this.dmgFlash = Math.max(0, this.dmgFlash - dt * 2.2);
      this.ui.damage(this.dmgFlash * 0.7 + (m.hp[m.me] <= 45 && m.phase === 'fight' ? 0.18 : 0));
    }

    /** Camera effects (recoil, shake, scope FOV) and the weapon in the hands. */
    updateView(dt, look) {
      const c = this.ctrl, cam = this.camera;
      this.kick = Math.max(0, this.kick - dt * 5);
      if (this.kick > 0) cam.rotation.x += Math.sin(this.kick * Math.PI) * 0.05;
      if (this.shake > 0) {
        this.shake = Math.max(0, this.shake - dt);
        const s = this.shake * 0.12;
        cam.position.x += (Math.random() - 0.5) * s; cam.position.y += (Math.random() - 0.5) * s;
      }
      const fov = (this.scoped ? D.SCOPE_FOV : this.baseFov()) + c.burstFov;
      cam.fov += (fov - cam.fov) * Math.min(1, dt * 18);
      cam.updateProjectionMatrix();
      // hands + weapon
      this.hands.update(dt, c, look);
      const showNade = this.weapon === 'nade' && this.charges > 0;
      if (showNade !== !!this.hands.held) this.hands.hold(showNade ? this.nadeModel : null);
      this.gunHolder.visible = this.weapon === 'sniper';
      const wide = Math.min(1, Math.max(0.42, this.hands.camera.aspect / 1.5));
      const sw = this.switchT > 0 ? Math.sin((this.switchT / D.SWITCH) * Math.PI) : 0;
      const rl = this.reloadT > 0 ? Math.sin((1 - this.reloadT / D.RELOAD) * Math.PI) : 0;
      const bob = Math.sin(c.bobPhase) * 0.012 * c.bobAmt;
      this.gunHolder.position.set(0.17 * wide + this.hands.sway.x, -0.2 + this.hands.sway.y - sw * 0.25 - rl * 0.1 + bob + c.landDip * 0.2, -0.46 + this.kick * 0.07);
      this.gunHolder.rotation.set(this.kick * 0.18 + rl * 0.5, 0.04, -rl * 0.5);
      this.hands.root.visible = !this.scoped;
    }

    render(renderer) {
      renderer.render(this.scene, this.camera);
      const m = this.match;
      if (m && m.phase !== 'wait' && !this.scoped) {
        const ac = renderer.autoClear;
        renderer.autoClear = false; renderer.clearDepth();
        renderer.render(this.hands.scene, this.hands.camera);
        renderer.autoClear = ac;
      }
    }
    resize(w, h) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.hands.resize(w / h); }
  }

  function r2(v) { return Math.round(v * 100) / 100; }
  function r4(v) { return Math.round(v * 10000) / 10000; }
  function nameTag(name, col) {
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128;
    const c = cv.getContext('2d');
    c.font = '700 58px "Reem Kufi", "Pixelify Sans", sans-serif';
    const w = Math.min(500, c.measureText(name).width + 48);
    c.fillStyle = 'rgba(14,17,26,.85)'; c.fillRect((512 - w) / 2, 14, w, 92);
    c.strokeStyle = '#' + col.toString(16).padStart(6, '0'); c.lineWidth = 7; c.strokeRect((512 - w) / 2 + 3, 17, w - 6, 86);
    c.fillStyle = '#ffffff'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.direction = /[؀-ۿ]/.test(name) ? 'rtl' : 'ltr';
    c.fillText(name, 256, 62, 470);
    const tex = new T.CanvasTexture(cv); tex.colorSpace = T.SRGBColorSpace;
    const mat = new T.SpriteMaterial({ map: tex, depthTest: false, transparent: true }); mat.userData.own = true;
    const s = new T.Sprite(mat); s.scale.set(1.9, 0.48, 1); s.position.y = 2.35; s.renderOrder = 10;
    return s;
  }

  // ---- sounds for the arena
  VR.Audio.define('sniper', ({ tone, noise }) => { noise(0.22, 0.5, 5000); tone(180, 0.25, 'sawtooth', 0.2, 50); tone(1400, 0.05, 'square', 0.06); });
  VR.Audio.define('sniperFar', ({ tone, noise }) => { noise(0.18, 0.25, 2500); tone(140, 0.2, 'sawtooth', 0.1, 50); });
  VR.Audio.define('hitmark', ({ tone }) => { tone(1800, 0.05, 'square', 0.1); });
  VR.Audio.define('headshot', ({ tone }) => { tone(1500, 0.06, 'square', 0.12); tone(2400, 0.12, 'square', 0.1, null, 0.05); });
  VR.Audio.define('hurt', ({ tone, noise }) => { noise(0.15, 0.3, 900); tone(220, 0.18, 'sawtooth', 0.15, 110); });
  VR.Audio.define('reload', ({ tone, noise }) => { noise(0.06, 0.2, 3000); tone(600, 0.05, 'square', 0.06, null, 0.5); noise(0.06, 0.2, 3000, 0.9); tone(900, 0.05, 'square', 0.08, null, 1.4); });
  VR.Audio.define('throw', ({ noise }) => { noise(0.12, 0.15, 2500); });
  VR.Audio.define('scope', ({ tone }) => { tone(900, 0.04, 'square', 0.05); });

  VR.DuelManager = DuelManager;
  VR.DUEL = D;
})();
