/* =====================================================================
 * WALLET — the player's shared coins, the same in every mode (runner,
 * missions, duels and, later, the adventure world and the shop).
 * ---------------------------------------------------------------------
 *   const w = VR.Wallet.of();            // the active player's wallet
 *   w.coins                               // balance
 *   w.credit(amount, txId, source)        // add coins once per txId
 *   w.debit(amount, txId, reason)         // spend; false if not enough
 *   w.onChange(fn)                        // fn(coins, change)
 *
 * Every reward has a TRANSACTION ID (e.g. 'run:<id>:end:1',
 * 'mission:<runId>', 'duel:<matchId>'). A txId that was already applied
 * is ignored, so showing a result screen again, reloading or returning
 * to a world can never pay the same reward twice. Recent ids are kept
 * in the profile (wallet.ledger).
 *
 * The coin logic lives here, not in the runner: runs, missions and duels
 * only ask the wallet to credit or debit.
 * ===================================================================== */
(function () {
  const LEDGER_MAX = 400;
  const listeners = [];

  class Wallet {
    constructor(playerId) { this.playerId = playerId; }
    get data() { return VR.Profiles.player(this.playerId).wallet; }
    get coins() { return this.data.coins; }
    has(txId) { return !!txId && this.data.ledger.some(e => e.id === txId); }
    record(txId, amount, kind) {
      const l = this.data.ledger;
      l.push({ id: txId || VR.uid(), amount, kind, t: Date.now() });
      if (l.length > LEDGER_MAX) l.splice(0, l.length - LEDGER_MAX);
    }
    apply(delta, txId, kind) {
      const w = this.data;
      w.coins = Math.max(0, Math.floor(w.coins + delta));
      this.record(txId, delta, kind);
      VR.Profiles.save();
      for (const fn of listeners) { try { fn(w.coins, delta, this.playerId); } catch (e) { console.error(e); } }
      return true;
    }
    /** add coins; returns false (and changes nothing) if this txId was already paid */
    credit(amount, txId, source = '') {
      amount = Math.floor(amount);
      if (!(amount > 0) || this.has(txId)) return false;
      return this.apply(amount, txId, source || 'credit');
    }
    /** spend coins; returns false if the balance is too low or this txId was already spent */
    debit(amount, txId, reason = '') {
      amount = Math.floor(amount);
      if (!(amount > 0) || this.has(txId) || this.coins < amount) return false;
      return this.apply(-amount, txId, reason || 'debit');
    }
    canAfford(amount) { return this.coins >= amount; }
    onChange(fn) { listeners.push(fn); }
  }

  const cache = {};
  VR.Wallet = {
    /** the wallet of a player (default: the active one) */
    of(playerId) { const id = playerId || VR.Profiles.load().active; return cache[id] || (cache[id] = new Wallet(id)); },
    onChange(fn) { listeners.push(fn); },
  };
})();
