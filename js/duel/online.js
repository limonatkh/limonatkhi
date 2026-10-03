/* =====================================================================
 * ONLINE — who else is playing right now.
 * ---------------------------------------------------------------------
 * While "Online challenges" is on (Settings), the game keeps one quiet
 * connection to the public relay and:
 *   - announces itself every few seconds on  limonat/v1/lobby
 *     { t:'p', id, name, ch, st:'free'|'busy', why }
 *   - listens on its own inbox             limonat/v1/u/<id>
 * so a player at a 1v1 gate can see who is free and send them a duel
 * invite. Nothing else is shared: a random id per visit and the name.
 * ===================================================================== */
(function () {
  const BEAT = 4;            // s between presence beats
  const STALE = 12;          // s without a beat = gone

  class Online {
    constructor() {
      this.id = VR.Net.randomCode(10);
      this.client = null; this.connected = false; this.url = null;
      this.peers = new Map();            // id -> {id, name, ch, st, why, seen}
      this.handlers = [];
      this.status = { st: 'free', why: '' };
      this.name = ''; this.ch = 'hero';
      this.lastBeat = 0; this.enabled = false; this.trying = false;
    }
    onMessage(fn) { this.handlers.push(fn); }
    get lobbyTopic() { return VR.Net.PREFIX + 'lobby'; }
    inbox(id) { return VR.Net.PREFIX + 'u/' + id; }

    setEnabled(on) {
      if (on === this.enabled) return;
      this.enabled = on;
      if (on) this.connect(); else this.disconnect();
    }
    setProfile(name, ch) {
      const changed = name !== this.name || ch !== this.ch;
      this.name = name; this.ch = ch;
      if (changed) this.beat();
    }
    setStatus(st, why = '') {
      if (st === this.status.st && why === this.status.why) return;
      this.status = { st, why };
      this.beat();
    }

    async connect() {
      if (this.client || this.trying || typeof mqtt === 'undefined') return;
      this.trying = true;
      for (const url of VR.Net.relayList()) {
        if (!this.enabled) break;
        try { await this.open(url); this.url = url; break; }
        catch (e) { console.warn('[online] relay failed', url, e && e.message); this.drop(); }
      }
      this.trying = false;
      if (this.enabled && !this.client) setTimeout(() => this.enabled && this.connect(), 15000);
    }
    open(url) {
      return new Promise((resolve, reject) => {
        let done = false;
        const c = mqtt.connect(url, {
          clientId: 'limonat_o_' + this.id, clean: true, keepalive: 20, reconnectPeriod: 3000, connectTimeout: 7000,
          will: { topic: this.lobbyTopic, payload: JSON.stringify({ t: 'gone', id: this.id }), qos: 0, retain: false },
        });
        this.client = c;
        const timer = setTimeout(() => { if (!done) { done = true; reject(new Error('timeout')); } }, 8000);
        c.on('connect', () => {
          c.subscribe([this.lobbyTopic, this.inbox(this.id)], { qos: 0 }, (err) => {
            if (err) { if (!done) { done = true; clearTimeout(timer); reject(err); } return; }
            this.connected = true;
            this.beat(true);
            if (!done) { done = true; clearTimeout(timer); resolve(); }
          });
        });
        c.on('message', (topic, buf) => {
          let m; try { m = JSON.parse(buf.toString()); } catch (e) { return; }
          if (!m) return;
          if (topic === this.lobbyTopic) this.onLobby(m);
          else if (topic === this.inbox(this.id) && m.from && m.from !== this.id) {
            const p = this.peers.get(m.from); if (p) p.seen = performance.now();
            this.handlers.forEach(fn => { try { fn(m); } catch (e) { console.error(e); } });
          }
        });
        c.on('error', (e) => { if (!done) { done = true; clearTimeout(timer); reject(e); } });
        c.on('offline', () => { this.connected = false; });
        c.on('close', () => { this.connected = false; });
      });
    }
    drop() { const c = this.client; this.client = null; this.connected = false; if (c) { try { c.end(true); } catch (e) { /* closed */ } } }
    disconnect() {
      if (this.client && this.connected) { try { this.client.publish(this.lobbyTopic, JSON.stringify({ t: 'gone', id: this.id })); } catch (e) { /* closing */ } }
      const c = this.client; this.client = null; this.connected = false; this.peers.clear();
      if (c) { try { c.end(false); } catch (e) { /* closed */ } }
    }

    onLobby(m) {
      if (!m.id || m.id === this.id) return;
      if (m.t === 'gone') { this.peers.delete(m.id); return; }
      if (m.t !== 'p') return;
      const isNew = !this.peers.has(m.id);
      this.peers.set(m.id, { id: m.id, name: String(m.name || '').slice(0, 16), ch: m.ch, st: m.st === 'free' || m.st === 'wait' ? m.st : 'busy', why: String(m.why || ''), seen: performance.now() });
      if (isNew || m.ask) this.beat();      // let a newcomer see us without waiting for the next beat
    }
    beat(ask) {
      if (!this.client || !this.connected) return;
      this.lastBeat = performance.now();
      this.client.publish(this.lobbyTopic, JSON.stringify({ t: 'p', id: this.id, name: this.name, ch: this.ch, st: this.status.st, why: this.status.why, ask: !!ask }));
    }
    /** Send a private message to another player's inbox. */
    sendTo(id, msg) {
      if (!this.client || !this.connected) return false;
      msg.from = this.id;
      this.client.publish(this.inbox(id), JSON.stringify(msg), { qos: 0 });
      return true;
    }
    list() {
      const now = performance.now(), out = [];
      for (const p of this.peers.values()) if (now - p.seen < STALE * 1000) out.push(p);
      return out.sort((a, b) => (a.st === b.st ? a.name.localeCompare(b.name) : a.st === 'free' ? -1 : 1));
    }
    peer(id) { return this.peers.get(id) || null; }

    update(dt) {
      if (!this.connected) return;
      // wall-clock beats: a slow frame rate must not make you look offline
      const now = performance.now();
      if (now - (this.lastBeat || 0) >= BEAT * 1000) this.beat();
      for (const [id, p] of this.peers) if (now - p.seen > STALE * 2000) this.peers.delete(id);
    }
  }

  VR.Online = new Online();
  window.addEventListener('pagehide', () => VR.Online.disconnect());
})();
