// Solmar Bay: boot, main loop, camera, input, driving and on-foot play,
// combat, saving, pause and game-over screens, shot setups and self-tests.
// All names, places and characters are original inventions for this game.
(function () {
  'use strict';
  var SB = window.SB || {};
  window.SB = SB;

  // Camera distances the C key (and the mouse wheel) cycle through.
  var CAM_DISTANCES = [10, 14, 19];
  // Pistol magazine size; reloads top the magazine back up from the reserve.
  var MAG_SIZE = 24;
  // How far a shot reaches, and how much harm it does to a pedestrian.
  var SHOT_RANGE = 42;
  var SHOT_DAMAGE = 34;
  // Punch reach and harm.
  var PUNCH_RANGE = 2.6;
  var PUNCH_DAMAGE = 15;
  // Steal distance for a parked car.
  var STEAL_RANGE = 4.5;
  // Autosave cadence while playing.
  var AUTOSAVE_SECONDS = 60;
  // Where a fresh game (and a busted or hurt Rico) starts out.
  var HOME_POS = { x: 0, z: 24 };

  SB.Game = {
    renderer: null,
    scene: null,
    camera: null,
    mode: 'title', // title | playing | paused | busted | wasted
    errors: 0,
    keys: {},
    camYaw: 0,
    camPitch: 0.34,
    camDistIndex: 1,
    dayTime: 0, // seconds since 09:00; a full day is SB.CFG.dayLengthSec
    autosaveIn: AUTOSAVE_SECONDS,
    trafficHitCooldown: 0,
    tracers: [],
    dragging: false,
    dragMoved: 0,
    lastX: 0,
    lastY: 0,
    autoDrive: false,
    shotMode: null,
    testMode: null,
    clock: null,

    // ------------------------------------------------------------ boot
    init: function () {
      var self = this;
      window.addEventListener('error', function () {
        self.errors += 1;
        self.refreshDebug();
      });
      var params = new URLSearchParams(window.location.search);
      this.shotMode = params.get('shot');
      this.testMode = params.get('test');

      this.renderer = new THREE.WebGLRenderer({ antialias: true });
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      document.getElementById('game-container').appendChild(this.renderer.domElement);

      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0x8fc3e8);
      this.scene.fog = new THREE.Fog(0x9cc3de, 160, 460);
      this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);

      var hemi = new THREE.HemisphereLight(0xcfe8ff, 0x3d5a3a, 0.9);
      this.scene.add(hemi);
      var sun = new THREE.DirectionalLight(0xfff2cc, 1.1);
      sun.position.set(120, 180, 60);
      this.scene.add(sun);

      SB.City.build(this.scene);
      SB.Traffic.init(this.scene, 14);
      SB.ParkedCars.init(this.scene);
      SB.Pedestrians.init(this.scene, 26);
      SB.Player.init(this.scene);
      SB.Missions.init(this.scene);
      SB.Police.init(this.scene);
      SB.HUD.init();

      SB.Player.x = HOME_POS.x;
      SB.Player.z = HOME_POS.z;
      SB.Player.heading = 0;
      SB.Player.syncMesh();
      this.camYaw = 0;

      this.bindInput();
      this.bindButtons();
      window.addEventListener('resize', function () { self.onResize(); });

      if (this.testMode) {
        this.beginPlay(false);
        this.runTests(this.testMode);
      } else if (this.shotMode) {
        this.beginPlay(false);
        this.applyShot(this.shotMode);
      }

      this.clock = new THREE.Clock();
      this.refreshDebug();
      var loop = function () {
        requestAnimationFrame(loop);
        self.frame();
      };
      loop();
    },

    onResize: function () {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    },

    refreshDebug: function () {
      var state = 'errors=' + this.errors + ' mode=' + this.mode +
        ' wanted=' + SB.Police.wanted + ' cash=' + SB.Player.cash;
      SB.HUD.setDebug(state);
    },

    // ------------------------------------------------------------ screens
    bindButtons: function () {
      var self = this;
      var on = function (id, fn) {
        var b = document.getElementById(id);
        if (b) b.addEventListener('click', fn);
      };
      on('startBtn', function () { self.beginPlay(false); });
      on('loadBtn', function () { self.beginPlay(true); });
      on('resumeBtn', function () { self.resume(); });
      on('saveBtn', function () { self.saveGame(false); });
      on('restartBtn', function () { window.location.reload(); });
      on('quitBtn', function () { window.location.reload(); });
      on('bustedBtn', function () { self.backOnStreets(200); });
      on('wastedBtn', function () { self.backOnStreets(100); });
    },

    showOnly: function (id) {
      ['startScreen', 'pauseScreen', 'bustedScreen', 'wastedScreen'].forEach(function (s) {
        document.getElementById(s).classList.toggle('hidden', s !== id);
      });
      if (!id) {
        ['startScreen', 'pauseScreen', 'bustedScreen', 'wastedScreen'].forEach(function (s) {
          document.getElementById(s).classList.add('hidden');
        });
      }
    },

    // Leave the title screen and start (or continue) the game.
    beginPlay: function (fromSave) {
      SB.Audio.init();
      SB.Audio.startMusic();
      document.getElementById('hud').classList.add('on');
      this.showOnly(null);
      this.mode = 'playing';
      if (fromSave) this.loadGame(true);
      SB.HUD.toast('SOLMAR BAY', 'Mara has work for you. Press M to start the first job.');
      this.refreshDebug();
    },

    pause: function () {
      if (this.mode !== 'playing') return;
      this.mode = 'paused';
      SB.Audio.setEngine(0, false);
      SB.Audio.setSiren(false);
      this.showOnly('pauseScreen');
      this.refreshDebug();
    },

    resume: function () {
      if (this.mode !== 'paused') return;
      this.mode = 'playing';
      this.showOnly(null);
      this.refreshDebug();
    },

    backOnStreets: function (fine) {
      SB.Player.cash = Math.max(0, SB.Player.cash - fine);
      SB.Player.health = SB.CFG.playerHealthMax;
      SB.Player.x = HOME_POS.x;
      SB.Player.z = HOME_POS.z;
      SB.Player.heading = 0;
      SB.Player.syncMesh();
      SB.Police.clear();
      this.mode = 'playing';
      this.showOnly(null);
      SB.HUD.toast('BACK ON THE STREETS', 'Solmar Bay is still yours. Stay sharp.');
      this.refreshDebug();
    },

    // ------------------------------------------------------------ input
    bindInput: function () {
      var self = this;
      var keys = this.keys;
      window.addEventListener('keydown', function (e) {
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].indexOf(e.code) >= 0) e.preventDefault();
        if (e.repeat) return;
        keys[e.code] = true;
        if (e.code === 'KeyP' || e.code === 'Escape') {
          if (self.mode === 'playing') self.pause();
          else if (self.mode === 'paused') self.resume();
          return;
        }
        if (self.mode !== 'playing') return;
        if (e.code === 'KeyE') self.toggleCar();
        if (e.code === 'KeyF') self.punch();
        if (e.code === 'KeyR') self.reload();
        if (e.code === 'KeyM') self.startJob();
        if (e.code === 'KeyH') self.honk();
        if (e.code === 'KeyC') self.cycleCamera();
      });
      window.addEventListener('keyup', function (e) { keys[e.code] = false; });
      window.addEventListener('blur', function () {
        Object.keys(keys).forEach(function (k) { keys[k] = false; });
      });

      var canvas = this.renderer.domElement;
      canvas.addEventListener('pointerdown', function (e) {
        self.dragging = true;
        self.dragMoved = 0;
        self.lastX = e.clientX;
        self.lastY = e.clientY;
      });
      window.addEventListener('pointermove', function (e) {
        if (!self.dragging) return;
        var dx = e.clientX - self.lastX;
        var dy = e.clientY - self.lastY;
        self.lastX = e.clientX;
        self.lastY = e.clientY;
        self.dragMoved += Math.abs(dx) + Math.abs(dy);
        self.camYaw -= dx * 0.005;
        self.camPitch = SB.clamp(self.camPitch + dy * 0.003, 0.12, 0.9);
      });
      window.addEventListener('pointerup', function () {
        if (self.dragging && self.dragMoved < 6 && self.mode === 'playing' && !SB.Player.inCar) {
          self.shoot();
        }
        self.dragging = false;
      });
      canvas.addEventListener('wheel', function (e) {
        e.preventDefault();
        self.cycleCamera(e.deltaY > 0 ? 1 : -1);
      }, { passive: false });
    },

    // The shared movement keys, read the same way on foot and in a car.
    moveInput: function () {
      var k = this.keys;
      return {
        up: !!(k.KeyW || k.ArrowUp),
        down: !!(k.KeyS || k.ArrowDown),
        left: !!(k.KeyA || k.ArrowLeft),
        right: !!(k.KeyD || k.ArrowRight),
        run: !!(k.ShiftLeft || k.ShiftRight),
        brake: !!k.Space,
      };
    },

    cycleCamera: function (dir) {
      var n = CAM_DISTANCES.length;
      this.camDistIndex = (this.camDistIndex + (dir || 1) + n) % n;
    },

    // ------------------------------------------------------------ frame
    frame: function () {
      var dt = Math.min(this.clock.getDelta(), 0.05);
      if (this.mode === 'playing') this.update(dt);
      else if (this.mode === 'title') this.orbitTitle(dt);
      this.updateCamera(dt);
      this.updateTracers(dt);
      this.renderer.render(this.scene, this.camera);
    },

    update: function (dt) {
      var p = SB.Player;
      var input = this.moveInput();
      if (this.autoDrive) input.up = true;

      // Clock: a full in-game day lasts SB.CFG.dayLengthSec of real time.
      this.dayTime = (this.dayTime + dt) % SB.CFG.dayLengthSec;

      if (p.inCar) {
        var car = p.inCar;
        car.drive(input, dt);
        if (this.trafficHitCooldown > 0) this.trafficHitCooldown -= dt;
        if (Math.abs(car.speed) > 6 && this.trafficHitCooldown <= 0) {
          // Bumping traffic at speed is a crime the patrols notice.
          // One hit per second at most: a scrape is one offence, not fifty.
          var self = this;
          SB.Traffic.cars.forEach(function (t) {
            if (t !== car && !t.dead && SB.dist2d(car.x, car.z, t.x, t.z) < 3.4) {
              t.damage(20);
              car.damage(4);
              SB.Audio.crash();
              SB.Police.crime('ram');
              self.trafficHitCooldown = 1.0;
            }
          });
        }
        p.x = car.x;
        p.z = car.z;
        p.heading = car.heading;
        if (car.dead) this.onCarWrecked();
      } else {
        p.move(input, this.camYaw, dt);
      }

      SB.Traffic.update(dt, p.inCar);
      SB.Pedestrians.update(dt, { x: p.x, z: p.z }, SB.Police.wanted);
      SB.Police.update(dt, { x: p.x, z: p.z }, !!p.inCar, p.inCar);
      SB.Missions.update(dt, { x: p.x, z: p.z }, !!p.inCar, p.inCar);
      SB.City.update(this.dayTime);
      this.checkWasted();

      // Engine hum follows the car; the siren follows the patrols.
      SB.Audio.setEngine(p.inCar ? Math.abs(p.inCar.speed) / SB.CFG.carMaxSpeed : 0, !!p.inCar);

      // Contextual hint: a stealable car in reach.
      if (!p.inCar && this.nearestStealable()) {
        SB.HUD.showPrompt('Press E to steal this car');
      } else {
        SB.HUD.hidePrompt();
      }

      // Autosave once a minute.
      this.autosaveIn -= dt;
      if (this.autosaveIn <= 0) {
        this.autosaveIn = AUTOSAVE_SECONDS;
        this.saveGame(true);
      }

      var hour = (SB.CFG.dayStartHour + this.dayTime / SB.CFG.dayLengthSec * 24) % 24;
      SB.HUD.update({ hour: hour, district: this.districtName() });
      this.refreshDebug();
    },

    // Slow orbit around the city while the title screen is up.
    orbitTitle: function (dt) {
      this.camYaw += dt * 0.05;
      var cx = Math.sin(this.camYaw) * 130;
      var cz = Math.cos(this.camYaw) * 130;
      this.camera.position.set(cx, 62, cz);
      this.camera.lookAt(0, 8, 0);
    },

    updateCamera: function (dt) {
      if (this.mode === 'title') return;
      var p = SB.Player;
      var dist = CAM_DISTANCES[this.camDistIndex];
      var target = { x: p.x, z: p.z };
      if (p.inCar) {
        // Chase camera: ease the yaw around behind the car.
        this.camYaw = SB.angleLerp(this.camYaw, p.inCar.heading + Math.PI, SB.clamp(dt * 3, 0, 1));
      }
      var cx = target.x + Math.sin(this.camYaw) * dist;
      var cz = target.z + Math.cos(this.camYaw) * dist;
      var cy = 4 + dist * this.camPitch;
      var want = new THREE.Vector3(cx, cy, cz);
      this.camera.position.lerp(want, SB.clamp(dt * 6, 0, 1));
      this.camera.lookAt(target.x, 2, target.z);
    },

    districtName: function () {
      var p = SB.Player;
      var best = 'Downtown Solmar', bd = 1e9;
      SB.DISTRICTS.forEach(function (d) {
        var dist = SB.dist2d(p.x, p.z, d.x, d.z);
        if (dist < bd) { bd = dist; best = d.name; }
      });
      return best;
    },

    // ------------------------------------------------------------ cars
    // The closest car Rico can steal: a parked car, or the mission 3 sedan.
    nearestStealable: function () {
      var p = SB.Player;
      var car = SB.ParkedCars.nearest(p.x, p.z, STEAL_RANGE);
      var steal = SB.Missions.stealCar;
      if (steal && !steal.dead) {
        var d = SB.dist2d(p.x, p.z, steal.x, steal.z);
        if (d < STEAL_RANGE && (!car || d < SB.dist2d(p.x, p.z, car.x, car.z))) car = steal;
      }
      return car;
    },

    toggleCar: function () {
      var p = SB.Player;
      if (p.inCar) this.exitCar();
      else this.enterCar();
    },

    // Climb into a parked car. Taking one that is not yours is a crime.
    enterCar: function () {
      var p = SB.Player;
      var car = this.nearestStealable();
      if (!car || p.inCar) return false;
      p.inCar = car;
      car.isPlayerCar = true;
      car.parked = false;
      p.mesh.visible = false;
      p.x = car.x;
      p.z = car.z;
      p.heading = car.heading;
      SB.Police.crime('steal');
      SB.Audio.horn();
      SB.HUD.toast('CAR STOLEN', 'The patrols saw that. Drive!');
      return true;
    },

    exitCar: function () {
      var p = SB.Player;
      var car = p.inCar;
      if (!car) return false;
      var side = car.heading + Math.PI / 2;
      p.x = car.x + Math.sin(side) * 2.6;
      p.z = car.z + Math.cos(side) * 2.6;
      p.heading = car.heading;
      p.inCar = null;
      car.isPlayerCar = false;
      p.mesh.visible = true;
      p.syncMesh();
      return true;
    },

    honk: function () {
      if (SB.Player.inCar) SB.Audio.horn();
    },

    // ------------------------------------------------------------ combat
    shoot: function () {
      var p = SB.Player;
      if (p.inCar || p.shootCooldown > 0) return false;
      if (p.ammo <= 0) {
        SB.HUD.toast('OUT OF AMMO', 'Press R to reload');
        SB.Audio.fail();
        return false;
      }
      p.ammo -= 1;
      p.shootCooldown = 0.28;
      var ox = p.x, oz = p.z, oy = 1.4;
      var fx = Math.sin(p.heading), fz = Math.cos(p.heading);
      var endX = ox + fx * SHOT_RANGE, endZ = oz + fz * SHOT_RANGE;
      var hit = SB.Pedestrians.nearestInFront(ox, oz, p.heading, SHOT_RANGE, 0.35);
      if (hit) {
        hit.health -= SHOT_DAMAGE;
        hit.panic = 3;
        endX = hit.x;
        endZ = hit.z;
        SB.HUD.toast('HIT', 'A pedestrian goes down. The patrols are coming.');
      }
      this.addTracer(ox, oy, oz, endX, oy, endZ);
      SB.Audio.shoot();
      SB.Police.crime('shoot');
      return true;
    },

    punch: function () {
      var p = SB.Player;
      if (p.inCar || p.punchCooldown > 0) return false;
      p.punchCooldown = 0.45;
      var hit = SB.Pedestrians.nearestInFront(p.x, p.z, p.heading, PUNCH_RANGE, 0.9);
      if (hit) {
        hit.health -= PUNCH_DAMAGE;
        hit.panic = 3;
        SB.Police.crime('punch');
        SB.HUD.toast('PUNCH', 'They will think twice next time.');
      }
      SB.Audio.punch();
      return true;
    },

    reload: function () {
      var p = SB.Player;
      if (p.ammo >= MAG_SIZE || p.ammoReserve <= 0) return false;
      var need = MAG_SIZE - p.ammo;
      var take = Math.min(need, p.ammoReserve);
      p.ammo += take;
      p.ammoReserve -= take;
      SB.Audio.reload();
      return true;
    },

    addTracer: function (x1, y1, z1, x2, y2, z2) {
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute([x1, y1, z1, x2, y2, z2], 3));
      var line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe082, transparent: true, opacity: 0.95 }));
      this.scene.add(line);
      this.tracers.push({ line: line, life: 0.16 });
    },

    updateTracers: function (dt) {
      for (var i = this.tracers.length - 1; i >= 0; i--) {
        var t = this.tracers[i];
        t.life -= dt;
        if (t.life <= 0) {
          this.scene.remove(t.line);
          t.line.geometry.dispose();
          t.line.material.dispose();
          this.tracers.splice(i, 1);
        } else {
          t.line.material.opacity = t.life / 0.16;
        }
      }
    },

    startJob: function () {
      if (SB.Missions.active) {
        SB.HUD.toast('JOB ALREADY RUNNING', 'Finish it first, or wait for it to fail.');
        return;
      }
      SB.Missions.startNext();
    },

    // ------------------------------------------------------------ damage
    damageFlash: function () {
      SB.HUD.flashDamage();
    },

    // A patrol ram (or a hard crash) wrecked the player's car.
    onCarWrecked: function () {
      var p = SB.Player;
      var car = p.inCar;
      if (!car || !car.dead) return;
      p.inCar = null;
      car.isPlayerCar = false;
      p.x = car.x + 3;
      p.z = car.z + 3;
      p.mesh.visible = true;
      p.syncMesh();
      p.takeDamage(15);
      SB.Audio.crash();
      this.damageFlash();
      SB.HUD.toast('CAR WRECKED', 'That car is done. Find another one.');
    },

    // The patrols caught Rico on foot.
    onBusted: function () {
      if (this.mode !== 'playing') return;
      if (SB.Player.inCar) this.exitCar();
      SB.Police.clear();
      this.mode = 'busted';
      SB.Audio.setEngine(0, false);
      SB.Audio.fail();
      this.showOnly('bustedScreen');
      this.refreshDebug();
    },

    // Called by the frame loop when Rico's health hits zero.
    checkWasted: function () {
      if (SB.Player.health <= 0 && this.mode === 'playing') {
        this.mode = 'wasted';
        SB.Audio.setEngine(0, false);
        SB.Audio.fail();
        this.showOnly('wastedScreen');
        this.refreshDebug();
      }
    },

    // ------------------------------------------------------------ save
    saveGame: function (silent) {
      var p = SB.Player;
      var data = {
        cash: Math.round(p.cash),
        health: Math.round(p.health),
        ammo: p.ammo,
        ammoReserve: p.ammoReserve,
        x: Math.round(p.x * 10) / 10,
        z: Math.round(p.z * 10) / 10,
        heading: p.heading,
        missionIndex: SB.Missions.index,
        dayTime: Math.round(this.dayTime),
      };
      try {
        window.localStorage.setItem(SB.CFG.saveKey, JSON.stringify(data));
        if (!silent) SB.HUD.toast('GAME SAVED', 'Progress stored on this machine.');
        return true;
      } catch (err) {
        if (!silent) SB.HUD.toast('SAVE FAILED', 'This browser would not store the save.');
        return false;
      }
    },

    loadGame: function (silent) {
      var raw = null;
      try { raw = window.localStorage.getItem(SB.CFG.saveKey); } catch (err) { raw = null; }
      if (!raw) {
        if (!silent) SB.HUD.toast('NO SAVE FOUND', 'Start the story to make one.');
        return false;
      }
      var data;
      try { data = JSON.parse(raw); } catch (err) { return false; }
      var p = SB.Player;
      if (p.inCar) this.exitCar();
      SB.Missions.abort();
      p.cash = data.cash;
      p.health = data.health;
      p.ammo = data.ammo;
      p.ammoReserve = data.ammoReserve;
      p.x = data.x;
      p.z = data.z;
      p.heading = data.heading || 0;
      p.syncMesh();
      SB.Missions.index = data.missionIndex || 0;
      this.dayTime = data.dayTime || 0;
      if (!silent) SB.HUD.toast('SAVE LOADED', 'Welcome back to Solmar Bay.');
      return true;
    },

    // ------------------------------------------------------------ shots
    // Put the player in a car at a chosen spot, already rolling, for a shot.
    putPlayerInCar: function (car, x, z, heading, speed) {
      var p = SB.Player;
      car.setPos(x, z, heading);
      car.speed = speed || 0;
      car.parked = false;
      car.isPlayerCar = true;
      p.inCar = car;
      p.mesh.visible = false;
      p.x = x;
      p.z = z;
      p.heading = heading;
      this.camYaw = heading + Math.PI;
    },

    applyShot: function (name) {
      var p = SB.Player;
      // Shots use the close camera so the car reads large in frame.
      if (name !== 'foot') this.camDistIndex = 0;
      if (name === 'drive') {
        // Roll east along the Marina road, already at speed.
        var car = SB.ParkedCars.cars[0];
        this.putPlayerInCar(car, 6, -48, Math.PI / 2, 28);
        this.autoDrive = true;
      } else if (name === 'foot') {
        // On foot beside the red-orange parked car, facing it.
        p.x = 8; p.z = -45;
        p.heading = Math.atan2(6 - 8, -48 - (-45));
        p.syncMesh();
        this.camYaw = p.heading + Math.PI;
      } else if (name === 'chase') {
        // East along the Old Docks road at speed, three stars, patrols closing in.
        var chaseCar = SB.ParkedCars.cars[3];
        chaseCar.health = 100;
        this.putPlayerInCar(chaseCar, 0, 48, Math.PI / 2, 30);
        this.autoDrive = true;
        SB.Police.setWanted(3);
        SB.Police.update(0.1, { x: p.x, z: p.z }, true, chaseCar);
        // Flank the player in the same road so the patrol cars are in frame:
        // two alongside in the next lanes, one closing from behind.
        var cops = SB.Police.cops;
        var spots = [[14, 44], [12, 52], [-16, 44]];
        cops.forEach(function (cop, i) {
          var s = spots[i % spots.length];
          cop.setPos(p.x + s[0], s[1], Math.PI / 2);
          cop.speed = 28;
        });
      } else if (name === 'mission') {
        SB.Missions.startNext();
        var m = SB.Missions.active;
        if (m) {
          m.stage = 1;
          m.timer = 143;
          m.stageText = 'Package picked up. Deliver it to the Sunset Strip cafe (south-east)';
          SB.Missions.updateMarker();
        }
        var mCar = SB.ParkedCars.cars[4];
        this.putPlayerInCar(mCar, 102, 42, Math.atan2(144 - 102, 120 - 42), 0);
      }
      SB.HUD.update({ hour: SB.CFG.dayStartHour, district: this.districtName() });
    },

    // ------------------------------------------------------------ tests
    // Headless self-tests (?test=<name>). Results go to #testResult.
    runTests: function (name) {
      var checks = [];
      var check = function (label, ok) { checks.push({ label: label, pass: !!ok }); };
      var p = SB.Player;

      var reset = function () {
        SB.Police.clear();
        SB.Missions.abort();
        SB.Missions.index = 0;
        p.cash = SB.CFG.startCash;
        p.health = SB.CFG.playerHealthMax;
        p.ammo = SB.CFG.startAmmo;
        p.ammoReserve = 96;
        if (p.inCar) { p.inCar.isPlayerCar = false; p.inCar = null; p.mesh.visible = true; }
      };

      if (name === 'enterCar') {
        reset();
        p.x = 6; p.z = -44; p.heading = Math.PI; p.syncMesh();
        check('near parked car found', !!SB.ParkedCars.nearest(p.x, p.z, 6));
        check('enter car', this.enterCar() && !!p.inCar);
        check('wanted rose after steal', SB.Police.wanted >= 1);
        check('exit car', this.exitCar() && !p.inCar);
      } else if (name === 'mission') {
        reset();
        check('mission starts', SB.Missions.startNext() === true);
        check('mission active', !!SB.Missions.active);
        check('marker visible', !!SB.Missions.marker.visible);
        p.x = -144; p.z = -120; p.syncMesh();
        SB.Missions.update(0.1, { x: -144, z: -120 }, false, null);
        check('pickup stage advances', SB.Missions.active && SB.Missions.active.stage === 1);
        p.x = 144; p.z = 120; p.syncMesh();
        SB.Missions.update(0.1, { x: 144, z: 120 }, false, null);
        check('mission completes', !SB.Missions.active && SB.Missions.index === 1);
        check('reward paid', p.cash === SB.CFG.startCash + 800);
      } else if (name === 'save') {
        reset();
        p.cash = 1234;
        this.saveGame(true);
        var stored = null;
        try { stored = JSON.parse(window.localStorage.getItem(SB.CFG.saveKey)); } catch (err) { stored = null; }
        check('save writes', !!stored && stored.cash === 1234);
        p.cash = 0;
        this.loadGame(true);
        check('load restores', p.cash === 1234);
      } else if (name === 'shoot') {
        reset();
        p.ammo = SB.CFG.startAmmo;
        var before = p.ammo;
        this.shoot();
        check('shoot spends ammo', p.ammo === before - 1);
        check('shoot raises wanted', SB.Police.wanted >= 1);
      } else if (name === 'police') {
        reset();
        SB.Police.setWanted(3);
        check('wanted set', SB.Police.wanted === 3);
        SB.Police.update(0.1, { x: p.x, z: p.z }, false, null);
        check('cops spawn', SB.Police.cops.length > 0);
        for (var i = 0; i < 10; i++) SB.Police.update(0.1, { x: p.x, z: p.z }, false, null);
        check('cops present after update', SB.Police.cops.length === 3);
        SB.Police.setWanted(1);
        // Keep the player hopping between far corners so no patrol can
        // reach them while the clock runs: this step tests decay, not busts.
        for (var j = 0; j < 60; j++) {
          p.x = (j % 2 === 0) ? -170 : 170;
          p.z = (j % 3 === 0) ? -170 : 170;
          SB.Police.update(0.5, { x: p.x, z: p.z }, false, null);
        }
        check('wanted decays', SB.Police.wanted === 0);
        SB.Police.clear();
        check('cops clear', SB.Police.cops.length === 0 && SB.Police.wanted === 0);
      } else {
        check('unknown test', false);
      }

      // Leave the world quiet so no patrol spawned by a test can bust the
      // player while the harness reads the result.
      SB.Police.clear();

      var passed = checks.filter(function (c) { return c.pass; }).length;
      var lines = checks.map(function (c) { return (c.pass ? 'PASS ' : 'FAIL ') + c.label; });
      lines.push('errors=' + this.errors);
      var box = document.getElementById('testResult');
      box.style.display = 'block';
      box.textContent = lines.join(' | ');
      this.refreshDebug();
      return { passed: passed, total: checks.length };
    },
  };

  window.addEventListener('DOMContentLoaded', function () { SB.Game.init(); });
  if (document.readyState !== 'loading') SB.Game.init();
})();
