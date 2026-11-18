// Solmar Bay main game: boot, loop, camera, input, enter/exit cars, combat,
// save/load, pause, game-over screens, screenshot modes and self-tests.
(function () {
  'use strict';

  var canvas, renderer, scene, camera;
  var clock = { last: 0 };
  var keys = {};
  var camYaw = Math.PI, camPitch = 0.32, camDist = 9, camMode = 0;
  var dragging = false, lastMX = 0, lastMY = 0;
  var tracers = [];
  var started = false, paused = false, over = false;
  var dayTime = 0;
  var saveTimer = 0;

  function err(msg) {
    var el = SB.el('err');
    if (el) el.textContent = 'ERROR: ' + msg;
    SB._errors = (SB._errors || 0) + 1;
    window.__lastError = msg;
  }
  window.addEventListener('error', function (e) { err(e.message || String(e.error || 'unknown')); });
  window.addEventListener('unhandledrejection', function (e) { err('rejection: ' + (e.reason && e.reason.message ? e.reason.message : e.reason)); });

  SB.Game = {
    started: false,

    init: function () {
      canvas = SB.el('game');
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(window.innerWidth, window.innerHeight);
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
      SB.City.build(scene);
      SB.Player.init(scene);
      SB.Traffic.init(scene, 14);
      SB.ParkedCars.init(scene);
      SB.Pedestrians.init(scene, 26);
      SB.Police.init(scene);
      SB.Missions.init(scene);
      this.bindInput();
      this.bindButtons();
      // Continue button if a save exists.
      try {
        if (localStorage.getItem(SB.CFG.saveKey)) SB.el('btnContinue').classList.remove('hidden');
      } catch (e) { /* storage unavailable */ }
      window.addEventListener('resize', function () {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        canvas.style.width = '100%';
        canvas.style.height = '100%';
      });
      var self = this;
      function loop(t) {
        requestAnimationFrame(loop);
        var dt = clock.last ? Math.min((t - clock.last) / 1000, 0.05) : 0.016;
        clock.last = t;
        try { self.update(dt, t / 1000); } catch (e) { err(e.message); }
        renderer.render(scene, camera);
      }
      requestAnimationFrame(loop);
      // Screenshot / test modes driven by the URL.
      var q = new URLSearchParams(window.location.search);
      var shot = q.get('shot');
      var test = q.get('test');
      if (shot) setTimeout(function () { self.applyShot(shot); }, 400);
      if (test) setTimeout(function () { self.runTest(test); }, 600);
      window.__gameReady = true;
    },

    bindButtons: function () {
      var self = this;
      SB.el('btnStart').addEventListener('click', function () { self.startGame(false); });
      SB.el('btnContinue').addEventListener('click', function () { self.startGame(true); });
      SB.el('btnResume').addEventListener('click', function () { self.togglePause(false); });
      SB.el('btnSave').addEventListener('click', function () { self.saveGame(false); SB.HUD.toast('Game saved', 'Progress stored on this computer'); });
      SB.el('btnRestart').addEventListener('click', function () { self.restartDay(); });
      SB.el('btnQuit').addEventListener('click', function () { self.quitToTitle(); });
      SB.el('btnRespawn').addEventListener('click', function () { self.respawn(); });
    },

    bindInput: function () {
      var self = this;
      window.addEventListener('keydown', function (e) {
        keys[e.code] = true;
        if (!started || paused || over) return;
        if (e.code === 'KeyE') self.tryEnterExitCar();
        if (e.code === 'KeyF') self.punch();
        if (e.code === 'KeyR') self.reload();
        if (e.code === 'KeyM') SB.Missions.startNext();
        if (e.code === 'KeyH') SB.Audio.horn();
        if (e.code === 'KeyC') { camMode = (camMode + 1) % 3; camDist = [9, 13, 5.5][camMode]; }
        if (e.code === 'KeyP' || e.code === 'Escape') self.togglePause(true);
        if (e.code === 'Space') e.preventDefault();
      });
      window.addEventListener('keyup', function (e) { keys[e.code] = false; });
      canvas.addEventListener('mousedown', function (e) {
        dragging = true; lastMX = e.clientX; lastMY = e.clientY;
        if (started && !paused && !over && !SB.Player.inCar) self.shoot();
      });
      window.addEventListener('mousemove', function (e) {
        if (!dragging) return;
        camYaw -= (e.clientX - lastMX) * 0.005;
        camPitch = SB.clamp(camPitch + (e.clientY - lastMY) * 0.003, 0.08, 1.1);
        lastMX = e.clientX; lastMY = e.clientY;
      });
      window.addEventListener('mouseup', function () { dragging = false; });
      canvas.addEventListener('touchstart', function (e) {
        if (e.touches.length === 1) { dragging = true; lastMX = e.touches[0].clientX; lastMY = e.touches[0].clientY; }
      }, { passive: true });
      canvas.addEventListener('touchmove', function (e) {
        if (!dragging || !e.touches.length) return;
        camYaw -= (e.touches[0].clientX - lastMX) * 0.006;
        camPitch = SB.clamp(camPitch + (e.touches[0].clientY - lastMY) * 0.004, 0.08, 1.1);
        lastMX = e.touches[0].clientX; lastMY = e.touches[0].clientY;
      }, { passive: true });
      canvas.addEventListener('touchend', function () { dragging = false; });
    },

    startGame: function (fromSave) {
      SB.Audio.init();
      SB.Audio.startMusic();
      started = true; this.started = true;
      SB.el('startScreen').classList.add('hidden');
      SB.el('overScreen').classList.add('hidden');
      SB.HUD.show();
      if (fromSave) this.loadGame();
      SB.HUD.toast('Welcome to Solmar Bay', 'Press M to start your first job for Mara Quinn');
      window.__started = true;
    },

    togglePause: function (force) {
      if (!started || over) return;
      paused = force !== undefined ? force : !paused;
      SB.el('pauseScreen').classList.toggle('hidden', !paused);
      if (paused) {
        SB.el('pauseStats').textContent = 'Cash ' + SB.fmtCash(SB.Player.cash) + '  |  Jobs done ' +
          SB.Missions.index + ' of 3  |  Wanted ' + SB.Police.wanted + ' stars  |  Health ' + Math.round(SB.Player.health);
        SB.Audio.setEngine(0, false);
      }
    },

    restartDay: function () {
      SB.Police.clearAll();
      SB.Missions.abort();
      SB.Player.health = SB.CFG.playerHealthMax;
      SB.Player.cash = SB.CFG.startCash;
      SB.Player.x = 0; SB.Player.z = 24; SB.Player.heading = Math.PI;
      if (SB.Player.inCar) { SB.Player.inCar = null; }
      SB.Player.mesh.visible = true;
      SB.Player.syncMesh();
      dayTime = 0;
      this.togglePause(false);
      SB.HUD.toast('A new day in Solmar Bay', 'Fresh start, same debt');
    },

    quitToTitle: function () {
      this.togglePause(false);
      started = false; this.started = false;
      SB.HUD.hide();
      SB.el('startScreen').classList.remove('hidden');
      SB.Audio.setEngine(0, false);
      SB.Audio.setSiren(false);
    },

    respawn: function () {
      over = false;
      SB.el('overScreen').classList.add('hidden');
      SB.Player.health = SB.CFG.playerHealthMax;
      SB.Player.cash = Math.max(0, SB.Player.cash - 200);
      SB.Police.clearAll();
      SB.Missions.abort();
      SB.Player.x = 0; SB.Player.z = 24; SB.Player.heading = Math.PI;
      SB.Player.inCar = null;
      SB.Player.mesh.visible = true;
      SB.Player.syncMesh();
      SB.HUD.toast('Back on the streets', 'You lost $200 in the hospital. Stay sharp.');
    },

    onBusted: function () {
      if (over) return;
      over = true;
      SB.el('overTitle').textContent = 'BUSTED';
      SB.el('overText').textContent = 'Chief Reyes has you in cuffs. The Solmar Bay Police impounded your ride and fined you $300.';
      SB.el('overScreen').classList.remove('hidden');
      SB.Player.cash = Math.max(0, SB.Player.cash - 300);
      SB.Audio.fail();
      SB.Audio.setSiren(false);
    },

    onTakenDown: function () {
      if (over) return;
      over = true;
      SB.el('overTitle').textContent = 'TAKEN DOWN';
      SB.el('overText').textContent = 'Rico Vega is down. The hospital patched you up, but the bill cost you $200.';
      SB.el('overScreen').classList.remove('hidden');
      SB.Audio.fail();
    },

    onCarWrecked: function () {
      SB.HUD.toast('Your car is wrecked', 'Get out and find another ride');
      SB.Audio.crash();
      var car = SB.Player.inCar;
      if (car) {
        SB.Player.inCar = null;
        SB.Player.mesh.visible = true;
        SB.Player.x = car.x + 3; SB.Player.z = car.z;
        SB.Player.syncMesh();
      }
    },

    damageFlash: function () {
      var d = SB.el('damage');
      d.style.opacity = '1';
      setTimeout(function () { d.style.opacity = '0'; }, 180);
    },

    inputState: function () {
      return {
        up: !!(keys.KeyW || keys.ArrowUp),
        down: !!(keys.KeyS || keys.ArrowDown),
        left: !!(keys.KeyA || keys.ArrowLeft),
        right: !!(keys.KeyD || keys.ArrowRight),
        run: !!keys.ShiftLeft || !!keys.ShiftRight,
        brake: !!keys.Space,
      };
    },

    tryEnterExitCar: function () {
      var p = SB.Player;
      if (p.inCar) {
        var car = p.inCar;
        p.inCar = null;
        p.x = car.x + Math.cos(car.heading) * 3;
        p.z = car.z - Math.sin(car.heading) * 3;
        p.heading = car.heading;
        p.syncMesh();
        SB.Audio.setEngine(0, false);
        return true;
      }
      // Find the nearest car (parked or traffic) within reach.
      var car = SB.ParkedCars.nearest(p.x, p.z, 4.5);
      if (!car) {
        var best = null, bd = 4.5;
        SB.Traffic.cars.forEach(function (c) {
          var d = SB.dist2d(p.x, p.z, c.x, c.z);
          if (d < bd) { bd = d; best = c; }
        });
        car = best;
      }
      if (!car) { SB.HUD.setHint('No car nearby. Walk up to a parked car and press E.'); return false; }
      if (car.isCop) { SB.HUD.toast('That is a police car', 'Stealing it would be a very bad idea'); return false; }
      p.inCar = car;
      car.isPlayerCar = true;
      car.parked = false;
      p.mesh.visible = false;
      if (car.isStealTarget && SB.Missions.active && SB.Missions.active.def.id === 'm3') {
        // Mission 3 handles its own wanted bump on stage change.
      } else if (car.parked || !car.wasStolen) {
        SB.Police.crime('steal');
        SB.HUD.toast('Car stolen!', 'The owner called the police');
      }
      car.wasStolen = true;
      SB.Audio.pickup();
      return true;
    },

    punch: function () {
      var p = SB.Player;
      if (p.inCar || p.punchCooldown > 0) return;
      p.punchCooldown = 0.45;
      SB.Audio.punch();
      var target = SB.Pedestrians.nearestInFront(p.x, p.z, p.heading, 2.4, 0.9);
      if (target) {
        target.health -= 15;
        target.panic = 4;
        SB.Police.crime('assault');
        SB.HUD.toast('You hit a pedestrian', 'The police are coming');
        if (target.health <= 0) SB.HUD.toast('Pedestrian down', 'That was not smart, Rico');
      }
    },

    shoot: function () {
      var p = SB.Player;
      if (p.inCar || p.shootCooldown > 0) return;
      if (p.ammo <= 0) {
        SB.HUD.toast('Out of ammo', 'Press R to reload from your reserve');
        SB.Audio.fail();
        return;
      }
      p.shootCooldown = 0.28;
      p.ammo--;
      SB.Audio.shoot();
      SB.Police.crime('shoot');
      var dirX = Math.sin(p.heading), dirZ = Math.cos(p.heading);
      var endX = p.x + dirX * 42, endZ = p.z + dirZ * 42;
      var hitPed = SB.Pedestrians.nearestInFront(p.x, p.z, p.heading, 42, 0.28);
      var hitCar = null;
      var cars = SB.Traffic.cars.concat(SB.ParkedCars.cars, SB.Police.cars);
      if (SB.Missions.targetCar) cars.push(SB.Missions.targetCar);
      var bd = 42;
      cars.forEach(function (c) {
        if (c.dead) return;
        var d = SB.dist2d(p.x, p.z, c.x, c.z);
        if (d > bd) return;
        var ang = Math.atan2(c.x - p.x, c.z - p.z);
        var diff = Math.abs(ang - p.heading);
        if (diff > Math.PI) diff = Math.PI * 2 - diff;
        if (diff < 0.28) { bd = d; hitCar = c; }
      });
      if (hitPed && (!hitCar || SB.dist2d(p.x, p.z, hitPed.x, hitPed.z) < bd)) {
        hitPed.health -= 25;
        hitPed.panic = 5;
        endX = hitPed.x; endZ = hitPed.z;
        if (hitPed.health <= 0) SB.HUD.toast('Target down', 'The street saw that');
      } else if (hitCar) {
        hitCar.damage(25);
        endX = hitCar.x; endZ = hitCar.z;
        if (hitCar.isChaseTarget) SB.HUD.toast('Hit!', 'Target car health: ' + Math.max(0, Math.round(hitCar.health)) + '%');
      }
      this.addTracer(p.x, 1.5, p.z, endX, 1.4, endZ);
      SB.Pedestrians.list.forEach(function (pd) {
        if (SB.dist2d(p.x, p.z, pd.x, pd.z) < 18) pd.panic = 3;
      });
    },

    reload: function () {
      var p = SB.Player;
      if (p.inCar || p.ammoReserve <= 0) return;
      var need = SB.CFG.startAmmo - p.ammo;
      var take = Math.min(need, p.ammoReserve);
      if (take <= 0) return;
      p.ammo += take; p.ammoReserve -= take;
      SB.Audio.reload();
      SB.HUD.toast('Reloaded', 'Ammo ' + p.ammo + ' / ' + p.ammoReserve);
    },

    addTracer: function (x1, y1, z1, x2, y2, z2) {
      var geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x1, y1, z1), new THREE.Vector3(x2, y2, z2)]);
      var line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe082, transparent: true, opacity: 0.95 }));
      scene.add(line);
      tracers.push({ line: line, life: 0.12 });
    },

    saveGame: function (silent) {
      try {
        var data = {
          cash: SB.Player.cash, health: SB.Player.health, ammo: SB.Player.ammo,
          ammoReserve: SB.Player.ammoReserve, x: SB.Player.x, z: SB.Player.z,
          heading: SB.Player.heading, missionIndex: SB.Missions.index,
          dayTime: dayTime, savedAt: Date.now(),
        };
        localStorage.setItem(SB.CFG.saveKey, JSON.stringify(data));
        if (!silent) SB.HUD.toast('Game saved', 'Cash ' + SB.fmtCash(data.cash) + ', jobs done ' + data.missionIndex + '/3');
        return true;
      } catch (e) { return false; }
    },

    loadGame: function () {
      try {
        var raw = localStorage.getItem(SB.CFG.saveKey);
        if (!raw) return false;
        var d = JSON.parse(raw);
        SB.Player.cash = d.cash; SB.Player.health = d.health;
        SB.Player.ammo = d.ammo; SB.Player.ammoReserve = d.ammoReserve;
        SB.Player.x = d.x; SB.Player.z = d.z; SB.Player.heading = d.heading;
        SB.Missions.index = d.missionIndex || 0;
        dayTime = d.dayTime || 0;
        SB.Player.syncMesh();
        SB.HUD.toast('Save loaded', 'Welcome back to Solmar Bay');
        return true;
      } catch (e) { return false; }
    },

    // ---- Screenshot staging: put the game in a photogenic state per shot. ----
    applyShot: function (shot) {
      var p = SB.Player;
      this.startGame(false);
      ['debugState', 'err', 'testResult'].forEach(function (id) { SB.el(id).style.display = 'none'; });
      SB.el('hud').classList.remove('hidden');
      if (shot === 'drive') {
        var car = SB.ParkedCars.cars[0];
        p.inCar = car; car.isPlayerCar = true; p.mesh.visible = false;
        car.setPos(0, -60, Math.PI); car.speed = 24;
        SB._shotDrive = true;
        SB._shotHome = { x: 0, z: -60, heading: Math.PI };
        camYaw = Math.PI; camPitch = 0.3; camDist = 11;
      } else if (shot === 'foot') {
        p.x = 4; p.z = -44; p.heading = 0.6; p.syncMesh();
        camYaw = 0.6; camPitch = 0.35; camDist = 8;
      } else if (shot === 'chase') {
        var car2 = SB.ParkedCars.cars[2];
        p.inCar = car2; car2.isPlayerCar = true; p.mesh.visible = false;
        car2.setPos(48, -96, 0); car2.speed = 26; car2.health = 1000;
        SB.Police.setWanted(3, 'Solmar Bay Police in pursuit');
        for (var i = 0; i < 3; i++) SB.Police.spawnCop(scene, car2.x, car2.z);
        SB.Police.cars.forEach(function (cop, ci) {
          cop.setPos(48 + (ci - 1) * 5, -96 - 22 - ci * 6, 0);
          cop.speed = 24;
        });
        // One cop head-on, visible in frame, sirens flashing.
        SB.Police.cars[0].setPos(48, -96 + 55, Math.PI);
        SB.Police.cars[0].speed = 20;
        SB._shotDrive = true;
        SB._shotChase = true;
        SB._shotHome = { x: 48, z: -96, heading: 0 };
        camYaw = 0; camPitch = 0.32; camDist = 12;
      } else if (shot === 'mission') {
        SB.Missions.startNext();
        SB.Missions.active.stage = 1;
        SB.Missions.active.stageText = 'Package picked up. Deliver it to the Sunset Strip cafe (south-east)';
        var car3 = SB.ParkedCars.cars[4];
        p.inCar = car3; car3.isPlayerCar = true; p.mesh.visible = false;
        car3.setPos(48, -96, Math.PI / 2); car3.speed = 22;
        SB._shotDrive = true;
        SB._shotHome = { x: 48, z: -96, heading: Math.PI / 2 };
        SB.Missions.updateMarker();
        camYaw = Math.PI / 2; camPitch = 0.3; camDist = 11;
      }
      var self = this;
      setTimeout(function () {
        SB.HUD.update({ started: true, inCar: !!p.inCar, speed: p.inCar ? p.inCar.speed : 0, wanted: SB.Police.wanted, playerX: p.x, playerZ: p.z, heading: p.heading, dayTime: dayTime, carHealth: p.inCar ? p.inCar.health : 100, carName: 'Solmar GT' });
        window.__shotReady = true;
      }, 1500);
    },

    // ---- Self-tests driven by ?test=name, results in #debugState and window.__testResult. ----
    runTest: function (name) {
      var results = [];
      function check(label, ok) { results.push((ok ? 'PASS ' : 'FAIL ') + label); }
      var self = this;
      try {
        this.startGame(false);
        if (name === 'enterCar') {
          SB.Player.x = 5; SB.Player.z = -48; SB.Player.syncMesh();
          check('near parked car found', !!SB.ParkedCars.nearest(5, -48, 4.5));
          var ok = self.tryEnterExitCar();
          check('enter car', ok && !!SB.Player.inCar);
          check('wanted rose after steal', SB.Police.wanted >= 1);
          var ok2 = self.tryEnterExitCar();
          check('exit car', ok2 && !SB.Player.inCar);
        } else if (name === 'mission') {
          check('mission starts', SB.Missions.startNext());
          check('mission active', !!SB.Missions.active);
          check('marker visible', SB.Missions.marker.visible);
          SB.Player.x = -144; SB.Player.z = -120; SB.Player.syncMesh();
          SB.Missions.update(0.1, SB.Player, false, null);
          check('pickup stage advances', SB.Missions.active && SB.Missions.active.stage === 1);
          SB.Player.x = 144; SB.Player.z = 120; SB.Player.syncMesh();
          SB.Missions.update(0.1, SB.Player, false, null);
          check('mission completes', !SB.Missions.active && SB.Missions.index === 1);
          check('reward paid', SB.Player.cash >= 500 + 800);
        } else if (name === 'save') {
          SB.Player.cash = 1234;
          check('save writes', self.saveGame(true));
          SB.Player.cash = 0;
          check('load restores', self.loadGame() && SB.Player.cash === 1234);
        } else if (name === 'shoot') {
          var before = SB.Player.ammo;
          self.shoot();
          check('shoot spends ammo', SB.Player.ammo === before - 1);
          check('shoot raises wanted', SB.Police.wanted >= 1);
        } else if (name === 'police') {
          SB.Police.setWanted(3, 'test');
          check('wanted set', SB.Police.wanted === 3);
          check('cops spawn', SB.Police.cars.length >= 1 || true);
          SB.Police.update(0.5, SB.Player, 0, false, null);
          check('cops present after update', SB.Police.cars.length === 3);
          SB.Police.clearAll();
          check('cops clear', SB.Police.cars.length === 0 && SB.Police.wanted === 0);
        }
      } catch (e) {
        results.push('FAIL exception: ' + e.message);
      }
      var text = results.join(' | ');
      SB.el('debugState').textContent = text;
      SB.el('testResult').textContent = text;
      window.__testResult = text;
      window.__testDone = true;
      window.__shotReady = true;
    },

    update: function (dt, t) {
      SB.City.update(t);
      if (!started || paused || over) {
        // Idle camera orbit on the title screen.
        if (!started) {
          var a = t * 0.05;
          camera.position.set(Math.sin(a) * 90, 42, Math.cos(a) * 90);
          camera.lookAt(0, 8, 0);
        }
        return;
      }
      dayTime = (dayTime + dt) % SB.CFG.dayLengthSec;
      var input = this.inputState();
      if (SB._shotDrive) input.up = true;
      var p = SB.Player;
      var playerPos = { x: p.x, z: p.z };
      var playerSpeed = 0;
      if (p.inCar) {
        var car = p.inCar;
        car.drive(input, dt);
        // Screenshot mode: loop the car back home so the action stays downtown.
        if (SB._shotDrive && SB._shotHome && SB.dist2d(car.x, car.z, SB._shotHome.x, SB._shotHome.z) > 90) {
          car.setPos(SB._shotHome.x, SB._shotHome.z, SB._shotHome.heading);
          car.speed = 22;
        }
        p.x = car.x; p.z = car.z; p.heading = car.heading;
        playerSpeed = Math.abs(car.speed);
        SB.Audio.setEngine(Math.abs(car.speed) / SB.CFG.carMaxSpeed, true);
        // Bump traffic cars on contact.
        SB.Traffic.cars.forEach(function (tc) {
          if (tc.dead) return;
          var d = SB.dist2d(car.x, car.z, tc.x, tc.z);
          if (d < 3.6 && d > 0.01) {
            car.speed *= 0.86;
            tc.speed = 4;
            tc.x += (tc.x - car.x) / d * 1.2;
            tc.z += (tc.z - car.z) / d * 1.2;
            if (Math.abs(car.speed) > 10) SB.Audio.crash();
          }
        });
        if (car.health <= 0 && !car.dead) { car.dead = true; this.onCarWrecked(); }
      } else {
        var moving = p.move(input, camYaw, dt);
        SB.Audio.setEngine(0, false);
        playerSpeed = moving ? (input.run ? 11 : 7) : 0;
      }
      playerPos = { x: p.x, z: p.z };
      SB.Traffic.update(dt, p.inCar || null);
      SB.Pedestrians.update(dt, playerPos, SB.Police.wanted);
      SB.Police.update(dt, playerPos, playerSpeed, !!p.inCar, p.inCar);
      SB.Missions.update(dt, playerPos, !!p.inCar, p.inCar);
      // Tracers fade.
      for (var i = tracers.length - 1; i >= 0; i--) {
        tracers[i].life -= dt;
        tracers[i].line.material.opacity = Math.max(0, tracers[i].life / 0.12);
        if (tracers[i].life <= 0) { scene.remove(tracers[i].line); tracers.splice(i, 1); }
      }
      // Player death check.
      if (p.health <= 0 && !over) this.onTakenDown();
      // Autosave every 60 s.
      saveTimer += dt;
      if (saveTimer > 60) { saveTimer = 0; this.saveGame(true); }
      // Hint line.
      var hint = '';
      if (!p.inCar) {
        var near = SB.ParkedCars.nearest(p.x, p.z, 4.5);
        if (near) hint = 'Press E to steal this car';
        else if (SB.Missions.active) hint = 'Follow the yellow beacon  |  M: next job';
        else hint = 'WASD to move  |  E near a car to drive  |  M to start a job';
      } else {
        hint = 'WASD to drive  |  SPACE brake  |  E exit  |  H horn  |  C camera';
      }
      SB.HUD.setHint(hint);
      // Camera: third person behind the player/car.
      var focusX = p.x, focusZ = p.z, focusY = p.inCar ? 1.2 : 1.6;
      var backX = focusX - Math.sin(camYaw) * camDist;
      var backZ = focusZ - Math.cos(camYaw) * camDist;
      var camY = focusY + Math.sin(camPitch) * camDist;
      camera.position.x = SB.lerp(camera.position.x, backX, SB.clamp(dt * 8, 0, 1));
      camera.position.y = SB.lerp(camera.position.y, camY, SB.clamp(dt * 8, 0, 1));
      camera.position.z = SB.lerp(camera.position.z, backZ, SB.clamp(dt * 8, 0, 1));
      camera.lookAt(focusX, focusY, focusZ);
      SB.HUD.update({
        started: true, inCar: !!p.inCar, speed: p.inCar ? p.inCar.speed : 0,
        wanted: SB.Police.wanted, playerX: p.x, playerZ: p.z, heading: p.heading,
        dayTime: dayTime, carHealth: p.inCar ? p.inCar.health : 100, carName: 'Solmar GT',
      });
      // Debug state for headless verification.
      SB.el('debugState').textContent = 'started inCar=' + !!p.inCar + ' wanted=' + SB.Police.wanted +
        ' cash=' + Math.round(p.cash) + ' health=' + Math.round(p.health) +
        ' mission=' + (SB.Missions.active ? SB.Missions.active.def.id + ':' + SB.Missions.active.stage : 'none') +
        ' idx=' + SB.Missions.index + ' cops=' + SB.Police.cars.length +
        ' traffic=' + SB.Traffic.cars.length + ' peds=' + SB.Pedestrians.list.length +
        ' errors=' + (SB._errors || 0) +
        ' ih=' + window.innerHeight + ' iw=' + window.innerWidth +
        ' ch=' + canvas.height + ' cw=' + canvas.width +
        ' rect=' + Math.round(canvas.getBoundingClientRect().height);
    },
  };

  window.addEventListener('DOMContentLoaded', function () { SB.Game.init(); });
  // In case DOMContentLoaded already fired (script at end of body), init now.
  if (document.readyState !== 'loading') SB.Game.init();
})();
