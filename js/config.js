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
    BURST_ANGLE_STILL: 90,       // straight up where you stand
    BURST_ANGLE_MOVING: 90,      // also when moving: no long jump forward
    BURST_COOLDOWN: 3.2,         // spec: 2.5-4 s
    LADDER_SPEED: 4.2,
    HEIGHT: 1.75, CROUCH_HEIGHT: 0.95, RADIUS: 0.3,
    EYE: 1.55, CROUCH_EYE: 0.78,
    FOV: 95,                     // spec: 90-105°
    REACH: 2.7,                  // interaction distance (m)
    MOUSE_SENS: 0.0022,
  },

  // ---------- Player movement (v1.47: js/missions/fpcontroller.js — the hub, the adventure, every fight) ----------
  // Every number of the movement lives here. Metres, seconds, m/s, m/s². The physics runs at a fixed
  // STEP (120 Hz), so jump heights, distances and speeds are the same at 30, 60 or 144 frames a second.
  // Values marked "Lemonat" are our own; RIVALS publishes no numbers (see the README: Movement).
  MOVE: {
    STEP: 1 / 120,
    // ground (Quake-style accelerate + friction: instant to start, a short skid to stop, no slow "walking sim")
    GROUND_ACCEL: 14,            // how fast you reach the wished speed (× wished speed per second)
    FRICTION: 9,                 // ground friction (per second)
    STOP_SPEED: 2.5,             // below this, friction works as if you went this fast (crisp stops)
    BACK_SPEED: 0.9,             // walking backwards: 90% (Lemonat)
    SIDE_SPEED: 0.95,            // strafing: 95% (guides: "slightly reduced, ~90-95%")
    // jump (height / time kept from v1.44: every jump the worlds were built around still works)
    COYOTE: 0.1,                 // you can still jump this long after walking off an edge
    JUMP_BUFFER: 0.12,           // a jump pressed this long before landing happens on landing
    FALL_GRAVITY: 1.0,           // gravity × this while falling (1 = the same arc up and down)
    VARIABLE_JUMP: false,        // let go of jump early → lower jump (off: a tapped Space is a full jump)
    JUMP_CUT: 0.6,
    // double jump (Lemonat: in RIVALS it comes with some items — here a rule of the movement profile)
    DOUBLE_JUMP_HEIGHT: 1.5,     // m above where you press it (it RESETS the rise, it does not add)
    DOUBLE_JUMP_STEER: 1.0,      // 1: the second jump turns your speed fully toward the keys you hold
    DOUBLE_JUMP_MIN_AIR: 0.06,   // not on the same press as the take-off
    GROUND_NEAR: 0.35,           // falling this close to the floor, a jump press waits for the landing (a hop) instead
    // air (Source-style air acceleration = air strafing; plus a little steering for keyboard players)
    AIR_ACCEL: 14,               // air strafing: speed is gained by turning while holding A / D
    AIR_WISH_CAP: 0.9,           // m/s: the classic "30 ups" cap that makes strafing gain speed
    AIR_TURN: 2.6,               // rad/s: the velocity turns toward the keys you hold (no speed change)
    AIR_PUSH: 9,                 // m/s²: pushed up toward walking speed when slower (a jump from standing)
    AIR_PUSH_FRAC: 0.8,
    AIR_BRAKE: 7,                // m/s²: holding the opposite key slows you in the air
    AIR_FRICTION: 0,
    // bunny hop: jump on the landing (buffered or held) → the ground friction never touches you
    BHOP_GRACE: 0.07,            // s on the ground with no friction (a hop pressed just after landing still counts)
    BHOP_RETENTION: 1.0,         // speed kept through a hop
    BHOP_CAP: 12.5,              // m/s: no movement makes you faster than this (launches by explosions can)
    AUTO_HOP: false,             // holding jump hops on every landing (off: time it yourself)
    // slide (crouch while running; "momentum carries you")
    SLIDE_MIN_SPEED: 3.3,        // m/s to start a slide (slower: you crouch instead)
    SLIDE_BOOST: 2.2,            // m/s added at the start…
    SLIDE_BOOST_COOLDOWN: 0.9,   // …only once in this long (no infinite slide-spam speed)
    SLIDE_MAX: 13,               // m/s
    SLIDE_FRICTION: 1.25,        // per second (exponential) …
    SLIDE_DECEL: 1.6,            // … plus m/s² (a slide always ends)
    SLIDE_END_SPEED: 3.6,        // below this the slide becomes a crouch (or you stand)
    SLIDE_MAX_TIME: 1.15,
    SLIDE_STEER: 1.8,            // rad/s
    SLIDE_SLOPE: 0.6,            // share of the height energy gained going down (lost going up)
    SLIDE_COOLDOWN: 0.3,
    SLIDE_CANCEL_AFTER: 0.15,    // letting go of crouch ends the slide after this (slide cancel)
    SLIDE_JUMP_BOOST: 0.6,       // m/s added to a jump out of a slide
    // crouch
    CROUCH_ACCEL: 12,
    // dash (Lemonat, optional: RIVALS has no basic dash — the scythe's dash is a weapon ability). Off by default.
    DASH: { ENABLED: false, SPEED: 26, TIME: 0.16, COOLDOWN: 2.0, EXIT: 1.15, AIR: 1 },
    // knockback / launches (explosions, the Lemon Burst): never slowed by the air rules, air control keeps working
    LAUNCH_KEEP: true,
    // camera (look only: the shot always leaves from the eye along the aim — no bob, no tilt in it)
    CAM_TILT: 0.022,             // rad of roll when strafing
    CAM_SLIDE_TILT: 0.05,
    CAM_BOB: 0.03, CAM_BOB_SIDE: 0.018,
    CAM_LAND: 0.035,             // landing dip per m/s of fall speed (capped)
    CAM_LAND_MAX: 1.2,
    CAM_SPEED_FOV: 6,            // extra degrees of FOV at bunny-hop speed
    // movement profiles: what each world allows (the island routes and the story worlds were built for one jump)
    PROFILES: {
      full: { doubleJump: true, bhopCap: 12.5 },
      parkour: { doubleJump: false, bhopCap: 9.4, classicAir: true },   // (classicAir: the v1.44 air steering every route jump was measured with)
    },
  },

  // ---------- Camera ----------
  CAMERA_HEIGHT: 4.3,
  CAMERA_DISTANCE: 7.6,
  CAMERA_LOOK_AHEAD: 9,
  CAMERA_FOV: 62,
  CAMERA_SPEED_PULL: 0.06,    // extra distance per m/s above start speed (keeps the runner framed)
  CAMERA_SPEED_FOV: 7,        // extra degrees of FOV at top speed (sense of speed)
};
// (testing the optional dash: ?dash=1 turns it on for this visit)
try { if (/[?&]dash=1\b/.test(location.search)) VR.CONFIG.MOVE.DASH.ENABLED = true; } catch (e) { /* no location */ }
