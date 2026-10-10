/* =====================================================================
 * MINI NET — billiards / basketball against a friend, online.
 *
 * The invite is the 1v1's (js/duel/duel.js: the same list of players — the
 * friend in your challenge room and whoever is online — with a "billiards"
 * or "basketball" invite); once accepted both games open the same mini-game
 * and talk through one Session:
 *
 *   new Session(role, chan, did, oppName)   role 'h' (who invited) | 'g'
 *   send(d)          to the other player (the match link: a direct WebRTC
 *                    channel when it opens, the relay otherwise; reliable
 *                    and in order except 'st' / 'bs' / ping — js/duel/matchnet.js)
 *   on = fn(d)       what the mini-game gets
 *   update(dt)       ping every 2 s; nothing heard for 15 s → the other left
 *   close(sayBye)
 *
 * The inviter's game is the referee: billiards — it racks, judges every
 * shot and sends the result (both games roll the same shot, the guest snaps
 * to the referee's table when it stops); basketball — it runs the match and
 * sends it 20 times a second (the guest moves its own player at once and
 * sends where it is). See js/mini/billiards.js and js/mini/basketball.js.
 * ===================================================================== */
(function () {
  const LOST = 15;                   // s without a word from the other player = they left

  class Session {
    constructor(role, chan, did, oppName) {
      this.role = role; this.chan = chan; this.did = did; this.oppName = String(oppName || VR.t('ch.defaultName')).slice(0, 16);
      this.on = null; this.closed = false; this.left = false;
      this.lastHeard = performance.now(); this.pingT = 0; this.ping = null; this.queue = [];
      this.net = VR.MatchNet ? new VR.MatchNet(chan, role, (d) => this.deliver(d), { did }) : null;
    }
    get host() { return this.role === 'h'; }
    send(d) {
      if (this.closed) return;
      d.did = this.did;
      if (this.net) this.net.send(d); else this.chan.send(d);
    }
    receive(d) { if (this.net) this.net.receive(d); else this.deliver(d); }
    deliver(d) {
      if (this.closed) return;
      this.lastHeard = performance.now();
      if (d.k === 'ping') { this.send({ k: 'pong', ts: d.ts }); return; }
      if (d.k === 'pong') { if (typeof d.ts === 'number') { const rtt = Math.max(0, performance.now() - d.ts); this.ping = this.ping == null ? rtt : this.ping * 0.6 + rtt * 0.4; if (this.net) this.net.setRtt(this.ping); } return; }
      if (d.k === 'bye') { this.left = true; if (this.on) this.on(d); return; }
      if (this.on) this.on(d); else this.queue.push(d);            // (the world is still loading: keep it)
    }
    /** the mini-game is ready to listen: what came meanwhile first */
    listen(fn) { this.on = fn; const q = this.queue; this.queue = []; for (const d of q) fn(d); }
    update(dt) {
      if (this.closed) return;
      if (this.net) this.net.update(dt);
      this.pingT -= dt;
      if (this.pingT <= 0) { this.pingT = 2; this.send({ k: 'ping', ts: Math.round(performance.now()) }); }
      if (!this.left && performance.now() - this.lastHeard > LOST * 1000) { this.left = true; if (this.on) this.on({ k: 'bye', lost: true }); }
    }
    close(sayBye = true) {
      if (this.closed) return;
      if (sayBye && !this.left) this.send({ k: 'bye' });
      this.closed = true;
      if (this.net) setTimeout(() => this.net.close(), 300);
      if (VR.MiniNet.session === this) VR.MiniNet.session = null;
    }
  }

  VR.MiniNet = {
    Session, session: null,
    begin(s) { if (this.session && this.session !== s) this.session.close(true); this.session = s; },
    /** a message over the duel channel: is it for the mini-game match? */
    route(d) {
      const s = this.session;
      if (!s || s.closed || !d || d.did !== s.did) return false;
      s.receive(d);
      return true;
    },
  };
})();
