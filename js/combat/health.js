/* =====================================================================
 * HEALTH — hit points for the player and for enemies.
 *   const h = new VR.Health(100, { regenDelay: 4, regen: 14 });
 *   h.damage(25, source)   → amount taken (0 if already dead / invulnerable)
 *   h.heal(n) · h.reset() · h.update(dt) (regeneration)
 *   h.dead · h.frac · h.onChange(fn(hp, delta, source)) · h.onDeath(fn)
 * ===================================================================== */
(function () {
  class Health {
    constructor(max, { regenDelay = 0, regen = 0 } = {}) {
      this.max = max; this.hp = max;
      this.regenDelay = regenDelay; this.regen = regen;
      this.sinceHit = 99; this.invuln = 0;
      this.changeFns = []; this.deathFns = [];
    }
    get dead() { return this.hp <= 0; }
    get frac() { return this.hp / this.max; }
    damage(n, source = null) {
      if (this.dead || this.invuln > 0 || !(n > 0)) return 0;
      const took = Math.min(this.hp, n);
      this.hp -= took; this.sinceHit = 0;
      for (const f of this.changeFns) f(this.hp, -took, source);
      if (this.hp <= 0) for (const f of this.deathFns) f(source);
      return took;
    }
    heal(n) {
      if (this.dead || !(n > 0)) return 0;
      const got = Math.min(this.max - this.hp, n);
      if (got > 0) { this.hp += got; for (const f of this.changeFns) f(this.hp, got, null); }
      return got;
    }
    reset() { this.hp = this.max; this.sinceHit = 99; this.invuln = 0; for (const f of this.changeFns) f(this.hp, 0, null); }
    update(dt) {
      this.sinceHit += dt; this.invuln = Math.max(0, this.invuln - dt);
      if (this.regen && !this.dead && this.hp < this.max && this.sinceHit >= this.regenDelay) this.heal(this.regen * dt);
    }
    onChange(fn) { this.changeFns.push(fn); }
    onDeath(fn) { this.deathFns.push(fn); }
  }
  VR.Health = Health;
})();
