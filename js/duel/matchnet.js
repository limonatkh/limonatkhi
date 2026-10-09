/* =====================================================================
 * MATCH NET — the link between the two players DURING a 1v1 / co-op match.
 *
 * Before v1.36 every match message went once through a public MQTT relay
 * (js/challenge/net.js, js/duel/online.js): a server far away, so even two
 * players on the same router had ~0.5 s ping, and a message the relay lost
 * (QoS 0) was simply gone — a hit, a death, the start of a round…
 *
 * Now, for the length of a match:
 *
 *  1. DIRECT CONNECTION (WebRTC data channel). The host offers, the guest
 *     answers; the offer / answer / network candidates travel over the
 *     relay. Players on the same network connect straight to each other
 *     (a few ms); across the internet the public STUN servers usually find
 *     a direct path too. If no direct path opens, the relay keeps carrying
 *     the match exactly as before (nothing is lost, only slower).
 *
 *  2. RELIABLE MESSAGES. Everything that matters (fire, hit, death, round
 *     start / end, match end, grenades…) gets a number, is acknowledged and
 *     resent until it arrives, and is handed to the game IN ORDER, once.
 *     Only the constant position updates (and ping) are fire-and-forget —
 *     an older position never overwrites a newer one.
 *
 *  new MatchNet(chan, role, deliver)   chan: the relay channel; deliver(d): a message for the game
 *  send(d)            ·  receive(d)    (from the relay; the direct channel calls it itself)
 *  update(dt)         resends, acks, the direct link's state
 *  via                'p2p' | 'relay'
 *  close()
 *
 *  ?p2p=0 keeps a match on the relay (tests / comparing).
 *  sim = { lat, jitter, drop }  (tests) delay / lose messages on the way out
 * ===================================================================== */
(function () {
  const UNRELIABLE = new Set(['st', 'ping', 'pong', 'wx', 'bs', 'ready']);
  const ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }];
  const P2P_WAIT = 10;           // s to wait for a direct path before giving up on it

  class MatchNet {
    constructor(chan, role, deliver, opts = {}) {
      this.chan = chan; this.role = role; this.deliver = deliver; this.did = opts.did || null;     // every message carries the match id
      this.seq = 0; this.out = new Map();             // my reliable messages not yet acknowledged
      this.got = 0; this.early = new Map();           // the other side's: delivered up to `got`; ones that came early
      this.useq = 0; this.lastU = {};                 // fire-and-forget order (per kind)
      this.ackDue = false; this.rtt = null;
      this.pc = null; this.dc = null; this.p2pT = 0; this.p2pState = 'off'; this.pendingIce = [];
      this.sim = null; this.stats = { sent: 0, resent: 0, dup: 0, viaP2p: 0, viaRelay: 0 };
      this.closed = false;
      const allowP2p = opts.p2p !== false && typeof RTCPeerConnection !== 'undefined' && !(typeof location !== 'undefined' && /[?&]p2p=0/.test(location.search));
      if (allowP2p) { this.p2pState = 'trying'; if (role === 'h') this.offer(); }
    }
    get via() { return this.dc && this.dc.readyState === 'open' ? 'p2p' : 'relay'; }

    // ------------------------------------------------------------ sending
    send(d) {
      if (this.closed) return;
      if (UNRELIABLE.has(d.k)) { d.u = ++this.useq; d.a = this.got; this.wire(d); return; }
      d.q = ++this.seq; d.a = this.got;
      this.out.set(d.q, { d, t: performance.now(), n: 1 });
      this.wire(d);
    }
    /** onto the wire: the direct channel when it is open, else the relay */
    wire(d) {
      if (this.did && !d.did) d.did = this.did;
      this.stats.sent++;
      const go = () => {
        if (this.closed) return;
        if (this.via === 'p2p') { try { this.dc.send(JSON.stringify(d)); this.stats.viaP2p++; return; } catch (e) { /* fall back */ } }
        this.chan.send(d); this.stats.viaRelay++;
      };
      const s = this.sim;
      if (s) {
        if (s.drop && Math.random() < s.drop) return;
        const lat = (s.lat || 0) + Math.random() * (s.jitter || 0);
        if (lat > 0) { setTimeout(go, lat); return; }
      }
      go();
    }

    // ------------------------------------------------------------ receiving
    /** a match message from either path. Returns nothing; good ones reach deliver(). */
    receive(d) {
      if (this.closed || !d) return;
      if (typeof d.a === 'number') this.acked(d.a);
      if (d.k === '_a') return;
      if (typeof d.q === 'number') {
        // reliable: in order, once
        this.ackDue = true;
        if (d.q <= this.got || this.early.has(d.q)) { this.stats.dup++; return; }
        this.early.set(d.q, d);
        while (this.early.has(this.got + 1)) {
          const n = this.early.get(this.got + 1); this.early.delete(this.got + 1); this.got++;
          if (n.k === '_rtc') this.onSignal(n);          // setting up the direct connection (in order: offer, answer, candidates)
          else this.deliver(n);
        }
        return;
      }
      if (typeof d.u === 'number') {
        // fire-and-forget: never older than what we already have (two paths can cross)
        if (d.u <= (this.lastU[d.k] || 0)) { this.stats.dup++; return; }
        this.lastU[d.k] = d.u;
      }
      this.deliver(d);
    }
    acked(a) { for (const q of this.out.keys()) if (q <= a) this.out.delete(q); }

    update(dt = 1 / 60) {
      if (this.closed) return;
      const now = performance.now();
      // resend what has not been acknowledged (a little after a round trip)
      const rto = Math.max(160, Math.min(1500, (this.rtt || 400) * 1.4 + 60));
      for (const o of this.out.values()) {
        if (now - o.t > rto * Math.min(4, o.n)) { o.t = now; o.n++; this.stats.resent++; o.d.a = this.got; this.wire(o.d); }
      }
      if (this.ackDue) { this.ackDue = false; this.wire({ k: '_a', a: this.got }); }
      // a direct path that never opened: stay on the relay
      if (this.p2pState === 'trying') {
        this.p2pT += dt;
        if (this.p2pT > P2P_WAIT && this.via !== 'p2p') this.p2pState = 'failed';
      }
    }
    setRtt(ms) { if (typeof ms === 'number' && isFinite(ms)) this.rtt = ms; }

    // ------------------------------------------------------------ the direct connection
    makePc() {
      const pc = new RTCPeerConnection({ iceServers: ICE });
      this.pc = pc;
      pc.onicecandidate = (e) => { if (e.candidate) this.send({ k: '_rtc', c: e.candidate.toJSON ? e.candidate.toJSON() : e.candidate }); };
      pc.onconnectionstatechange = () => {
        const st = pc.connectionState;
        if (st === 'failed' || st === 'closed') { if (this.p2pState !== 'off') this.p2pState = 'failed'; }
      };
      return pc;
    }
    useChannel(dc) {
      this.dc = dc;
      dc.onopen = () => { this.p2pState = 'open'; this.flushOut(); };
      dc.onclose = () => { if (this.p2pState === 'open') this.p2pState = 'lost'; };
      dc.onmessage = (e) => { let d; try { d = JSON.parse(e.data); } catch (err) { return; } this.receive(d); };
    }
    /** a new path: whatever is still waiting goes out on it at once */
    flushOut() { for (const o of this.out.values()) { o.t = performance.now(); o.d.a = this.got; this.wire(o.d); } }
    async offer() {
      try {
        const pc = this.makePc();
        this.useChannel(pc.createDataChannel('match', { ordered: false, maxRetransmits: 0 }));
        const off = await pc.createOffer();
        await pc.setLocalDescription(off);
        this.send({ k: '_rtc', sdp: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } });
      } catch (e) { console.warn('[matchnet] offer', e); this.p2pState = 'failed'; }
    }
    async onSignal(d) {
      if (this.p2pState === 'off' || this.closed) return;
      try {
        if (d.sdp) {
          if (d.sdp.type === 'offer') {
            if (this.pc) return;                               // (a resent offer)
            const pc = this.makePc();
            pc.ondatachannel = (e) => this.useChannel(e.channel);
            await pc.setRemoteDescription(d.sdp);
            const ans = await pc.createAnswer();
            await pc.setLocalDescription(ans);
            this.send({ k: '_rtc', sdp: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } });
          } else if (d.sdp.type === 'answer' && this.pc && !this.pc.currentRemoteDescription) {
            await this.pc.setRemoteDescription(d.sdp);
          }
          for (const c of this.pendingIce.splice(0)) { try { await this.pc.addIceCandidate(c); } catch (e) { /* stale */ } }
        } else if (d.c) {
          if (this.pc && this.pc.remoteDescription) { try { await this.pc.addIceCandidate(d.c); } catch (e) { /* stale */ } }
          else this.pendingIce.push(d.c);
        }
      } catch (e) { console.warn('[matchnet] signal', e); this.p2pState = 'failed'; }
    }

    close() {
      this.closed = true; this.out.clear(); this.early.clear();
      try { if (this.dc) this.dc.close(); } catch (e) { /* closed */ }
      try { if (this.pc) this.pc.close(); } catch (e) { /* closed */ }
      this.dc = null; this.pc = null;
    }
  }

  VR.MatchNet = MatchNet;
})();
