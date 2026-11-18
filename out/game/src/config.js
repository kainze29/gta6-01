// Solmar Bay configuration: city layout, tuning, story data.
// All names, places and characters are original inventions for this game.
var SB = window.SB || {};
window.SB = SB;

SB.CFG = {
  cityHalf: 190,          // playable half-size in world units (city spans -190..190)
  roadSpacing: 48,        // distance between road centre lines
  roadWidth: 12,
  blockSize: 36,
  gravity: 30,
  walkSpeed: 7,
  runSpeed: 11,
  carAccel: 26,
  carMaxSpeed: 46,
  carReverseMax: 14,
  carBrake: 55,
  carTurn: 2.1,
  playerHealthMax: 100,
  startCash: 500,
  startAmmo: 24,
  ammoMax: 120,
  saveKey: 'solmarBaySaveV1',
  dayLengthSec: 480,      // full in-game day
  dayStartHour: 9,
};

// Named districts of Solmar Bay (original names).
SB.DISTRICTS = [
  { name: 'Marina Row', x: -120, z: -120 },
  { name: 'Palm Heights', x: 120, z: -120 },
  { name: 'Old Docks', x: -120, z: 120 },
  { name: 'Sunset Strip', x: 120, z: 120 },
  { name: 'Downtown Solmar', x: 0, z: 0 },
];

// Story characters (original).
SB.CHARACTERS = {
  player: 'Rico Vega',
  fixer: 'Mara Quinn',
  rival: 'Dante Cross',
  cop: 'Chief Alana Reyes',
};

// Mission catalogue: id, title, briefing, reward, time limit (seconds, 0 = none).
SB.MISSION_DEFS = [
  {
    id: 'm1', title: 'JOB 1: THE FIRST DELIVERY',
    briefing: 'Mara needs a package taken from the Marina docks to the Sunset Strip cafe. Drive fast, stay clean.',
    reward: 800, timeLimit: 150,
  },
  {
    id: 'm2', title: 'JOB 2: HOT PURSUIT',
    briefing: 'Dante Cross stole Mara\u2019s car. Chase his orange coupe down and ram it until it stops. Watch the cops.',
    reward: 1500, timeLimit: 180,
  },
  {
    id: 'm3', title: 'JOB 3: HARBOR HEIST',
    briefing: 'Steal the black sedan parked at the Old Docks and bring it to the hideout in Palm Heights. The police will not like it.',
    reward: 2500, timeLimit: 210,
  },
];

// Car paint palette.
SB.CAR_COLORS = [0xd84315, 0x1565c0, 0xf9a825, 0x2e7d32, 0x6a1b9a, 0x00838f, 0xc0ca33, 0xad1457, 0x546e7a, 0xeceff1];
SB.PED_COLORS = [0xe53935, 0x1e88e5, 0x43a047, 0xfb8c00, 0x8e24aa, 0x00acc1, 0xfdd835, 0xec407a, 0x78909c, 0x5d4037];

// Road centre lines (grid): roads run along x = -144,-96,-48,0,48,96,144 and same for z.
SB.ROAD_LINES = [-144, -96, -48, 0, 48, 96, 144];
