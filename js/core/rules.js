/* =====================================================================
 * RULES — when things are allowed. Kept apart from the systems that use
 * them, so a rule can be changed in one place.
 * ---------------------------------------------------------------------
 * RUNNER PORTAL (the way into the runner course, in the big square):
 *   unlockFlag       the portal works once this adventure flag is set
 *                    (the start area's first puzzle: the gate is open)
 *   cooldownSeconds  after every course run (finished or crashed) the
 *                    portal rests this long, in REAL time: closing the
 *                    game does not skip it
 *
 *   VR.Rules.portal.state(run) → { open, locked, wait }   (wait in seconds)
 *   VR.Rules.portal.used()     the course just ended: start the rest time
 * ===================================================================== */
(function () {
  const RULES = {
    runnerPortal: { unlockFlag: 'plaza_open', cooldownSeconds: 120 },
  };
  const now = () => Date.now();
  const save = () => VR.Profiles.player().progress;

  VR.Rules = {
    RULES,
    portal: {
      get cfg() { return RULES.runnerPortal; },
      /** run: the adventure area's run (for the unlock flag); null = flag not checked */
      state(run) {
        const locked = !!(run && !run.has(this.cfg.unlockFlag));
        const last = save().runnerPortalAt || 0;
        const wait = Math.max(0, this.cfg.cooldownSeconds - (now() - last) / 1000);
        return { open: !locked && wait <= 0, locked, wait };
      },
      used() { save().runnerPortalAt = now(); VR.Profiles.save(); },
    },
  };
})();
