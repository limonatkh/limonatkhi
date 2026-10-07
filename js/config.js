/* =====================================================================
 * CONFIG — every gameplay tuning number lives here.
 * Change speeds, difficulty curve, scoring and power-up timings without
 * touching any system code.
 * ===================================================================== */
window.VR = window.VR || {};

VR.CONFIG = {
  // ---------- Moving across the route (no lanes: see route.js) ----------
  DODGE_STEP: 2.6,            // metres one swipe moves you sideways (clamped to the route)
  DODGE_TIME: 0.14,           // seconds a swipe takes
  ROUTE_MARGIN: 0.45,         // your centre stays this far inside the edge of the walkable ground
  FOLLOW_SPEED: 7,            // m/s: how fast you flow with a route that narrows / bends / merges

  // ---------- Player physics ----------
  GRAVITY: 40,
  JUMP_VELOCITY: 13,          // apex ≈ v² / 2g ≈ 2.1 m
  FAST_FALL_VELOCITY: -24,    // swipe down while airborne
  SLIDE_TIME: 0.72,
  PLAYER_HALF_WIDTH: 0.38,
  PLAYER_HALF_DEPTH: 0.35,
  PLAYER_HEIGHT: 1.75,
  PLAYER_SLIDE_HEIGHT: 0.75,
  // stumbling: hitting a jump-over obstacle (or clipping one from the side) trips you;
  // you are VULNERABLE for this long, and another hit in that time ends the run
  VULNERABLE_TIME: 2.6,
  STUMBLE_SLOW: 0.62,         // speed factor right after tripping (recovers over STUMBLE_RECOVER)
  STUMBLE_RECOVER: 0.9,

  // ---------- Speed & difficulty ----------
  // speed = START + (MAX - START) * (1 - e^(-distance / RAMP))
  SPEED_START: 13,
  SPEED_MAX: 31,
  // the runner is a finite course (≈1.15 km, js/runner/course.js): the ramps are
  // short enough that the end of the course is clearly faster and harder
  SPEED_RAMP: 1500,
  // difficulty 0..1 used by the chunk generator
  DIFFICULTY_RAMP: 1800,

  // ---------- World generation ----------
  CHUNK_LENGTH: 40,
  CHUNKS_AHEAD: 6,            // draw distance, in chunks
  CHUNKS_BEHIND: 1,
  SAFE_START_CHUNKS: 2,       // first chunks have coins only
  BIOME_MIN_CHUNKS: 7,
  BIOME_MAX_CHUNKS: 12,
  RECENTER_DISTANCE: 600,     // world is shifted back to origin to keep float precision

  // ---------- Scoring ----------
  POINTS_PER_METRE: 1,
  COIN_POINTS: 10,
  GEM_POINTS: 50,
  POWERUP_POINTS: 100,
  // score multiplier rises with distance: x1, x2 at 500 m, x3 at 1500 m ...
  MULTIPLIER_STEPS: [0, 500, 1500, 3000, 5000, 8000],

  // ---------- Power-ups (seconds) ----------
  POWERUPS: {
    magnet:      { duration: 10, label: 'Magnet' },
    shield:      { duration: 25, label: 'Shield' },
    boost:       { duration: 5,  label: 'Boost', speedFactor: 1.55 },
    double:      { duration: 12, label: '2x Coins' },
    invincible:  { duration: 7,  label: 'Star' },
  },
  MAGNET_RADIUS: 6,

  // ---------- Mission gates (not on the course any more: missions are reached
  // through doors in the adventure world; kept for the return countdown) ----------
  MISSION_GATE_FIRST_CHUNK: 7,       // first gate ≈ 250 m into a run
  MISSION_GATE_GAP_MIN: 16,          // then one every 16-24 chunks (≈ 640-960 m)
  MISSION_GATE_GAP_MAX: 24,
  MISSION_RETURN_COUNTDOWN: 3,       // seconds of "3-2-1" before the run resumes
  MISSION_RETURN_STAR: 2.5,          // seconds of star power after returning

  // ---------- First-person mission movement ----------
  // From the movement spec. Its speeds are in Roblox-style units where a
  // character is ~5 units tall, so 1 unit = PLAYER_HEIGHT / 5 = 0.35 m.
  FP: {
    UNIT: 1.75 / 5,
    SPEED_UNITS: 17,             // spec: 15-20 units/s  → ≈ 6 m/s
    ACCEL_TIME: 0.2,             // spec: most of top speed within 0.15-0.3 s
    STOP_TIME: 0.12,             // keeps a little momentum when keys are released
    AIR_CONTROL: 0.28,           // limited steering in the air
    JUMP_HEIGHT_PH: 1.2,         // spec: 1-1.5 player heights
    AIR_TIME: 0.65,              // spec: 0.5-0.8 s
    SLIDE_TIME: 0.6,             // spec: 0.4-0.8 s
    SLIDE_BOOST: 1.15,           // slide starts slightly faster than the run…
    SLIDE_END_KEEP: 0.6,         // …and keeps 60% of it at the end (no sudden stop)
    CROUCH_SPEED: 0.5,
    SPRINT: 1.5,                 // Shift while moving forward (touch: stick pushed all the way)
    BURST_HEIGHT_X: 3.5,         // spec: 3-4× a normal jump
    BURST_ANGLE_STILL: 80,       // spec: 70-80° when used under the player
    BURST_ANGLE_MOVING: 70,      // pushes sideways when moving
    BURST_COOLDOWN: 3.2,         // spec: 2.5-4 s
    LADDER_SPEED: 4.2,
    HEIGHT: 1.75, CROUCH_HEIGHT: 0.95, RADIUS: 0.3,
    EYE: 1.55, CROUCH_EYE: 0.78,
    FOV: 95,                     // spec: 90-105°
    REACH: 2.7,                  // interaction distance (m)
    MOUSE_SENS: 0.0022,
  },

  // ---------- Camera ----------
  CAMERA_HEIGHT: 4.3,
  CAMERA_DISTANCE: 7.6,
  CAMERA_LOOK_AHEAD: 9,
  CAMERA_FOV: 62,
  CAMERA_SPEED_PULL: 0.06,    // extra distance per m/s above start speed (keeps the runner framed)
  CAMERA_SPEED_FOV: 7,        // extra degrees of FOV at top speed (sense of speed)
};
