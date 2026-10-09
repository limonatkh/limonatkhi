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
 *  WEAPONS  Before a match each player BUYS a loadout with the same
 *           budget (js/duel/fightkit.js; real coins are not touched):
 *           two weapons (pistol free, shotgun, SMG, sniper) + grenades.
 *  BOTS     type 'bots': you against 1-3 computer players (js/duel/bots.js),
 *           all simulated by your game. type 'coop': you and a friend
 *           (online) against bots; the inviter's game runs the bots and
 *           referees every hit.
 *
 * Messages (d.k): inv ans cancel ready rs st fire hit nade boom re end bye
 *                 bs (bot states) bf (bot shot) bh (bot hit)
 * ===================================================================== */
(function () {
  const FB = () => VR.Feedback;
  const T = THREE;
  const FP = () => VR.CONFIG.FP;
  const D = {
    FIRST_TO: 5, MAX_ROUNDS: 11, ROUND_TIME: 45, COUNT: 3, END_PAUSE: 2.4,
    INVITE_TIME: 12, COOLDOWN: 15, LOST_AFTER: 7, SEND_EVERY: 0.05,
    HP: 100, HEAD: 100, BODY: 55, BOLT: 1.0, MAG: 5, RELOAD: 1.9, SWITCH: 0.25,
    SPREAD_HIP: 0.012, SPREAD_AIR: 0.004,
    NADES: 2, NADE_RECHARGE: 3.2, NADE_SPEED: 15, NADE_FUSE: 1.3, NADE_R: 3.8, NADE_PUSH: 34,   // push 34: about 4× the old launch height (2× the last version)
    MINE_ARM: 0.8, MINE_TRIGGER: 1.3, MINE_R: 3.2, MINE_DMG: 85,   // mines: armed after 0.8 s, go off when an enemy comes within 1.3 m
    SCOPE_FOV: 32, SCOPE_SENS: 0.35, REWARD_WIN: 150, REWARD_LOSE: 30,
    BOT_ROUND_TIME: 75, BOT_FIRST_TO: 3, BOT_MAX_ROUNDS: 5, REWARD_BOT_LOSE: 10, BOT_SEND_EVERY: 0.1,
  };
  const FK = () => VR.FightKit;
  const OTHER = { h: 'g', g: 'h' };

  class DuelManager {
    constructor(game) {
      this.game = game;
      this.ui = new VR.DuelUI(this);
      this.scene = new T.Scene();
      this.camera = new T.PerspectiveCamera(FP().FOV, 1, 0.05, 260);
      this.ctrl = new VR.FirstPersonController(this.camera);
      this.hands = new VR.HandsView();
      this.gunHolder = new T.Group(); this.hands.root.add(this.gunHolder);
      this.gunModels = {}; this.gunId = null;                 // the weapon in your hands (one model per weapon)
      this.lo = new VR.FightKit.Loadout({ weapons: ['sniper', 'pistol'], nades: true });
      this.bots = new VR.DuelBots(this);
      this.nadeModel = VR.DuelWeapons.grenade();
      this.fx = new VR.DuelFx(this.scene);
      // my ability slot (play as a fighter / loot powers), the loot arena's floor, holding a hostage (js/duel/powers.js)
      this.powers = new VR.Powers.PlayerPowers(this); this.loot = new VR.Powers.Loot(this); this.hostage = new VR.Powers.Hostage(this);
      this.match = null; this.pending = null; this.incoming = null;
      this.cool = new Map(); this.declinedFrom = new Map();
      this.pickOpen = false; this.pickNotice = null; this.pickT = 0;
      this.ray = new T.Ray();
      this.mines = []; this.deathT = 0;
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
        solo: true, type: 'pvp', opts: null, dead: { h: false, g: false }, oppPick: null, oppLast: {}, botName: '', role: 'h', me: 'h', op: 'g', did: 'solo', chan: { kind: 'none', key: '', send() {} },
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
      this.pickOpen = true; this.pickNotice = null; this.pickFromMenu = false; this.pickOpts = null;
      if (VR.Online.enabled && !VR.Online.connected) VR.Online.connect();
      this.renderPicker();
    }
    /**
     * Main menu → "1v1 with an online player": the same list of players, opened
     * from the menu (the runner course has no 1v1 gates any more). After the duel
     * you come back to the menu.
     */
    openPickerFromMenu(opts = null, rules = null) {
      if (this.game.state !== 'menu' || this.match || this.pickOpen) return;
      this.pickRules = this.cleanRules(rules || (opts && opts.rules), false);
      this.pickOpts = opts && opts.type === 'coop' ? opts : null;      // co-op: "me + a friend vs the computer"
      if (!this.game.settings.online) { this.game.settings.online = true; this.game.applySettings(); VR.UI.toast(VR.t('du.onlineOn'), 1400); }
      this.pickOpen = true; this.pickNotice = null; this.pickFromMenu = true;
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
      const pr = this.pickFromMenu ? this.pickRules : null;
      return { friend, online: inRace ? [] : online, onlineOn: VR.Online.enabled && !inRace, connected: VR.Online.connected, firstTo: pr && pr.firstTo ? pr.firstTo : this.pickOpts ? D.BOT_FIRST_TO : D.FIRST_TO,
        mode: (this.pickOpts ? VR.t('fm.coopMode') + ' · ' + this.inviteSub(this.pickOpts) : '') + this.rulesText(pr) };
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
      if (this.pickFromMenu) { this.pickFromMenu = false; return; }
      if (this.game.state === 'duelPick') this.game.resumeAfterPause();
    }

    invite(key) {
      if (this.pending || this.match) return;
      const chan = key.startsWith('f:') ? this.friendChan() : this.onlineChan(key.slice(2));
      if (!chan || chan.key !== key) { this.pickNotice = { text: VR.t('du.lost', { name: '' }), kind: 'bad' }; return this.renderPicker(); }
      if ((this.cool.get(key) || 0) > performance.now()) return;
      const opts = this.pickOpts || null, rules = this.pickFromMenu ? this.pickRules || null : null;
      this.pending = { did: VR.Net.randomCode(8), chan, left: D.INVITE_TIME, until: performance.now() + D.INVITE_TIME * 1000, opts, rules };
      chan.send({ k: 'inv', did: this.pending.did, name: this.myName(), ch: this.myChar(), mode: opts ? 'coop' : 'pvp', bots: opts ? opts.bots : 0, diff: opts ? opts.diff : '',
        ft: rules && rules.firstTo || 0, ow: rules && rules.weapon || '' });
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
      const opts = d.mode === 'coop' ? { type: 'coop', bots: Math.max(1, Math.min(3, d.bots | 0 || 1)), diff: VR.DuelBots.DIFF[d.diff] ? d.diff : 'normal' } : null;
      const rules = this.cleanRules({ firstTo: d.ft, weapon: d.ow }, false);
      this.incoming = { did: d.did, chan, name: String(d.name || chan.name).slice(0, 16), ch: d.ch, left: D.INVITE_TIME, until: performance.now() + D.INVITE_TIME * 1000, opts, rules };
      chan.name = this.incoming.name; chan.ch = d.ch || chan.ch;
      // waiting in the arena = waiting for exactly this: start right away
      if (this.match && this.match.solo && !opts) return this.acceptInvite();
      this.ui.showInvite(this.incoming.name, D.INVITE_TIME, D.INVITE_TIME, () => this.acceptInvite(), () => this.declineInvite(), this.inviteSub(opts) + this.rulesText(rules));
    }
    acceptInvite() {
      const inc = this.incoming; if (!inc) return;
      this.incoming = null; this.ui.hideInvite();
      const why = this.busyReason(inc.chan.kind);
      if (why) { inc.chan.send({ k: 'ans', did: inc.did, ok: false, why }); return; }
      if (this.pending && this.pending.auto) { this.pending.chan.send({ k: 'cancel', did: this.pending.did }); this.pending = null; }
      inc.chan.send({ k: 'ans', did: inc.did, ok: true, name: this.myName(), ch: this.myChar() });
      this.startMatch('g', inc.chan, inc.did, inc.opts, inc.rules);
    }
    /** " · first to 3 · sniper only" */
    rulesText(r) {
      if (!r) return '';
      let t = '';
      if (r.firstTo) t += ' · ' + VR.t('fm.firstTo', { n: r.firstTo });
      if (r.weapon) t += ' · ' + VR.t('fm.onlyW', { w: VR.L(FK().NAMES[r.weapon]) });
      return t;
    }
    /** the line under the invite: the 1v1 arena, or co-op against the computer */
    inviteSub(opts) {
      if (!opts) return VR.t('du.mode');
      return VR.t('fm.coopInviteSub', { n: opts.bots, diff: VR.t('bot.diff.' + opts.diff) });
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
            this.startMatch('h', p.chan, p.did, p.opts, p.rules);
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
        case 'ready': m.oppReady = true; if (d.pick) m.oppPick = FK().sanitize(d.pick); if (m.role === 'h') this.hostMaybeStart(true); break;
        case 'bs': if (m.role === 'g' && m.type === 'coop') this.bots.applyNet(d.b); break;
        case 'bf': if (m.role === 'g') this.onBotShot(d); break;
        case 'bh': if (m.role === 'g') this.onBotHit(d); break;
        case 'rs': if (m.role === 'g') this.beginRound(d.n, d.sc); break;
        case 'st': this.onOppState(d); break;
        case 'fire': this.onOppFire(d); break;
        case 'hit': this.onHit(d); break;
        case 'nade': this.spawnNade(d.id, d.p, d.v, false); break;
        case 'mine': if (Array.isArray(d.p) && (d.o === 'h' || d.o === 'g')) this.spawnMine(d.id, d.o, d.p); break;
        case 'mboom': if (m.role === 'g') this.onMineBoom(d.id); break;
        case 'boom': this.onBoom(d.id, d.p); break;
        case 're': if (m.role === 'g') this.onRoundEnd(d.w, d.why, d.sc); break;
        case 'end': if (m.role === 'g') this.onMatchEnd(d.sc, null); break;
        case 'bye': this.onOppLeft(); break;
        case 'fell': if (m.role === 'h') this.applyFall(m.op); break;
        case 'wx': if (m.role === 'g' && this.weather) this.weather.follow(d.s); break;
        case 'ping': this.send({ k: 'pong', ts: d.ts }); break;
        case 'pong': if (typeof d.ts === 'number') { const rtt = Math.max(0, performance.now() - d.ts); m.ping = m.ping == null ? rtt : m.ping * 0.6 + rtt * 0.4; this.ui.setPing(m.ping); } break;
      }
    }
    send(d) { const m = this.match; if (!m) return; d.did = m.did; m.chan.send(d); }

    // ================================================================ match lifecycle
    startMatch(role, chan, did, opts = null, rules = null) {
      this.ui.hidePicker(); this.pickOpen = false; this.ui.hideInvite(); this.ui.showPrompt(false);
      if (this.incoming) this.declineInvite();
      const fromWaiting = !!(this.match && this.match.solo);
      const type = opts && opts.type === 'coop' ? 'coop' : 'pvp';
      this.match = {
        type, opts, rules: this.cleanRules(rules, false), dead: { h: false, g: false }, oppPick: null, oppLast: {}, botName: opts ? this.botTeamName(opts) : '',
        role, chan, did, me: role, op: OTHER[role],
        names: { [role]: this.myName(), [OTHER[role]]: chan.name },
        tones: { h: 'white', g: 'grey' },          // automatic colours: inviter white, invited player grey
        chars: { [role]: this.myChar(), [OTHER[role]]: chan.ch },
        sc: { h: 0, g: 0 }, hp: { h: D.HP, g: D.HP }, round: 0, phase: 'enter', countT: 0, timeLeft: D.ROUND_TIME, endT: 0,
        readyMe: false, oppReady: false, readyT: 0, lastHeard: performance.now(), sendT: 0,
        history: [], oppLastFire: -9, rounds: 0, over: false, result: null,
      };
      if (fromWaiting) {
        // already in the arena: rebuild it with the opponent and start from round 1 (after buying)
        this.enterArena();
        this.ui.feed(VR.t('du.found', { name: chan.name }), 'good');
        VR.Audio.play('gem');
      } else this.game.beginDuel();
    }

    /**
     * Main menu → "Me vs the computer": a local match against 1-3 bots.
     * opts: { bots: 1..3, diff: 'normal' | 'medium' | 'hard' | 'impossible' }
     */
    startBots(opts) {
      if (this.match || this.game.state !== 'menu') return false;
      const given = opts;
      // AI fighters: one to three of them, all at one level (opts.fighter = one id, as before)
      const FS = VR.Fighters, list = (opts.fighters || (opts.fighter ? [opts.fighter] : [])).filter(id => FS && FS.FIGHTERS[id]).slice(0, 3);
      const level = FS && FS.LEVELS && FS.LEVELS[opts.level] ? opts.level : 'medium';
      const playAs = FS && FS.FIGHTERS[opts.playAs] ? opts.playAs : null;            // I play as a fighter (its ability is mine)
      opts = list.length ? { type: 'bots', bots: list.length, diff: FS.makeKey(list, level), fighter: list[0], fighters: list, level, playAs }
        : { type: 'bots', bots: Math.max(1, Math.min(3, opts.bots | 0 || 1)), diff: VR.DuelBots.DIFF[opts.diff] ? opts.diff : 'normal', loot: !!opts.loot, playAs };
      const rules = this.cleanRules(given && given.rules, !!opts.loot);
      this.match = {
        type: 'bots', opts, rules, dead: { h: false, g: false }, oppPick: null, oppLast: {}, botName: this.botTeamName(opts),
        role: 'h', chan: { kind: 'none', key: '', name: '', send() {} }, did: 'bots-' + VR.uid(), me: 'h', op: 'g',
        names: { h: this.myName(), g: this.botTeamName(opts) }, tones: { h: 'white', g: 'grey' }, chars: { h: this.myChar(), g: null },
        sc: { h: 0, g: 0 }, hp: { h: D.HP, g: D.HP }, round: 0, phase: 'enter', countT: 0, timeLeft: D.BOT_ROUND_TIME, endT: 0,
        readyMe: false, oppReady: true, readyT: 0, lastHeard: performance.now(), sendT: 0,
        history: [], oppLastFire: -9, rounds: 0, over: false, result: null,
      };
      this.game.beginDuel();
      return true;
    }
    /** rules chosen before a match: rounds to win (1-7) and an optional single weapon */
    cleanRules(r, loot) {
      if (!r) return null;
      const ft = [1, 2, 3, 5, 7].includes(+r.firstTo) ? +r.firstTo : null;
      const w = !loot && r.weapon && FK().ONE_WEAPON.includes(r.weapon) ? r.weapon : null;
      return ft || w ? { firstTo: ft, weapon: w } : null;
    }
    botTeamName(opts) {
      if (opts.fighters && opts.fighters.length > 1) return opts.fighters.map(id => VR.L(VR.Fighters.FIGHTERS[id].name)).join(' + ') + ' · ' + VR.t('bot.diff.' + opts.level);
      if (opts.fighter) { const F = VR.Fighters.FIGHTERS[opts.fighter]; return VR.L(F.name) + ' · ' + VR.L(F.title) + (opts.level && opts.level !== 'medium' ? ' · ' + VR.t('bot.diff.' + opts.level) : ''); }
      return (opts.loot ? VR.t('lt.arena') + ' · ' : '') + VR.t('bot.team') + ' ×' + opts.bots + ' · ' + VR.t('bot.diff.' + opts.diff);
    }
    /** which side's score is mine (in matches against bots both players are side 'h') */
    side() { const m = this.match; return m.type === 'pvp' ? m.me : 'h'; }
    oside() { return this.side() === 'h' ? 'g' : 'h'; }
    /** rounds to win: chosen before the match (rules.firstTo), else the default for the mode */
    firstTo() { const r = this.match.rules; return r && r.firstTo ? r.firstTo : this.match.type === 'pvp' ? D.FIRST_TO : D.BOT_FIRST_TO; }
    maxRounds() { const r = this.match.rules; return r && r.firstTo ? r.firstTo * 2 - 1 : this.match.type === 'pvp' ? D.MAX_ROUNDS : D.BOT_MAX_ROUNDS; }
    roundTime() { return this.match.type === 'pvp' ? D.ROUND_TIME : D.BOT_ROUND_TIME; }

    // ---- the buy screen (before round 1)
    openBuy() {
      const m = this.match;
      m.pick = m.pick || { weapons: ['pistol'], nades: false };
      m.buyLeft = FK().BUY.TIME; m.readyMe = false;
      // the loot arena: no buying — a pistol, the knife and grenades; the rest is on the floor
      if (m.opts && m.opts.loot) { m.pick = { weapons: ['pistol'], nades: true }; this.buyReady(); return; }
      // "one weapon" rounds: everybody gets the chosen weapon, nothing to buy
      if (m.rules && m.rules.weapon) { m.pick = { weapons: [m.rules.weapon], nades: false }; this.buyReady(); return; }
      VR.Input.setFPEnabled(false); VR.Input.releaseLock();
      this.renderBuy();
    }
    renderBuy() {
      const m = this.match; if (!m || m.readyMe) return;
      this.ui.showBuy({ pick: m.pick, left: m.buyLeft, budget: FK().BUY.BUDGET, prices: FK().BUY.PRICES, order: FK().BUY.ORDER, locked: FK().locked(m.type) },
        { toggle: (id) => this.buyToggle(id), ready: () => this.buyReady(), leave: () => this.forfeit() }, m.type);
    }
    buyToggle(id) {
      const m = this.match; if (!m || m.readyMe) return;
      if (FK().locked(m.type).includes(id)) { VR.Audio.play('buzz'); this.ui.buyNote(VR.t('fm.locked')); return; }
      const p = { weapons: m.pick.weapons.slice(), nades: m.pick.nades, mines: !!m.pick.mines };
      if (id === 'nades') p.nades = !p.nades;
      else if (id === 'mines') p.mines = !p.mines;
      else if (p.weapons.includes(id)) { if (p.weapons.length > 1) p.weapons = p.weapons.filter(w => w !== id); }
      else { p.weapons.push(id); if (p.weapons.length > 2) p.weapons.shift(); }
      if (FK().cost(p) > FK().BUY.BUDGET) { VR.Audio.play('buzz'); this.ui.buyNote(VR.t('fm.noBudget')); return; }
      m.pick = p; VR.Audio.play('click');
      this.renderBuy();
    }
    buyReady() {
      const m = this.match; if (!m || m.readyMe) return;
      const only = m.rules && m.rules.weapon;
      if (!only) m.pick = FK().sanitize(m.pick);
      this.lo = new (FK().Loadout)(m.pick, D.NADES, only || null);
      m.readyMe = true; m.readyT = 0;
      this.ui.closeOverlay();
      VR.Input.setFPEnabled(true); VR.Input.requestLock();
      if (m.type !== 'bots') { this.ui.big(VR.t('du.waitingOpp'), 'small', 0); this.send({ k: 'ready', pick: m.pick }); }
      if (m.role === 'h') this.hostMaybeStart();
    }

    /** game.js: the screen is black, build the arena and hand over. */
    enterArena() {
      const m = this.match; if (!m) return;
      this.hands.setCharacter(VR.CHARACTERS[this.game.charIndex]);
      this.hands.setTone(m.tones[m.me]);
      this.buildWorld();
      VR.Input.setMode('fp'); VR.Input.setFPEnabled(true); VR.Input.requestLock();
      this.ui.show(true);
      if (VR.Crosshair) VR.Crosshair.apply();
      this.ui.setPing(null);
      this.ui.setSolo(!!m.solo);
      if (m.solo) {
        this.ui.hideBig(); this.ui.setHP(D.HP);
        this.resetMe();
        m.phase = 'practice';
        this.updateWaitText(true);
        return;
      }
      const col = VR.DuelArena.COLORS;
      if (m.type === 'pvp') this.ui.setPlayers(m.names[m.me], m.names[m.op], col[m.me], col[m.op], this.firstTo());
      else this.ui.setPlayers(m.type === 'coop' ? VR.t('bot.youTwo') : m.names[m.me], m.botName, col.h, col.g, this.firstTo());
      if (m.type !== 'pvp') this.bots.setup(m.opts.bots, m.opts.diff);
      if (m.type === 'bots') this.powers.setup();
      this.ui.setScore(0, 0); this.ui.setHP(D.HP);
      this.ui.hideBig();
      this.resetMe();
      m.phase = 'wait'; m.readyT = 0;
      m.lastHeard = performance.now();
      this.openBuy();
    }
    hostMaybeStart(resend) {
      const m = this.match;
      if (!m || m.role !== 'h') return;
      if (m.phase === 'wait' && m.readyMe && (m.type === 'bots' || m.oppReady)) this.startRound(1);
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
      const hemi = new T.HemisphereLight(L.ambient.sky, L.ambient.ground, L.ambient.intensity * 2.2); sc.add(hemi);
      const sun = new T.DirectionalLight(L.sun.color, L.sun.intensity * 2); sun.position.set(...L.sun.dir); sc.add(sun);
      // the weather (js/core/weather.js): the host's runs the schedule, the other player follows it
      const wm = this.match;
      this.weather = VR.WeatherSystem && !wm.solo ? new VR.WeatherSystem({ scene: sc, hemi, sun, camera: this.camera, start: wm.opts && wm.opts.weather,
        onChange: (ty) => { this.ui.feed(VR.t('wx.now', { name: VR.L(VR.Weather.TYPES[ty].name) }) + ' ' + VR.Weather.TYPES[ty].icon); if (this.match && this.match.role === 'h') this.sendWeather(); } }) : null;
      // the effects layer (js/duel/feedback.js): pooled particles, rings, lights, the screen overlay
      this.fb = VR.FeedbackLayer ? new VR.FeedbackLayer(sc, this.camera, this.ui.el.dmg) : null;
      this.hands.setStyle(FB().profile(this.myProf()).arms);
      this.solidBoxes = L.solids.map(s => new T.Box3(new T.Vector3(...s.min), new T.Vector3(...s.max)));
      if (!this.match.solo && this.match.type !== 'bots') this.buildAvatar();
      this.nades = [];
      this.camera.fov = this.baseFov(); this.camera.updateProjectionMatrix();
      this.game.renderer.compile(sc, this.camera);
    }
    clearWorld() {
      this.fx.clear();
      if (this.weather) { this.weather.dispose(); this.weather = null; }
      if (this.fb) { this.fb.dispose(); this.fb = null; }
      const sc = this.scene;
      for (const child of [...sc.children]) {
        sc.remove(child);
        child.traverse(o => {
          if (o.geometry && o.geometry.userData && o.geometry.userData.own) o.geometry.dispose();
          if (o.material && o.material.userData && o.material.userData.own) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
        });
      }
      this.level = null; this.avatar = null; this.nades = []; this.mines = [];
      if (this.powers) { this.powers.clearRound(); this.loot.items = []; this.hostage.held = null; }
      this.bots.list = [];                          // their bodies went with the scene
      this.gunId = null;
    }
    baseFov() { return (this.game.missions.settings && this.game.missions.settings.fov) || FP().FOV; }
    sens() { return FP().MOUSE_SENS * ((this.game.missions.settings && this.game.missions.settings.sens) || 1); }

    // ---- the other player's body (the opponent, or the teammate in co-op)
    buildAvatar() {
      const m = this.match;
      const col = VR.DuelArena.COLORS[m.type === 'coop' ? 'h' : m.op];
      const a = VR.DuelBody.build(m.chars[m.op], m.tones[m.op], col, m.type === 'coop' ? m.names[m.op] : null);   // no name over an opponent: it would give away where they are
      this.scene.add(a.g);
      this.avatar = a;
      const sp = this.spawnOf(m.op);
      a.pos.set(...sp.pos); a.yaw = sp.yaw;
      this.placeAvatar(0);
    }
    /** where a player starts: the duel spawns, or (against bots) both on the purple end */
    spawnOf(role) {
      const m = this.match, S = this.level.extras.spawns;
      const side = m.type === 'pvp' ? role : 'h';
      if (m.solo || role !== m.me) {                     // the other player's body: until their first update
        const sp = S[side], pos = sp.pos.slice();
        if (m.type === 'coop' && role === 'g') pos[0] += 2.6;
        return { pos, yaw: sp.yaw };
      }
      // me: a random spot on my side (never where I went down)
      let pts = this.level.extras.spawnPts[side];
      // co-op: the two teammates use different spots (host the even ones, guest the odd ones)
      if (m.type === 'coop') pts = pts.filter((_, k) => k % 2 === (role === 'h' ? 0 : 1));
      let i = (Math.random() * pts.length) | 0;
      if (i === this.lastSpawn) i = (i + 1) % pts.length;
      this.lastSpawn = i;
      const [x, z] = pts[i];
      return { pos: [x, 0.05, z], yaw: S[side].yaw };
    }
    placeAvatar(dt) {
      const a = this.avatar; if (!a) return;
      const t = a.target;
      if (t) {
        const k = dt ? Math.min(1, dt * 14) : 1;
        a.pos.x += (t.p[0] - a.pos.x) * k; a.pos.y += (t.p[1] - a.pos.y) * k; a.pos.z += (t.p[2] - a.pos.z) * k;
        let dy = t.yw - a.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); a.yaw += dy * k;
        a.pitch += (t.pt - a.pitch) * k; a.low = !!(t.c || t.s); a.slide = !!t.s;
        a.air = t.p[1] > 0.15 && !a.low;
        VR.DuelBody.setGun(a, t.wi || 'sniper');
      } else VR.DuelBody.setGun(a, a.gunId || 'pistol');
      const m = this.match;
      if (m && m.dead && m.dead[m.op]) { a.deadT = (a.deadT || 0) + dt; a.g.rotation.z = Math.min(1.5, a.deadT * 5); }
      else { a.deadT = 0; a.g.rotation.z = 0; }
      VR.DuelBody.animate(a, dt);
    }

    // ---- my own state
    resetMe() {
      const m = this.match;
      const sp = this.spawnOf(m.me);
      this.ctrl.reset({ pos: sp.pos.slice(), yaw: sp.yaw });
      this.ctrl.update(0.016, this.level, { x: 0, y: 0 }, false);
      VR.Input.resetCrouch();
      this.deathT = 0; this.ui.setDead(false); this.ui.spectate(null);
      for (const mi of this.mines) this.scene.remove(mi.obj);
      this.mines = []; this.shotMarks = [];
      if (m.solo) this.lo = new (FK().Loadout)({ weapons: ['sniper', 'pistol'], nades: true }, D.NADES);   // the waiting room: a free practice kit
      if (m.opts && m.opts.loot && m.readyMe) this.lo = new (FK().Loadout)(m.pick, D.NADES);              // loot arena: back to the pistol each round
      if (m.rules && m.rules.weapon && m.readyMe && !this.lo.only) this.lo = new (FK().Loadout)(null, D.NADES, m.rules.weapon);
      this.hostage.release('round');
      if (m.type === 'bots') { this.powers.resetRound(); this.loot.resetRound(); }
      this.lo.refill(); this.scoped = false; this.ads = false; this.adsK = 0; this.reloadSnd = false;
      this.kick = 0; this.shake = 0; this.dmgFlash = 0; this.stepAcc = 0;
      this.hands.hold(null); this.gunHolder.visible = true;
      m.dead = { h: false, g: false }; this.downShown = false;
      this.slowT = 0; this.ctrl.speedMul = 1; this.ui.slowed(false);
      if (m.type !== 'pvp' && this.bots.list.length) this.bots.respawn();
      for (const n of this.nades || []) this.scene.remove(n.obj);
      this.nades = [];
      if (this.avatar) {
        const so = this.spawnOf(m.op);
        this.avatar.target = null; this.avatar.pos.set(...so.pos); this.avatar.yaw = so.yaw; this.avatar.g.visible = true; this.avatar.g.scale.set(1, 1, 1);
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
      m.phase = 'count'; m.countT = D.COUNT; m.timeLeft = this.roundTime();
      this.resetMe();
      this.ui.setScore(m.sc[this.side()], m.sc[this.oside()]); this.ui.setHP(D.HP);
      this.ui.big(String(D.COUNT), 'count', 0); VR.Audio.play('click');
      this.fx.clear(); if (this.fb) this.fb.clear();
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
      const me = this.side();
      this.ui.setScore(sc[me], sc[this.oside()]);
      if (why === 'kill' && w) {
        if (m.type !== 'pvp') this.ui.feed(VR.t(w === 'h' ? 'fm.botsDown' : 'fm.teamDown'), w === me ? 'good' : 'bad');
      }
      if (why === 'time') this.ui.feed(VR.t('du.timeUp'));
      const teamCol = w ? VR.DuelArena.COLORS[m.type === 'pvp' ? w : (w === 'h' ? 'h' : 'g')] : 0xffffff;
      if (!w) { this.ui.big(VR.t('du.roundDraw'), 'draw round', 2100); VR.Audio.play('buzz'); }
      else if (w === me) { this.ui.big(VR.t('du.roundWon'), 'win round', 2100); VR.Audio.play('success'); }
      else { this.ui.big(VR.t('du.roundLost'), 'lose round', 2100); VR.Audio.play('crash'); }
      if (FB().settings.flashes) this.ui.teamFlash(teamCol);
      if (this.fb) this.fb.note({ type: 'roundEnd', w: w || null });
      if (w && w !== me) this.shake = Math.max(this.shake, 0.35);
    }
    endMatch() {   // host
      const m = this.match;
      this.send({ k: 'end', sc: m.sc });
      this.onMatchEnd(m.sc, null);
    }
    onMatchEnd(sc, note) {
      const m = this.match; if (!m || m.over) return;
      m.over = true; m.phase = 'over'; m.sc = sc;
      const mine = sc[this.side()], theirs = sc[this.oside()];
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
      if (m.phase === 'wait' && m.type === 'bots') { this.ui.closeOverlay(); m.result = { win: null, reward: 0 }; return this.leave(); }
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
      let reward;
      if (forfeited) reward = 0;
      else if (m.type === 'pvp') reward = win === true ? D.REWARD_WIN : D.REWARD_LOSE;
      else { const R = m.opts.fighters ? VR.Fighters.teamReward(m.opts.fighters, m.opts.level) : Math.round(VR.DuelBots.DIFF[m.opts.diff].reward * (m.opts.loot ? 1.25 : 1)); reward = win === true ? R : win === false ? D.REWARD_BOT_LOSE : Math.round(R / 3); }
      m.result = { win, reward };
      // stats + coins (banked straight away, so nothing depends on the run)
      const stats = VR.Profiles.player().stats;
      let st;
      if (m.type === 'pvp') st = stats.duel;
      else { stats.bots = stats.bots || {}; st = stats.bots[m.opts.diff] || (stats.bots[m.opts.diff] = { w: 0, l: 0, d: 0 }); }
      if (win === true) st.w++; else if (win === false) st.l++; else st.d++;
      VR.Profiles.save();
      if (reward) VR.Wallet.of().credit(reward, `${m.type === 'pvp' ? 'duel' : 'bots'}:${m.did}`, m.type === 'pvp' ? 'duel' : 'bots');
      VR.Audio.play(win === true ? 'success' : win === false ? 'crash' : 'buzz');
      m.autoT = 8; m.autoAt = performance.now() + 8000;
      const col = VR.DuelArena.COLORS;
      setTimeout(() => {
        if (this.match !== m) return;
        const vsBots = m.type !== 'pvp';
        this.ui.showResult({ win, me: vsBots && m.type === 'coop' ? VR.t('bot.youTwo') : m.names[m.me], opp: vsBots ? m.botName : m.names[m.op],
          sc: [m.sc[this.side()], m.sc[this.oside()]], rounds: Math.max(m.rounds, m.round),
          colMe: col[vsBots ? 'h' : m.me], colOpp: col[vsBots ? 'g' : m.op], note, reward, fromRun: !!this.game.duelFromRun, autoLeft: m.autoT,
          mode: vsBots ? VR.t(m.type === 'coop' ? 'fm.coopMode' : 'fm.botsMode') : VR.t('du.mode') }, () => this.leave());
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
      if (m.phase === 'wait' && !m.readyMe) return;            // the buy screen is open (it has its own buttons)
      if (this.ui.modal) { this.ui.closeOverlay(); VR.Input.setFPEnabled(true); VR.Input.requestLock(); return; }
      VR.Input.setFPEnabled(false); VR.Input.releaseLock();
      this.ui.showPause(() => { this.ui.closeOverlay(); VR.Input.setFPEnabled(true); VR.Input.requestLock(); }, () => this.forfeit(), m.solo ? 'solo' : m.type === 'bots' ? 'bots' : 'live');
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

    /** targets my shot can hit: the opponent (1v1), or the bots */
    shotTargets() {
      const m = this.match;
      if (m.type === 'pvp') { const a = this.avatar; if (!a || (m.dead && m.dead[m.op])) return []; const b = this.boxesAt(a.pos, a.low); return [{ parts: { head: b.head, body: b.body }, ref: 'op' }]; }
      return this.bots.targets();
    }
    /** trace every pellet; damage summed per target. → { hits: Map(ref → {dmg, head}), ends, missed } */
    traceShot(o, dirs, targets, wid, max = 200) {
      const hits = new Map(), ends = [], missed = [], paths = [];
      for (const d of dirs) {
        const r = VR.WeaponKit.tracePath(this.ray, this.solidBoxes, o, d, targets, max, wid, this.windNow());
        ends.push(r.end); missed.push(!r.ref); paths.push(r.path);
        if (r.ref) {
          const h = hits.get(r.ref) || { dmg: 0, head: false };
          h.dmg += FK().damage(wid, r.hit, r.dist); h.head = h.head || r.hit === 'head';
          hits.set(r.ref, h);
        }
      }
      return { hits, ends, missed, paths };
    }
    /** the wind now (the weather's; none in the waiting room) */
    windNow() { return this.weather ? this.weather.wind : null; }
    /** a tracer that follows the shot's curved path (from the muzzle) */
    pathTracer(muzzle, path, color, width) {
      if (!path || path.length < 3) { this.fx.tracer(muzzle, path ? path[path.length - 1] : muzzle, color, width); return; }
      // a few pieces are enough to show the bend
      const pts = [muzzle], step = Math.max(1, Math.floor((path.length - 1) / 4));
      for (let i = step; i < path.length - 1; i += step) pts.push(path[i]);
      pts.push(path[path.length - 1]);
      for (let i = 1; i < pts.length; i++) this.fx.tracer(pts[i - 1], pts[i], color, width);
    }
    sendWeather() { const w = this.weather, m = this.match; if (w && m && m.type !== 'bots' && m.role === 'h') this.send({ k: 'wx', s: w.state() }); }
    fire() {
      const m = this.match;
      if (m.phase !== 'fight' && m.phase !== 'practice') return;
      if (m.dead && m.dead[m.me]) return;
      const lo = this.lo, wid = lo.id;
      const w = lo.shoot();
      if (!w) return;
      if (m.type === 'bots' && this.powers.rageT > 0) lo.coolT *= this.powers.rateMul();
      const c = this.ctrl;
      const o = this.eyePos(new T.Vector3());
      const spread = w.scope && this.scoped ? (c.grounded ? (w.scopedSpread || 0) : (w.airSpread || 0)) : w.spread * (this.ads ? 0.35 : 1);
      const dirs = [];
      for (let i = 0; i < w.pellets; i++) {
        const d = this.aimDir(new T.Vector3());
        if (spread) { d.x += (Math.random() - 0.5) * spread * 2; d.y += (Math.random() - 0.5) * spread * 2; d.z += (Math.random() - 0.5) * spread * 2; d.normalize(); }
        dirs.push(d);
      }
      // what I see: the targets where they are drawn
      const res = this.traceShot(o, dirs, this.shotTargets(), wid, w.melee ? w.range : 200);
      const muzzle = this.muzzleWorld();
      if (w.melee) this.hands.pokeReach();                 // a stab: no tracer, no flash
      else if (w.arrow) { this.arrowFx(muzzle, res.ends[0], res.missed[0], res.paths[0]); this.lastFireT = performance.now(); }     // a real flying arrow
      else {
        res.ends.forEach((e, i) => { if (i < 3) this.pathTracer(muzzle, res.paths[i], this.fb ? this.fb.tracerColor(wid) : w.pellets > 1 ? 0xff9a4a : undefined, wid === 'sniper' ? 0.032 : 0.02); if (res.missed[i] && i < 3) this.impactAt(e); });
        // my own muzzle: a small flash only, no smoke (nothing may cover the enemy)
        if (this.fb) this.fb.muzzle(muzzle, dirs[0], wid, null, { own: true, aiming: this.scoped || this.ads }); else this.fx.flash(muzzle);
        this.lastFireT = performance.now();
      }
      this.kick = Math.min(1.4, this.kick + w.kick); this.shake = Math.max(this.shake, 0.06 * w.kick);
      VR.Audio.play(w.sound);
      const msg = { k: 'fire', w: wid, o: o.toArray().map(r2), ds: dirs.map(d => d.toArray().map(r4)) };
      if (w.melee && res.hits.size === 0) { this.send(msg); return; }
      if (m.type !== 'pvp' && m.role === 'h' && !w.melee) this.bots.hear(this.ctrl.pos);     // the bots hear the shot
      if (m.type === 'pvp') {
        this.send(msg);
        if (m.role === 'h' && !m.solo) { const h = res.hits.get('op'); if (h) this.applyHit(m.op, h.dmg, h.head, m.me, null, wid); }
      } else if (m.role === 'h') {                       // against bots: my game decides (co-op: the host's)
        for (const [b, h] of res.hits) this.hostBotHit(b, h.dmg, h.head, m.me, wid);
        if (m.type === 'coop') this.send(msg);           // the teammate sees the shot
      } else this.send(msg);                             // co-op guest: the host decides
    }
    /** an arrow flies from the bow to where the shot ends; a miss stays stuck there for a moment */
    arrowFx(from, to, missed, path) {
      if (!to) return;
      // the arrow flies along the shot's path (it drops and drifts in the wind), pointing where it goes
      const pts = path && path.length > 2 ? [from].concat(path.slice(1)) : [from, to];
      const segs = []; let total = 0;
      for (let i = 1; i < pts.length; i++) { const l = pts[i - 1].distanceTo(pts[i]); segs.push(l); total += l; }
      const a = VR.WeaponKit.model('arrow'), speed = FK().WEAPONS.bow.arrowSpeed;
      const fly = Math.max(0.05, total / speed), stay = missed ? 1.2 : 0;
      const at = (s, out) => { let i = 0; while (i < segs.length - 1 && s > segs[i]) { s -= segs[i]; i++; } return out.lerpVectors(pts[i], pts[i + 1], Math.min(1, s / (segs[i] || 1))); };
      const p = new T.Vector3(), q = new T.Vector3();
      a.position.copy(from);
      const t0 = { t: 0 };
      this.fx.add(a, fly + stay, (it, k, dt) => {
        t0.t += dt; const s = Math.min(total, t0.t * speed);
        at(s, p); at(Math.min(total, s + 0.5), q);
        a.position.copy(p); if (q.distanceToSquared(p) > 1e-6) { a.lookAt(q); a.rotateY(Math.PI); }       // the model points along -Z
        if (s >= total && !missed) a.visible = false;
      });
      if (missed && this.fb) setTimeout(() => this.match && this.impactAt(to), fly * 1000);
    }
    muzzleWorld() {
      // a point slightly right/below the eye, along the aim: matches where the gun is drawn
      const o = this.eyePos(new T.Vector3()), d = this.aimDir(new T.Vector3());
      if (this.scoped || this.ads) return o.addScaledVector(d, 0.6).add(new T.Vector3(0, -0.06, 0));
      const r = this.ctrl.right();
      return o.addScaledVector(d, 0.75).addScaledVector(r, 0.16).add(new T.Vector3(0, -0.14, 0));
    }
    switchTo(i) {
      if (this.lo.switchTo(i)) { this.dropScope(); VR.Audio.play(this.fb ? 'fbSwitch' : 'click'); }
    }
    /** leave the scope (switching, reloading): aim again to scope back in */
    dropScope() {
      this.scoped = false; this.ui.scope(false);
      VR.Input.hold('aim', false); this.ui.resetTouch();
    }

    /** Host only: a player was hit (by the other player, or by a bot). */
    applyHit(target, dmg, head, by, bi, w) {
      const m = this.match;
      if (!dmg || m.phase !== 'fight' || m.dead[target]) return;
      if (target === m.me && m.type === 'bots') { dmg = this.powers.absorb(dmg); if (dmg <= 0) { this.ui.hitmarker('armor'); return; } }   // my shield / overshield
      m.hp[target] = Math.max(0, m.hp[target] - dmg);
      if (target === m.me && m.type === 'bots' && m.hp[target] > 0) this.powers.onHurt();             // (playing as the SHRINKER)
      const dead = m.hp[target] <= 0;
      const msg = { k: 'hit', t: target, by, bi: bi == null ? -1 : bi, w: w || '', head: head ? 1 : 0, dmg: Math.round(dmg), hp: { h: Math.round(m.hp.h * 10) / 10, g: Math.round(m.hp.g * 10) / 10 }, dead: dead ? 1 : 0 };
      if (m.type !== 'bots') this.send(msg);
      this.onHit(msg);
      if (dead && m.type === 'pvp') this.endRound(by, 'kill');
    }
    /** Host: the other player fired (1v1: at me; co-op: at the bots). Check it, then apply it. */
    onOppFire(d) {
      const m = this.match;
      const wid = FK().WEAPONS[d.w] ? d.w : 'sniper', def = FK().WEAPONS[wid];
      const o = new T.Vector3().fromArray(d.o);
      const dirs = (d.ds || (d.d ? [d.d] : [])).slice(0, def.pellets).map(a => new T.Vector3().fromArray(a).normalize());
      const muzzle = this.avatar ? this.avatar.pos.clone().add(new T.Vector3(0, 1.45, 0)) : o;
      if (m.type === 'pvp' && this.avatar) this.markShot(this.avatar.pos);          // (a teammate is always on the map)
      let ok = false;
      if (m.role === 'h') {
        // referee: is this shot possible? (their weapon, its fire rate, origin near the shooter)
        const now = performance.now() / 1000;
        const allowed = m.rules && m.rules.weapon ? wid === m.rules.weapon : (!m.oppPick || m.oppPick.weapons.includes(wid) || wid === 'knife');
        ok = m.phase === 'fight' && now - (m.oppLast[wid] || -9) >= def.rate * 0.7 && allowed && !(m.dead && m.dead[m.op]);
        const t = this.avatar && this.avatar.target;
        if (t) { const eye = new T.Vector3(t.p[0], t.p[1] + 1.3, t.p[2]); if (eye.distanceTo(o) > 3) ok = false; }
        if (ok) m.oppLast[wid] = now;
      }
      let res;
      const reach = def.melee ? def.range + 0.6 : 200;     // a knife only reaches so far (a little lag allowance)
      if (m.type === 'pvp') {
        // lag tolerance (host): where I was during the last ~300 ms
        const sets = [this.boxesAt(this.ctrl.pos, this.ctrl.crouching)];
        if (m.role === 'h') { const cutoff = performance.now() - 300; for (const h of m.history) if (h.t >= cutoff) sets.push(this.boxesAt(h.p, h.low)); }
        res = this.traceShot(o, dirs, sets.map(s => ({ parts: { head: s.head, body: s.body }, ref: 'me' })), wid, reach);
        if (ok) { const h = res.hits.get('me'); if (h) this.applyHit(m.me, h.dmg, h.head, m.op, null, wid); }
      } else {
        res = this.traceShot(o, dirs, this.bots.targets(), wid, reach);
        if (ok) for (const [b, h] of res.hits) this.hostBotHit(b, h.dmg, h.head, m.op, wid);
      }
      if (def.arrow) this.arrowFx(muzzle, res.ends[0], res.missed[0], res.paths[0]);
      else if (!def.melee) {
        if (m.type === 'coop' && m.role === 'h' && this.avatar && !def.melee) this.bots.hear(this.avatar.pos);
      res.ends.forEach((e, i) => { if (i < 3) this.pathTracer(muzzle, res.paths[i], this.fb ? this.fb.tracerColor(wid) : 0xffe14a, 0.022); if (res.missed[i] && i < 3) this.impactAt(e); });
        if (this.fb) this.fb.muzzle(muzzle, dirs[0] || new T.Vector3(0, 0, -1), wid); else this.fx.flash(muzzle);
      }
      VR.Audio.play(wid === 'sniper' ? 'sniperFar' : def.sound);
    }
    onHit(d) {
      const m = this.match; if (!m) return;
      m.hp = d.hp;
      const fresh = d.dead && !m.dead[d.t];
      if (d.dead) m.dead[d.t] = true;
      const killer = d.by === 'b' ? this.botName(d.bi) : m.names[d.by] || '';
      if (fresh) this.countKill(d.by, d.bi, d.t, null, d.w, !!d.head);
      const cause = FB().causeOf(d.w, d.head), fb = this.fb;
      const type = d.head ? 'crit' : cause.kind === 'ability' ? 'ability' : cause.kind === 'explosion' ? 'explosion' : 'normal';
      if (d.t === m.me) {
        this.dmgFlash = cause.kind === 'fall' ? 0.6 : 1; this.shake = Math.max(this.shake, d.head ? 0.3 : 0.18);
        VR.Audio.play('hurt');
        this.ui.setHP(m.hp[m.me]);
        this.hands.pokeHit(d.head ? 1 : 0.7);
        if (fb) {
          // where it came from: a red arc around the crosshair
          const src = d.by === 'b' ? (this.bots.list[d.bi] && this.bots.list[d.bi].pos) : (d.by === m.op && this.avatar ? this.avatar.pos : null);
          if (src && cause.kind !== 'fall') fb.screen.damageFrom(Math.atan2(-(src.x - this.ctrl.pos.x), -(src.z - this.ctrl.pos.z)), Math.min(1, 0.5 + d.dmg / 60));
          if (cause.kind === 'ability' || cause.kind === 'explosion') fb.screen.tint((FB().ELEMENTS[cause.elem] || FB().ELEMENTS.energy).col[0], 0.5);
        }
        if (fresh) {
          // I am down: say who did it, fall, and (co-op) watch my teammate
          this.dropScope();
          this.deathT = 0.0001; this.deathAt = performance.now();
          this.ui.kill(cause.kind === 'fall' ? VR.t('fb.fell') : VR.t('fm.killedBy', { name: killer }), 'bad');
          this.ui.setDead(true);
          VR.Audio.play('crash');
          if (fb) { fb.screen.tint(0xff2a1a, 0.7); fb.note({ type: 'myDeath', cause: cause.kind }); }
        }
      } else {
        const a = this.avatar;
        if (a && d.t === m.op) {
          if (fb && d.dmg && cause.kind !== 'fall') fb.hit(this.hitPoint(a.pos, a.low, d.head), type === 'explosion' ? 'normal' : type, { prof: a.def.id, elem: cause.elem });
          if (fresh) {
            if (fb) fb.eliminate({ pos: (cause.kind === 'fall' && a.target ? new T.Vector3(...a.target.p) : a.pos).clone(), low: a.low, prof: a.def.id, cause, head: !!d.head, dmg: d.dmg, roundEnd: this.roundEndsWith(d.t), body: a.g });
            else this.fx.puff(a.pos.clone().setY(a.pos.y + 1), 0xff6b5a, 16);
          }
        }
        if (d.by === m.me) {
          this.ui.hitmarker(fresh ? 'kill' : type);
          VR.Audio.play(d.head ? 'headshot' : 'hitmark');
          if (fresh) VR.Audio.play('fbKill');
          if (a) this.dmgNumber(a.pos, d.dmg, type, a.low, 'op');
          if (fresh) { this.ui.kill(VR.t('fm.youKilled', { name: m.names[d.t] }), 'good'); this.ui.numLast = null; }
        }
      }
    }
    botName(i) { const b = this.bots.list[i]; return b ? b.name : VR.t('bot.team'); }
    /** kills / deaths of the players this match (bots keep theirs on the bot) */
    kd(role) { const m = this.match; m.kd = m.kd || { h: { k: 0, d: 0 }, g: { k: 0, d: 0 } }; return m.kd[role]; }
    /** someone went down: count it and put it in the kill feed (killer → weapon → victim) */
    countKill(by, bi, victimRole, victimBot, w, head) {
      const m = this.match, C = VR.DuelArena.COLORS;
      const teamCol = (role) => C[m.type === 'pvp' ? role : 'h'];
      let kName = '', kCol = 0xffffff, kMe = false;
      if (by === 'b') { const kb = this.bots.list[bi]; if (kb) { kb.k = (kb.k || 0) + 1; kName = kb.name; } else kName = VR.t('bot.team'); kCol = C.g; }
      else if ((by === 'h' || by === 'g') && !(w === 'fall' && by === victimRole)) { this.kd(by).k++; kName = m.names[by]; kCol = teamCol(by); kMe = by === m.me; }
      let vName, vCol, vMe = false;
      if (victimBot) { victimBot.d = (victimBot.d || 0) + 1; vName = victimBot.name; vCol = C.g; }
      else { this.kd(victimRole).d++; vName = m.names[victimRole]; vCol = teamCol(victimRole); vMe = victimRole === m.me; }
      this.ui.killFeed({ k: kName, kc: kCol, v: vName, vc: vCol, w: w || '', head, me: kMe || vMe });
    }
    /** an enemy fired: show where it was on the mini-map for a moment */
    markShot(pos) { (this.shotMarks = this.shotMarks || []).push({ x: pos.x, z: pos.z, t: performance.now() }); }
    /** a floating damage number over whoever I hit */
    dmgNumber(pos, dmg, type, low, key) {
      if (!FB().settings.numbers) return;
      const v = new T.Vector3(pos.x, pos.y + (low ? 1.2 : 2.0), pos.z).project(this.camera);
      if (v.z > 1 || v.z < -1) return;                      // behind me
      const el = this.game.renderer.domElement, r = el.getBoundingClientRect();
      this.ui.dmgNum(r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height, Math.round(dmg), type === true ? 'crit' : type || 'normal', key);
    }
    /** where a hit lands on a body (head or chest) */
    hitPoint(pos, low, head) { return new T.Vector3(pos.x, pos.y + (head ? (low ? 1.0 : 1.62) : (low ? 0.6 : 1.1)), pos.z); }
    /** my character's feedback profile, a bot's (an AI fighter has its own), the other player's */
    myProf() { const m = this.match; if (m && m.opts && m.opts.playAs) return 'f_' + m.opts.playAs; return (m && m.chars && m.chars[m.me]) || 'hero'; }
    botProf(b) { return b.fid ? 'f_' + b.fid : (b.body && b.body.def.id) || 'default'; }
    /** does this player going down end the round? (for the stronger last-elimination effect) */
    roundEndsWith(role) {
      const m = this.match;
      if (m.type === 'pvp') return true;
      if (m.type === 'coop') return !!(m.dead.h && m.dead.g);
      return role === m.me;
    }
    /** a shot hit the level: the effect of its material */
    impactAt(e, far) {
      if (!this.fb) { this.fx.puff(e); return; }
      const s = FB().surfaceAt(this.level, e);
      if (!s.solid) return;                                  // in the air (no wall within reach)
      this.fb.impact(e, s.surface, s.normal);
    }
    surfaceUnder() { return FB().groundAt(this.level, this.ctrl.pos); }
    /** my own steps, landings, slides and dashes */
    onStep() {
      if (!this.fb) { VR.Audio.play('fpStep'); return; }
      const sf = this.surfaceUnder();
      this.stepSide = -(this.stepSide || 1);
      this.fb.stepSound(sf, this.myProf(), this.ctrl.sprinting && this.ctrl.speed > (this.ctrl.walkSpeed || 5) * 1.1);
      // dust where I step (a little ahead, so it shows at the bottom of the screen)
      const f = this.ctrl.forward();
      this.fb.footstep(this.ctrl.pos.clone().addScaledVector(f, 0.55), sf, this.myProf(), this.stepSide);
    }
    onLand(speed) {
      if (!this.fb) { if (speed > 7) { VR.Audio.play('land'); this.fx.puff(this.ctrl.pos.clone().setY(this.ctrl.pos.y + 0.05), 0xe0d4b4, 5); } return; }
      const P = FB().profile(this.myProf());
      const k = this.fb.land(this.ctrl.pos, speed, this.surfaceUnder(), P.id);
      if (k > 0) { this.landPulse = Math.max(this.landPulse || 0, k); this.shake = Math.max(this.shake, 0.1 * k * P.shake); }
    }
    moveFx(dt) {
      const c = this.ctrl, fb = this.fb; if (!fb) return;
      if (c.slideTimer > 0 && c.grounded && c.speed > 3) {
        this.slideFxT = (this.slideFxT || 0) - dt;
        if (this.slideFxT <= 0) { this.slideFxT = 0.035; const d = c.vel.clone().setY(0).normalize(); fb.slideTrail(c.pos.clone().addScaledVector(d, 0.6), d, this.surfaceUnder(), this.myProf()); }
      }
      if (c.burstFov > 2.5 || c.speed > (c.walkSpeed || 5) * 2.2) {
        this.dashFxT = (this.dashFxT || 0) - dt;
        if (this.dashFxT <= 0) { this.dashFxT = 0.045; const d = c.vel.clone().setY(0); if (d.lengthSq() > 1) fb.dashTrail(c.pos.clone().addScaledVector(d.normalize(), -1.4), this.myProf()); }
      }
    }
    /** I fell out of the arena: a fall elimination (the host decides) */
    onFall() {
      const m = this.match; if (!m || m.phase !== 'fight' || m.dead[m.me]) return;
      if (this.fb) this.fb.eliminate({ pos: this.lastPos ? this.lastPos.clone() : this.ctrl.pos.clone(), prof: this.myProf(), cause: { kind: 'fall' } });
      if (m.role === 'h') this.applyFall(m.me); else this.send({ k: 'fell' });
    }
    applyFall(role) {
      const m = this.match; if (!m || m.dead[role]) return;
      const by = m.type === 'pvp' ? (role === 'h' ? 'g' : 'h') : role;      // 1v1: the other player takes the round
      this.applyHit(role, 9999, false, by, null, 'fall');
    }
    /** bodies I only see: their steps, landings, slides and dashes */
    watchBodies(dt) {
      const fb = this.fb, m = this.match; if (!fb || !dt) return;
      if (this.avatar && !(m.dead && m.dead[m.op])) fb.watchBody(this.avatar, dt, this.avatar.def.id, this.level);
      for (const b of this.bots.list) if (b.alive) fb.watchBody(b.body, dt, this.botProf(b), this.level);
    }

    // ---- bots (host decides; the co-op guest is told)
    /** the players on the team the bots fight (with where they are now) */
    teamPlayers() {
      const m = this.match, c = this.ctrl;
      const out = [{ id: m.me, pos: c.pos, low: c.crouching, vel: c.vel, alive: !m.dead[m.me], scale: c.scaleK || 1 }];
      if (m.type === 'coop' && this.avatar) out.push({ id: m.op, pos: this.avatar.pos, low: this.avatar.low, vel: new T.Vector3(), alive: !m.dead[m.op] });
      const dec = m.type === 'bots' && this.powers.decoyPlayer(); if (dec) out.push(dec);        // my decoy draws their fire
      return out;
    }
    teamDead() { const m = this.match; return m.type === 'coop' ? (m.dead.h && m.dead.g) : m.dead[m.me]; }
    hostBotHit(b, dmg, head, by, w) {
      const m = this.match;
      if (b && b.owner) { this.bots.hurt(b, dmg); this.ui.hitmarker(false); return; }       // a fighter's decoy
      if (!b || !b.alive || m.phase !== 'fight' || !dmg) return;
      const armored = !!(b.fx && b.fx.shieldT > 0);              // a fighter's shield is up: armor feedback
      if (by === m.me && m.type === 'bots') dmg *= this.powers.dmgMul();       // my rage
      const dead = this.bots.hurt(b, dmg);
      const msg = { k: 'bh', i: b.i, hp: Math.round(b.hp), dmg: Math.round(dmg), head: head ? 1 : 0, by, w: w || '', dead: dead ? 1 : 0, ar: armored ? 1 : 0 };
      if (m.type === 'coop') this.send(msg);
      this.onBotHit(msg);
    }
    onBotHit(d) {
      const m = this.match, b = this.bots.list[d.i]; if (!m || !b) return;
      const fresh = d.dead && !b.downShown;               // (the host has already marked it dead)
      if (d.dead) b.downShown = true;
      b.hp = d.hp; if (d.dead) b.alive = false;
      const cause = FB().causeOf(d.w, d.head), prof = this.botProf(b);
      const type = d.ar ? 'armor' : d.head ? 'crit' : cause.kind === 'ability' ? 'ability' : cause.kind === 'explosion' ? 'explosion' : 'normal';
      if (this.fb && d.dmg) this.fb.hit(this.hitPoint(b.pos, false, d.head), type === 'explosion' ? 'normal' : type, { prof, elem: cause.elem });
      if (d.by === m.me) {
        this.ui.hitmarker(fresh ? 'kill' : type);
        VR.Audio.play(d.head ? 'headshot' : 'hitmark');
        if (fresh) VR.Audio.play('fbKill');
        if (d.dmg) this.dmgNumber(b.pos, d.dmg, type, false, 'b' + b.i);
      }
      if (fresh) {
        const last = this.bots.aliveCount === 0;
        this.ui.numLast = null;                                  // the next number (a new life) starts its own count
        if (this.fb) this.fb.eliminate({ pos: b.pos.clone(), prof, cause, head: !!d.head, dmg: d.dmg, roundEnd: last, body: b.body.g });
        else this.fx.puff(b.pos.clone().setY(b.pos.y + 1), 0xff6b5a, 16);
        if (last && d.by === m.me && m.type === 'bots' && this.fb) this.fb.slowmo(0.35, 0.35);
        this.countKill(d.by, -1, null, b, d.w, !!d.head);
        if (d.by === m.me) this.ui.kill(VR.t('fm.youKilled', { name: b.name }), 'good');
        VR.Audio.play('enemyDown');
      }
    }
    botHitPlayer(pid, dmg, head, bi, w) {
      const b = this.bots.list[bi];
      if (pid === 'decoy') { this.powers.popDecoy(); return; }                       // they shot my decoy
      if (pid === this.match.me && this.hostage.held && this.hostage.intercept(b ? b.pos : null, dmg)) return;   // the hostage in front took it
      this.applyHit(pid, dmg, head, 'b', bi, w || (b ? b.lo.id : ''));
    }
    /** an AI fighter's freeze: I move slower for a moment */
    statusSlow(k, dur) { this.slowK = k; this.slowT = Math.max(this.slowT || 0, dur); this.ui.slowed(true); VR.Audio.play('scope'); }

    // ---- mines (bought): placed at your feet, go off when an enemy steps close. The host decides.
    placeMine() {
      const m = this.match, c = this.ctrl;
      if ((m.phase !== 'fight' && m.phase !== 'practice') || (m.dead && m.dead[m.me]) || !c.grounded) return;
      if (!this.lo.useMine()) { VR.Audio.play('buzz'); return; }
      const f = c.forward();
      const p = [r2(c.pos.x + f.x * 0.7), r2(c.pos.y + 0.02), r2(c.pos.z + f.z * 0.7)];
      const id = VR.Net.randomCode(5);
      this.spawnMine(id, m.me, p);
      this.send({ k: 'mine', id, o: m.me, p });
      VR.Audio.play('click'); this.hands.pokeReach();
    }
    spawnMine(id, owner, p) {
      if (this.mines.some(x => x.id === id)) return;
      const obj = VR.WeaponKit.model('mine'); obj.position.fromArray(p); this.scene.add(obj);
      this.mines.push({ id, owner, pos: new T.Vector3().fromArray(p), obj, t: 0, led: obj.getObjectByName('led') });
    }
    /** host: who could set this mine off (enemies of its owner) → [{ pos, hit(dmg) }] */
    mineVictims(mi) {
      const m = this.match, out = [];
      if (m.type === 'pvp') {
        if (mi.owner === m.me) { const a = this.avatar; if (a && !m.dead[m.op]) out.push({ pos: a.target ? new T.Vector3(...a.target.p) : a.pos, hit: (d) => this.applyHit(m.op, d, false, mi.owner, null, 'mine') }); }
        else if (!m.dead[m.me]) out.push({ pos: this.ctrl.pos, hit: (d) => this.applyHit(m.me, d, false, mi.owner, null, 'mine') });
      } else for (const b of this.bots.list) if (b.alive) out.push({ pos: b.pos, hit: (d) => this.hostBotHit(b, d, false, mi.owner, 'mine') });
      return out;
    }
    updateMines(dt) {
      const m = this.match;
      for (const mi of this.mines.slice()) {
        mi.t += dt;
        if (mi.led) mi.led.visible = mi.t < D.MINE_ARM || (mi.t * 2.5) % 1 < 0.5;
        if (m.role !== 'h' || m.solo || m.phase !== 'fight' || mi.t < D.MINE_ARM) continue;
        const vs = this.mineVictims(mi);
        if (!vs.some(v => Math.hypot(v.pos.x - mi.pos.x, v.pos.z - mi.pos.z) < D.MINE_TRIGGER && Math.abs(v.pos.y - mi.pos.y) < 1.2)) continue;
        this.send({ k: 'mboom', id: mi.id });
        this.onMineBoom(mi.id);
        for (const v of vs) {
          const d = v.pos.distanceTo(mi.pos);
          if (d < D.MINE_R) v.hit(D.MINE_DMG * (1 - 0.65 * d / D.MINE_R));
        }
      }
    }
    onMineBoom(id) {
      const i = this.mines.findIndex(x => x.id === id); if (i < 0) return;
      const mi = this.mines[i]; this.mines.splice(i, 1); this.scene.remove(mi.obj);
      this.fx.wave(mi.pos.clone().setY(mi.pos.y + 0.3), 0xff5a2a);
      this.fx.puff(mi.pos.clone().setY(mi.pos.y + 0.4), 0xff8a3a, 22);
      VR.Audio.play('burst'); VR.Audio.play('crash');
      if (this.ctrl.pos.distanceTo(mi.pos) < 8) this.shake = Math.max(this.shake, 0.35);
    }
    /** a bot's shot: tracers here, and on the co-op guest's screen */
    botShotFx(b, ends, wid, paths) {
      const m = this.match;
      const muzzle = new T.Vector3(b.pos.x - Math.sin(b.yaw) * 0.5, b.pos.y + 1.45, b.pos.z - Math.cos(b.yaw) * 0.5);
      this.markShot(b.pos);
      ends.forEach((e, i) => { this.pathTracer(muzzle, paths && paths[i], this.fb ? this.fb.tracerColor(wid) : 0xff7a3a, 0.022); this.impactAt(e, true); });
      if (this.fb) this.fb.muzzle(muzzle, ends[0] ? ends[0].clone().sub(muzzle).normalize() : new T.Vector3(0, 0, -1), wid); else this.fx.flash(muzzle, 0xffb070);
      VR.Audio.play(wid === 'sniper' ? 'sniperFar' : 'enemyShot');
      if (m.type === 'coop') this.send({ k: 'bf', i: b.i, w: wid, e: ends.map(e => e.toArray().map(r2)) });
    }
    onBotShot(d) { const b = this.bots.list[d.i]; if (b) this.botShotFx(b, (d.e || []).map(a => new T.Vector3().fromArray(a)), d.w); }
    /** a bot throws a grenade (host) */
    throwNadeFrom(p, v) {
      const id = VR.Net.randomCode(5);
      this.spawnNade(id, p.toArray(), v.toArray(), true);
      this.send({ k: 'nade', id, p: p.toArray().map(r2), v: v.toArray().map(r2) });
      VR.Audio.play('throw');
    }

    // ---- impulse grenade
    throwNade() {
      const m = this.match;
      if ((m.phase !== 'fight' && m.phase !== 'practice') || (m.dead && m.dead[m.me])) return;
      if (!this.lo.useNade(D.NADE_RECHARGE)) return;
      const o = this.eyePos(new T.Vector3()), d = this.aimDir(new T.Vector3());
      const p = o.addScaledVector(d, 0.5).addScaledVector(this.ctrl.right(), -0.12);
      const v = d.multiplyScalar(D.NADE_SPEED).add(new T.Vector3(0, 2.5, 0)).addScaledVector(this.ctrl.vel, 0.4);
      const id = VR.Net.randomCode(5);
      this.spawnNade(id, p.toArray(), v.toArray(), true);
      this.send({ k: 'nade', id, p: p.toArray().map(r2), v: v.toArray().map(r2) });
      this.hands.pokeReach(); this.lo.switchT = Math.max(this.lo.switchT, 0.18);
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
        let boom = VR.WeaponKit.stepNade(n, dt, this.solidBoxes, undefined, this.windNow());
        n.obj.position.copy(n.pos);
        nadeSpin(n, dt);
        if (!n.mine) { if (n.t > 8) { this.scene.remove(n.obj); this.nades.splice(i, 1); } continue; }
        // it lands, then goes off 1 s later (js/combat/weaponkit.js)
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
      if (m && (m.phase === 'fight' || m.phase === 'practice')) {
        if (!(m.dead && m.dead[m.me])) this.impulse(p);
        if (m.type !== 'pvp' && m.role === 'h') this.bots.impulse(p);
      }
    }
    /** Push me away from a blast. Under the feet = rocket jump. No damage. */
    impulse(p) {
      if (VR.WeaponKit.impulse(this.ctrl, p, D.NADE_R, D.NADE_PUSH, this._v)) { this.shake = Math.max(this.shake, 0.22); this.hostage.release('jump'); }   // a grenade jump: the hostage gets away
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
        else this.ui.showInvite(this.incoming.name, this.incoming.left, D.INVITE_TIME, () => this.acceptInvite(), () => this.declineInvite(), this.inviteSub(this.incoming.opts));
      }
      const m = this.match;
      if (m && m.solo) { if (this.game.state === 'duel') { this.matchmake(dt); this.updateWaitText(); } return; }
      // until the opponent's first message (they may still be loading the arena) allow 25 s
      if (m && m.type !== 'bots' && !m.over && m.phase !== 'enter' && performance.now() - m.lastHeard > (m.heard ? D.LOST_AFTER : 25) * 1000) this.onOppLeft();
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
      if (this.fb) dt = this.fb.scaleDt(dt);                // a very short slow motion (last kill vs bots, if allowed)
      const c = this.ctrl, L = this.level;
      // against bots alone the game really pauses (nobody else is playing)
      if (m.type === 'bots' && this.ui.modal && m.phase !== 'wait' && m.phase !== 'over') { VR.Input.takeLook(); while (VR.Input.nextAction()); return; }
      const down = !!(m.dead && m.dead[m.me]);
      const canMove = (m.phase === 'fight' || m.phase === 'practice') && !this.ui.modal && !down;
      const canLook = (m.phase === 'fight' || m.phase === 'count' || m.phase === 'practice') && !this.ui.modal && !down;

      // timers
      const wasReloading = this.lo.reloadT > 0;
      this.lo.update(dt, D.NADE_RECHARGE);
      if (!wasReloading && this.lo.reloadT > 0) { if (!this.lo.def.arrow) { this.dropScope(); VR.Audio.play('reload'); } else VR.Audio.play('click'); }   // a bow nocks the next arrow (aim stays)

      // actions
      let a;
      while ((a = VR.Input.nextAction())) {
        if (!canMove) continue;
        if (a === 'jump') c.jump();
        else if (a === 'slide') c.slidePress();
        else if (a === 'fire') this.fire();
        else if (a === 'burst' || a === 'grenade') this.throwNade();
        else if (a === 'reload') { if (this.lo.startReload()) { this.dropScope(); VR.Audio.play('reload'); } }
        else if (a === 'slot1') this.switchTo(0);
        else if (a === 'slot2') this.switchTo(1);
        else if (a === 'slot3' || a === 'knife') this.switchTo(this.lo.knifeSlot);
        else if (a === 'mine') this.placeMine();
        else if (a === 'ability') this.powers.use();
        else if (a === 'grab') this.hostage.toggle();
        else if (a === 'interact') this.loot.pick();
        else if (a === 'slotNext' || a === 'slotPrev' || a === 'swap') this.switchTo((this.lo.cur + 1) % this.lo.slots.length);
      }
      // automatic weapons fire while the button is held
      if (canMove && this.lo.def.auto && VR.Input.fireHeld()) this.fire();
      // aim / scope
      const wantScope = canMove && !!this.lo.def.scope && VR.Input.aimHeld() && this.lo.reloadT <= 0 && this.lo.switchT <= 0;
      if (wantScope !== this.scoped) { this.scoped = wantScope; this.ui.scope(wantScope); if (wantScope) VR.Audio.play('scope'); }
      // iron sights (rifles, SMGs, pistols…): aim down the sights, no scope picture
      const wantAds = canMove && !!this.lo.def.ads && VR.Input.aimHeld() && (this.lo.reloadT <= 0 || this.lo.def.arrow) && this.lo.switchT <= 0;   // (a bow keeps aiming while nocking)
      if (wantAds && !this.ads) VR.Audio.play('scope');
      this.ads = wantAds;
      const look = VR.Input.takeLook();
      if (canLook) c.look(look.x, look.y, this.sens() * (this.scoped ? D.SCOPE_SENS : this.ads ? 0.7 : 1));
      const move = canMove ? VR.Input.moveVector() : { x: 0, y: 0 };
      if (m.phase !== 'end' && m.phase !== 'over' && m.phase !== 'wait') {
        c.sprint = canMove && VR.Input.sprintHeld() && !this.hostage.held;     // no running with a hostage
        this.lastPos = (this.lastPos || new T.Vector3()).copy(c.pos);
        const evs = c.update(dt, L, move, canMove && VR.Input.crouchHeld());
        for (const e of evs) {
          if (e.type === 'jump') VR.Audio.play('jump');
          else if (e.type === 'land') this.onLand(e.speed);
          else if (e.type === 'slide') VR.Audio.play('slide');
          else if (e.type === 'respawn') this.onFall();          // fell out of the world
        }
        evs.length = 0;
        if (c.grounded && c.speed > 2 && !c.slideTimer) { this.stepAcc += c.speed * dt; if (this.stepAcc > 2.1) { this.stepAcc = 0; this.onStep(); } }
        this.moveFx(dt);
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
        if (m.type === 'pvp') {
          if (m.role === 'h' && m.timeLeft <= 0) {
            const w = m.hp.h > m.hp.g ? 'h' : m.hp.g > m.hp.h ? 'g' : null;
            this.endRound(w, 'time');
          }
        } else if (m.role === 'h') {
          // against bots: they all go down → the team wins; the team all down → the bots win
          if (this.bots.aliveCount === 0) this.endRound('h', 'kill');
          else if (this.teamDead()) this.endRound('g', 'kill');
          else if (m.timeLeft <= 0) this.endRound(null, 'time');
        }
      } else if (m.phase === 'end' && m.role === 'h') {
        m.endT += dt;
        if (m.endT >= D.END_PAUSE) {
          const done = m.sc.h >= this.firstTo() || m.sc.g >= this.firstTo() || m.round >= this.maxRounds();
          if (done) this.endMatch(); else this.startRound(m.round + 1);
          m.endT = -99;
        }
      } else if (m.phase === 'wait') {
        if (!m.readyMe) {
          // buying: the clock runs; at zero you are ready with what you picked
          m.buyLeft -= dt;
          this.ui.buyTime(m.buyLeft);
          if (m.buyLeft <= 0) this.buyReady();
        } else if (m.type !== 'bots') {
          m.readyT -= dt;
          if (m.readyT <= 0) { m.readyT = 1; this.send({ k: 'ready', pick: m.pick }); }
        }
      } else if (m.phase === 'over' && m.result) {
        m.autoT = (m.autoAt - performance.now()) / 1000;          // real seconds, whatever the frame rate
        this.ui.setContinue(!!this.game.duelFromRun, m.autoT);
        if (m.autoT <= 0) this.leave();
      }

      // ping: a round trip to the other player every second, shown on screen (not against the computer alone)
      if (m.type !== 'bots' && !m.solo && m.phase !== 'over') {
        m.pingT = (m.pingT || 0) - dt;
        if (m.pingT <= 0) { m.pingT = 1; this.send({ k: 'ping', ts: performance.now() }); }
      }
      // stream my state
      m.sendT -= dt;
      if (m.sendT <= 0 && m.phase !== 'over') {
        m.sendT = D.SEND_EVERY;
        this.send({ k: 'st', p: [r2(c.pos.x), r2(c.pos.y), r2(c.pos.z)], yw: r2(c.yaw), pt: r2(c.pitch), c: c.crouching ? 1 : 0, s: c.slideTimer > 0 ? 1 : 0, w: 0, wi: this.lo.id });
      }
      // powers, loot, a hostage held in front of me (before the bots are drawn)
      if (m.type === 'bots') {
        this.hostage.update(dt); this.powers.update(dt); this.loot.update(dt);
        this.promptT = (this.promptT || 0) - dt;
        if (this.promptT <= 0) { this.promptT = 0.15; const lp = this.loot.prompt(), hp = lp ? null : this.hostage.prompt(); this.ui.setPrompt(lp || hp, lp ? 'pick' : hp ? 'grab' : null); }
      }
      // the bots: my game runs them (co-op: the host's, and it streams them)
      if (m.type !== 'pvp') {
        if (m.role === 'h' && m.phase === 'fight') this.bots.update(dt, this.teamPlayers());
        if (m.type === 'coop' && m.role === 'h') { m.botSendT = (m.botSendT || 0) - dt; if (m.botSendT <= 0) { m.botSendT = D.BOT_SEND_EVERY; this.send({ k: 'bs', b: this.bots.net() }); } }
        this.bots.render(dt);
      }
      if (m.role === 'h') {
        m.history.push({ t: performance.now(), p: c.pos.clone(), low: c.crouching });
        while (m.history.length && performance.now() - m.history[0].t > 400) m.history.shift();
      }

      this.placeAvatar(dt);
      this.updateNades(dt);
      this.updateMines(dt);
      this.fx.update(dt);
      if (this.weather) {
        this.weather.update(dt);
        c.wind = this.weather.wind;
        if (m.role === 'h') { m.wxT = (m.wxT || 0) - dt; if (m.wxT <= 0) { m.wxT = 2; this.sendWeather(); } }
        this.ui.setWind(this.weather, c.yaw);
      } else { c.wind = null; this.ui.setWind(null); }
      this.watchBodies(dt);
      this.updateView(dt, look);
      if (this.fb) {
        const hs = c.speed, walk = c.walkSpeed || 5;
        let sp = Math.max(0, Math.min(1, (hs - walk * 1.15) / (walk * 1.1)));
        if (c.burstFov > 2.5) sp = Math.max(sp, 0.85 * Math.min(1, c.burstFov / 5));
        if (!c.grounded && c.vel.y < -13) sp = Math.max(sp, Math.min(1, (-c.vel.y - 13) / 10));
        if (down || this.scoped) sp = 0;
        this.fb.update(dt, { speed: sp, yaw: c.yaw });
        if (this.fb.cameraShake) { this.shake = Math.max(this.shake, this.fb.cameraShake); this.fb.cameraShake = 0; }
      }

      // HUD
      this.ui.setTimer(m.phase === 'count' || m.phase === 'wait' ? this.roundTime() : m.timeLeft, Math.max(1, m.round));
      this.ui.setHP(m.hp[m.me]);
      this.ui.setLoadout(this.lo, D.NADE_RECHARGE);
      // slowed (a fighter's freeze)
      if (this.slowT > 0) { this.slowT -= dt; c.speedMul = this.slowK || 0.5; if (this.slowT <= 0) { c.speedMul = 1; this.ui.slowed(false); } } else c.speedMul = 1;
      if (m.type === 'bots') c.speedMul *= this.powers.speedMul();
      this.mapT = (this.mapT || 0) - dt;
      if (this.mapT <= 0) { this.mapT = 1 / 15; this.drawMap(); }
      // the scoreboard while Tab (its binding) is held
      const board = !m.solo && m.phase !== 'over' && (VR.Input.actionHeld('journal') || VR.Input.touchHeld('scores'));
      if (board) { this.boardT = (this.boardT || 0) - dt; if (this.boardT <= 0 || !this.ui.boardOn) { this.boardT = 0.2; this.ui.showBoard(this.boardData()); } }
      else if (this.ui.boardOn) this.ui.hideBoard();
      this.ui.touchMines(this.lo.mines.has);
      if (m.type !== 'pvp') {
        if (this.bots.fsys) this.ui.setBotsLeft(null, this.bots.fsys.status());
        else this.ui.setBotsLeft(m.phase === 'fight' ? this.bots.aliveCount : null);
      }
      this.dmgFlash = Math.max(0, this.dmgFlash - dt * 2.2);
      const fs = FB().settings, low = m.hp[m.me] <= 45 && m.phase === 'fight' && !down;
      this.ui.damage(this.dmgFlash * 0.7 * (fs.flashes ? 1 : 0.35) + (low ? 0.14 + 0.07 * Math.sin(performance.now() / (m.hp[m.me] <= 20 ? 110 : 190)) : 0));
    }

    /** the mini-map: the arena from above, my side at the bottom; enemies only where they last fired */
    drawMap() {
      const m = this.match, L = this.level; if (!m || !L) return;
      const B = L.extras.bounds, flip = m.type === 'pvp' && m.me === 'g';
      const now = performance.now();
      const pts = { me: { x: this.ctrl.pos.x, z: this.ctrl.pos.z, yaw: this.ctrl.yaw, col: VR.DuelArena.COLORS[m.type === 'pvp' ? m.me : 'h'] }, mates: [], shots: [] };
      if (m.type === 'coop' && this.avatar && !m.dead[m.op]) pts.mates.push({ x: this.avatar.pos.x, z: this.avatar.pos.z });
      this.shotMarks = (this.shotMarks || []).filter(s => now - s.t < 2500);
      for (const s of this.shotMarks) pts.shots.push({ x: s.x, z: s.z, a: 1 - (now - s.t) / 2500 });
      if (!this.mapSolids) this.mapSolids = new WeakMap();
      let solids = this.mapSolids.get(L);
      if (!solids) {
        solids = L.solids.filter(s => s.max[1] > 0.6 && s.min[1] < 2 && s.max[0] < B.W - 0.2 && s.min[0] > -B.W + 0.2 && s.max[2] < B.LEN - 0.2 && s.min[2] > -B.LEN + 0.2)
          .map(s => [s.min[0], s.min[2], s.max[0], s.max[2]]);
        this.mapSolids.set(L, solids);
      }
      this.ui.drawMap({ W: B.W, LEN: B.LEN, flip, solids, ...pts });
    }
    /** what the Tab scoreboard shows */
    boardData() {
      const m = this.match, C = VR.DuelArena.COLORS, ping = m.ping == null ? null : Math.round(m.ping);
      const row = (name, role, me) => ({ name, k: this.kd(role).k, d: this.kd(role).d, ping: m.type === 'bots' ? null : ping, me, col: C[m.type === 'pvp' ? role : 'h'], dead: !!m.dead[role] });
      const teamA = [row(m.names[m.me] || VR.t('bot.you'), m.me, true)];
      if (m.type !== 'bots') teamA.push(row(m.names[m.op], m.op, false));
      let teams;
      if (m.type === 'pvp') teams = [[teamA[0]], [teamA[1]]];
      else teams = [teamA, this.bots.list.map(b => ({ name: b.name, k: b.k || 0, d: b.d || 0, ping: 'BOT', col: C.g, dead: !b.alive }))];
      const need = this.firstTo(), sc = [m.sc[this.side()], m.sc[this.oside()]];
      return { teams, sc, round: Math.max(1, m.round), maxRounds: this.maxRounds(), firstTo: need, toWin: need - sc[0], toLose: need - sc[1],
        left: Math.max(0, this.maxRounds() - Math.max(1, m.round)), mode: m.type === 'pvp' ? VR.t('du.mode') : VR.t(m.type === 'coop' ? 'fm.coopMode' : 'fm.botsMode') };
    }

    /** Camera effects (recoil, shake, scope FOV) and the weapon in the hands. */
    updateView(dt, look) {
      const c = this.ctrl, cam = this.camera;
      const fs = FB().settings, SK = fs.shake;               // accessibility: camera shake can be reduced or turned off
      this.kick = Math.max(0, this.kick - dt * 5);
      if (this.kick > 0) cam.rotation.x += Math.sin(this.kick * Math.PI) * 0.05 * (0.5 + 0.5 * SK);
      if (this.shake > 0) {
        this.shake = Math.max(0, this.shake - dt);
        const s = this.shake * 0.12 * SK;
        cam.position.x += (Math.random() - 0.5) * s; cam.position.y += (Math.random() - 0.5) * s;
      }
      this.adsK = (this.adsK || 0) + ((this.ads ? 1 : 0) - (this.adsK || 0)) * Math.min(1, dt * 14);
      const adsF = 1 - (1 - (this.lo.def.ads || 1)) * this.adsK;
      // FOV kick: sprinting widens the view a little; a landing pulses it (speed effects can be turned off)
      const walk = c.walkSpeed || 5, sprinting = c.sprint && c.grounded && c.speed > walk * 1.05 && !this.ads && !this.scoped;
      this.fovKick = (this.fovKick || 0) + ((fs.speed && sprinting ? 5 : 0) - (this.fovKick || 0)) * Math.min(1, dt * 6);
      this.landPulse = Math.max(0, (this.landPulse || 0) - dt * 4);
      const pulse = fs.speed ? Math.sin(Math.min(1, this.landPulse) * Math.PI) * -2.5 : 0;
      const fov = (this.scoped ? D.SCOPE_FOV : this.baseFov() * adsF + this.fovKick + pulse) + c.burstFov * (fs.speed ? 1 : 0.3);
      cam.fov += (fov - cam.fov) * Math.min(1, dt * 18);
      cam.updateProjectionMatrix();
      // hands + weapon
      this.hands.update(dt, c, look);
      const lo = this.lo, id = lo.id;
      if (this.gunId !== id) {
        for (const k in this.gunModels) this.gunModels[k].visible = false;
        if (!this.gunModels[id]) {
          const g = id === 'sniper' ? VR.DuelWeapons.sniper() : VR.WeaponKit.model(id);
          g.scale.setScalar(id === 'sniper' ? 0.62 : id === 'spear' ? 0.55 : id === 'bow' ? 0.55 : 0.8);
          this.gunHolder.add(g); this.gunModels[id] = g;
        }
        this.gunModels[id].visible = true; this.gunId = id;
      }
      if (id === 'bow' && this.gunModels.bow) { const n = this.gunModels.bow.getObjectByName('nock'); if (n) n.visible = lo.slot.mag > 0; }   // no arrow while nocking
      const mm = this.match;
      this.gunHolder.visible = !(mm && mm.dead && mm.dead[mm.me]);
      const wide = Math.min(1, Math.max(0.42, this.hands.camera.aspect / 1.5));
      const sw = lo.switchT > 0 ? Math.sin((lo.switchT / 0.25) * Math.PI) : 0;
      const rl = lo.reloadT > 0 ? Math.sin((1 - lo.reloadT / lo.def.reload) * Math.PI) : 0;
      // the weapon's own pose (light pistol, steady sniper, heavy machine gun, knife ready…) + a reduced
      // share of the arms' run motion, inertia on look and movement, sprint / jump / landing / hit poses
      const P = POSE[id] || POSE.rifle, mo = this.hands.motion || {}, wt = mo.weight || 1;
      const firing = performance.now() - (this.lastFireT || 0) < 450;
      const spr = (mo.sprint || 0) * (firing ? 0.2 : 1);
      const bob = Math.sin(c.bobPhase) * 0.012 * c.bobAmt * P.run + (mo.lift || 0) * 0.012 * P.run;
      this.gunHolder.position.set(
        P.x * wide + this.hands.sway.x * P.sway + (mo.lagX || 0) * P.lag + Math.cos(c.bobPhase) * 0.006 * c.bobAmt * P.run + spr * 0.02,
        P.y + this.hands.sway.y * P.sway + (mo.lagY || 0) * P.lag - sw * 0.25 - rl * 0.1 + bob + c.landDip * 0.2 * wt * P.heavy - spr * 0.06 + (mo.fall || 0) * 0.035 - (mo.up || 0) * 0.02 - (mo.settle || 0) * P.heavy + (mo.hit || 0) * 0.025,
        P.z + this.kick * 0.07 + (mo.swing || 0) * 0.012 * P.run + (mo.dash || 0) * 0.06 + spr * 0.03);
      this.gunHolder.rotation.set(this.kick * 0.18 + rl * 0.5 + P.rx - spr * 0.45 + (mo.fall || 0) * 0.15 - (mo.hit || 0) * 0.15,
        0.04 + P.ry + spr * 0.55, -rl * 0.5 + P.rz + (mo.lagX || 0) * 2.5 * P.lag + spr * 0.15);
      // aiming down the sights: the gun comes to the middle, its sights on the centre of the screen
      const k = this.adsK, gm = this.gunModels[id];
      if (k > 0.001 && gm) {
        const sy = (gm.userData.sightY || 0.05) * gm.scale.y;
        const ax = 0, ay = -sy + this.hands.sway.y * 0.3, az = -0.64 + this.kick * 0.04;
        this.gunHolder.position.x += (ax - this.gunHolder.position.x) * k;
        this.gunHolder.position.y += (ay - this.gunHolder.position.y) * k;
        this.gunHolder.position.z += (az - this.gunHolder.position.z) * k;
        this.gunHolder.rotation.x *= 1 - k * 0.85; this.gunHolder.rotation.y *= 1 - k; this.gunHolder.rotation.z *= 1 - k;
      }
      for (const h of this.hands.hands) h.visible = k < 0.5;
      this.ui.adsCross(k > 0.5);
      this.hands.root.visible = !this.scoped;
      if (mm && mm.dead && mm.dead[mm.me] && this.deathT > 0) this.deathView(dt);
    }
    /** I am down: the view drops to the floor and tips over; in co-op, after a moment, follow my teammate */
    deathView(dt) {
      const m = this.match, cam = this.camera, c = this.ctrl;
      this.deathT = Math.max(0.0001, (performance.now() - this.deathAt) / 1000);   // real seconds (slow devices too)
      const mate = m.type === 'coop' && this.avatar && !m.dead[m.op] ? this.avatar : null;
      if (mate && this.deathT > 1.6) {
        const a = mate, back = new T.Vector3(Math.sin(a.yaw), 0, Math.cos(a.yaw));
        const want = a.pos.clone().addScaledVector(back, 3.4); want.y = a.pos.y + 2.3;
        const look = a.pos.clone(); look.y += 1.3;
        // keep the camera out of walls
        const dir = want.clone().sub(look), len = dir.length(); dir.normalize();
        const wall = this.wallDist(look, dir, len);
        cam.position.copy(look).addScaledVector(dir, Math.max(0.6, Math.min(len, wall - 0.25)));
        cam.lookAt(look);
        this.ui.spectate(VR.t('fm.watching', { name: m.names[m.op] }));
        return;
      }
      this.ui.spectate(null);
      const k = Math.min(1, this.deathT / 0.7), e = 1 - (1 - k) * (1 - k);
      cam.position.set(c.pos.x, c.pos.y + c.eye + (0.25 - c.eye) * e, c.pos.z);
      cam.rotation.set(c.pitch * (1 - e) + 0.35 * e, c.yaw, 1.1 * e);
    }

    render(renderer) {
      renderer.render(this.scene, this.camera);
      const m = this.match;
      if (m && m.phase !== 'wait' && !this.scoped && !(m.dead && m.dead[m.me])) {
        const ac = renderer.autoClear;
        renderer.autoClear = false; renderer.clearDepth();
        renderer.render(this.hands.scene, this.hands.camera);
        renderer.autoClear = ac;
      }
    }
    resize(w, h) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.hands.resize(w / h); }
  }

  /* ------------------------------------------------------------------
   * A player-shaped body in the arena: the other player, or a bot.
   * ---------------------------------------------------------------- */
  /** how each weapon sits in the hands: offset, sway / lag / run-motion share, heaviness, angle */
  const POSE = {
    pistol:   { x: 0.15, y: -0.18, z: -0.42, sway: 1.25, lag: 1.1, run: 1.1, heavy: 0.8, rx: 0.02, ry: 0, rz: 0 },
    revolver: { x: 0.15, y: -0.19, z: -0.43, sway: 1.2, lag: 1.2, run: 1, heavy: 1, rx: 0.02, ry: 0, rz: 0 },
    smg:      { x: 0.17, y: -0.2, z: -0.45, sway: 1.05, lag: 1, run: 1, heavy: 1, rx: 0, ry: 0, rz: 0 },
    rifle:    { x: 0.17, y: -0.2, z: -0.46, sway: 1, lag: 1, run: 0.9, heavy: 1.1, rx: 0, ry: 0, rz: 0 },
    shotgun:  { x: 0.17, y: -0.21, z: -0.46, sway: 1.1, lag: 1.25, run: 0.9, heavy: 1.25, rx: 0, ry: 0, rz: 0 },
    lmg:      { x: 0.18, y: -0.24, z: -0.47, sway: 1.35, lag: 1.6, run: 0.8, heavy: 1.6, rx: -0.03, ry: 0, rz: 0.03 },
    dmr:      { x: 0.17, y: -0.2, z: -0.46, sway: 0.75, lag: 0.8, run: 0.75, heavy: 1.1, rx: 0, ry: 0, rz: 0 },
    sniper:   { x: 0.17, y: -0.2, z: -0.46, sway: 0.6, lag: 0.7, run: 0.7, heavy: 1.2, rx: 0, ry: 0, rz: 0 },
    knife:    { x: 0.2, y: -0.22, z: -0.42, sway: 1.3, lag: 1.2, run: 1.2, heavy: 0.6, rx: -0.25, ry: -0.2, rz: 0.45 },
    spear:    { x: 0.2, y: -0.24, z: -0.2, sway: 1.2, lag: 1.4, run: 1, heavy: 1.3, rx: 0.05, ry: 0.05, rz: 0.1 },
    bow:      { x: 0.12, y: -0.12, z: -0.5, sway: 0.9, lag: 1, run: 0.9, heavy: 0.8, rx: 0, ry: 0, rz: -0.25 },
  };
  VR.DUEL_POSE = POSE;

  const DuelBody = {
    build(charId, tone, col, name) {
      const def = VR.CHARACTERS.find(c => c.id === charId) || VR.CHARACTERS[0];
      const rig = VR.buildCharacter(def);
      VR.toneCharacter(rig, tone);
      const g = new T.Group(); g.add(rig.root);
      const ring = new T.Mesh(new T.RingGeometry(0.45, 0.6, 24), new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.8, depthWrite: false }));
      ring.material.userData.own = true; ring.geometry.userData.own = true;
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; g.add(ring);
      if (name) g.add(nameTag(name, col));           // only a teammate gets a name tag (it shows through walls)
      return { g, rig, def, col, guns: {}, gun: null, gunId: null, pos: new T.Vector3(), target: null, yaw: 0, pitch: 0, low: false, slide: false, air: false, phase: 0, speed: 0, last: new T.Vector3() };
    },
    setGun(a, id) {
      if (a.gunId === id) return;
      if (a.gun) a.gun.visible = false;
      if (!a.guns[id]) {
        const m = id === 'sniper' ? VR.DuelWeapons.sniper(a.col) : VR.WeaponKit.model(id);
        m.scale.setScalar(id === 'sniper' ? 1.5 : id === 'spear' ? 1.0 : id === 'bow' ? 1.4 : 1.9);
        m.position.set(a.def.model.armR.pivot[0] * VR.CHARACTER_PX + 0.02, 1.02, -0.32);
        a.g.add(m); a.guns[id] = m;
      }
      a.gun = a.guns[id]; a.gun.visible = true; a.gunId = id;
    },
    /** walk / crouch / jump animation from where the body is now (same rig the runner uses) */
    animate(a, dt) {
      const moved = dt ? a.pos.distanceTo(a.last) / dt : 0; a.last.copy(a.pos);
      a.speed += (Math.min(9, moved) - a.speed) * Math.min(1, dt * 8 || 1);
      a.g.position.copy(a.pos); a.g.rotation.y = a.yaw;
      const r = a.rig, p = r.parts;
      a.phase += dt * (4 + a.speed * 1.4);
      const s = Math.sin(a.phase), run = Math.min(1, a.speed / 5);
      let legL = s * 0.9 * run, legR = -s * 0.9 * run, lean = -0.08 * run, iy = 0;
      if (a.low) { legL = -1.3; legR = -1.1; lean = a.slide ? -0.5 : 0.35; iy = -0.45; }
      else if (a.air) { legL = -0.9; legR = 0.5; }
      const k = Math.min(1, dt * 14 || 1);
      p.legL.rotation.x += (legL - p.legL.rotation.x) * k; p.legR.rotation.x += (legR - p.legR.rotation.x) * k;
      p.armL.rotation.x = -1.35 - a.pitch * 0.8; p.armR.rotation.x = -1.45 - a.pitch * 0.8;
      p.head.rotation.x = -a.pitch * 0.5;
      r.inner.rotation.x += (lean - r.inner.rotation.x) * k;
      r.inner.position.y += (iy - r.inner.position.y) * k;
      if (a.gun) { a.gun.rotation.x = a.pitch; a.gun.position.y = 1.02 + iy; }
    },
  };
  VR.DuelBody = DuelBody;

  /** a flying grenade tumbles; a landed one sits still and blinks faster and faster */
  function nadeSpin(n, dt) {
    if (!n.landed) { n.obj.rotation.x += dt * 9; n.obj.rotation.z += dt * 5; return; }
    const k = Math.min(1, n.landT || 0);
    n.obj.scale.setScalar(1.6 * (1 + 0.18 * Math.max(0, Math.sin((n.landT || 0) * (10 + 30 * k)))));
  }
  VR.nadeSpin = nadeSpin;
  function r2(v) { return Math.round(v * 100) / 100; }
  function r4(v) { return Math.round(v * 10000) / 10000; }
  function nameTag(name, col) {
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128;
    const c = cv.getContext('2d');
    c.font = '700 58px "Cairo", sans-serif';
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
  VR.Audio.define('revolver', ({ tone, noise }) => { noise(0.16, 0.45, 3200); tone(150, 0.16, 'sawtooth', 0.16, 60); });
  VR.Audio.define('rifle', ({ tone, noise }) => { noise(0.07, 0.3, 4600); tone(260, 0.06, 'square', 0.08, 120); });
  VR.Audio.define('dmr', ({ tone, noise }) => { noise(0.14, 0.4, 4200); tone(210, 0.14, 'sawtooth', 0.14, 70); });
  VR.Audio.define('lmg', ({ tone, noise }) => { noise(0.08, 0.32, 3000); tone(140, 0.07, 'square', 0.1, 70); });
  VR.Audio.define('knife', ({ tone, noise }) => { noise(0.09, 0.25, 6500); tone(1200, 0.05, 'triangle', 0.05, 500); });

  VR.DuelManager = DuelManager;
  VR.DUEL = D;
})();
