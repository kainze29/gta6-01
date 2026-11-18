// Missions and story: three jobs for Mara Quinn, with a tracker, markers and timers.
// Mission flow: idle -> active (stages) -> complete / failed. M starts the next job.
(function () {
  'use strict';

  SB.Missions = {
    index: 0,          // next mission to start (0..2), 3 = all done
    active: null,      // {def, stage, timer, target, marker}
    marker: null,      // floating beacon mesh
    targetCar: null,   // mission 2 chase car
    stealCar: null,    // mission 3 car to steal

    init: function (scene) {
      this.scene = scene;
      this.index = 0;
      this.active = null;
      // Beacon: a tall glowing column marking the objective.
      var geo = new THREE.CylinderGeometry(1.6, 1.6, 60, 12, 1, true);
      var mat = new THREE.MeshBasicMaterial({ color: 0xffd54a, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
      this.marker = new THREE.Mesh(geo, mat);
      this.marker.visible = false;
      scene.add(this.marker);
      var ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 3, 24),
        new THREE.MeshBasicMaterial({ color: 0xffd54a, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.1;
      this.marker.add(ring);
    },

    currentDef: function () { return SB.MISSION_DEFS[this.index] || null; },

    startNext: function () {
      if (this.active) { SB.HUD.toast('Mission already running', 'Finish or fail it first'); return false; }
      var def = this.currentDef();
      if (!def) { SB.HUD.toast('All jobs done', 'Mara has no more work for you. Free roam!'); return false; }
      var m = { def: def, stage: 0, timer: def.timeLimit, target: null };
      if (def.id === 'm1') {
        m.target = { x: -144, z: -120 };          // pickup at Marina docks
        m.dest = { x: 144, z: 120 };              // drop at Sunset Strip cafe
        m.stageText = 'Pick up the package at the Marina docks (west side)';
      } else if (def.id === 'm2') {
        m.target = null;
        m.stageText = 'Chase Dante\u2019s orange coupe and ram it until it stops';
        this.spawnChaseCar();
      } else if (def.id === 'm3') {
        m.target = { x: -120, z: 144 };           // black sedan at Old Docks
        m.dest = { x: 120, z: -120 };             // hideout in Palm Heights
        m.stageText = 'Steal the black sedan at the Old Docks';
        this.spawnStealCar();
      }
      this.active = m;
      SB.HUD.toast(def.title, def.briefing);
      SB.Audio.chime();
      this.updateMarker();
      return true;
    },

    spawnChaseCar: function () {
      var car = new SB.Car(this.scene, { color: 0xff6d00, heading: 0 });
      car.setPos(48, -48, Math.PI / 2);
      car.isChaseTarget = true;
      car.health = 100;
      this.targetCar = car;
      // A rival driver persona: Dante Cross flees along the roads.
      car.fleeSpeed = 20;
    },

    spawnStealCar: function () {
      var car = new SB.Car(this.scene, { color: 0x111111, heading: Math.PI });
      car.setPos(-120, 144, Math.PI);
      car.isStealTarget = true;
      car.parked = true;
      this.stealCar = car;
    },

    updateMarker: function () {
      if (!this.active) { this.marker.visible = false; return; }
      var t = this.missionTargetPos();
      if (!t) { this.marker.visible = false; return; }
      this.marker.visible = true;
      this.marker.position.set(t.x, 30, t.z);
    },

    missionTargetPos: function () {
      var m = this.active;
      if (!m) return null;
      if (m.def.id === 'm1') return m.stage === 0 ? m.target : m.dest;
      if (m.def.id === 'm2') return this.targetCar && !this.targetCar.dead ? { x: this.targetCar.x, z: this.targetCar.z } : null;
      if (m.def.id === 'm3') {
        if (m.stage === 0) return m.target;
        return m.dest;
      }
      return null;
    },

    // Called every frame while a mission is active.
    update: function (dt, playerPos, inCar, playerCar) {
      var m = this.active;
      if (!m) return;
      if (m.timer > 0) {
        m.timer -= dt;
        if (m.timer <= 0) { this.fail('Out of time'); return; }
      }
      if (this.marker.visible) this.marker.rotation.y += dt * 1.2;
      var px = playerPos.x, pz = playerPos.z;

      if (m.def.id === 'm1') {
        var goal = m.stage === 0 ? m.target : m.dest;
        if (SB.dist2d(px, pz, goal.x, goal.z) < 6) {
          if (m.stage === 0) {
            m.stage = 1;
            m.stageText = 'Package picked up. Deliver it to the Sunset Strip cafe (south-east)';
            SB.HUD.toast('Package secured', 'Now deliver it to the Sunset Strip cafe');
            SB.Audio.pickup();
          } else {
            this.complete();
            return;
          }
        }
      } else if (m.def.id === 'm2') {
        var tc = this.targetCar;
        if (!tc) { this.fail('The target got away'); return; }
        // Dante flees: drive along roads away from the player.
        if (!tc.dead) {
          var dx = tc.x - px, dz = tc.z - pz;
          var d = Math.sqrt(dx * dx + dz * dz) || 1;
          var fleeHeading = Math.atan2(dx, dz);
          tc.heading = SB.angleLerp(tc.heading, fleeHeading, SB.clamp(dt * 1.4, 0, 1));
          tc.speed = SB.lerp(tc.speed, tc.fleeSpeed, SB.clamp(dt, 0, 1));
          var nx = tc.x + Math.sin(tc.heading) * tc.speed * dt;
          var nz = tc.z + Math.cos(tc.heading) * tc.speed * dt;
          var pos = { x: nx, z: nz };
          for (var i = 0; i < SB.City.colliders.length; i++) SB.pushOutOfBox(pos, 2.2, SB.City.colliders[i]);
          SB.City.clampToCity(pos, 6);
          tc.x = pos.x; tc.z = pos.z;
          tc.updateMesh();
        }
        // Player rams the target: damage on hard contact.
        if (inCar && playerCar && !tc.dead) {
          var cd = SB.dist2d(px, pz, tc.x, tc.z);
          if (cd < 3.6 && Math.abs(playerCar.speed) > 6) {
            tc.damage(14);
            playerCar.speed *= 0.7;
            SB.Audio.crash();
            SB.Game.damageFlash();
            SB.HUD.toast('Hit him!', 'Target car health: ' + Math.max(0, Math.round(tc.health)) + '%');
          }
        }
        if (tc.dead || tc.health <= 0) {
          this.complete();
          return;
        }
      } else if (m.def.id === 'm3') {
        if (m.stage === 0) {
          // Stage 0 completes when the player enters the black sedan.
          if (inCar && playerCar === this.stealCar) {
            m.stage = 1;
            m.stageText = 'You stole it! Get to the Palm Heights hideout. The cops are coming.';
            SB.HUD.toast('Car stolen!', 'Reach the Palm Heights hideout');
            SB.Police.crime('steal');
            SB.Audio.chime();
          }
        } else {
          if (SB.dist2d(px, pz, m.dest.x, m.dest.z) < 8) {
            this.complete();
            return;
          }
        }
      }
      this.updateMarker();
    },

    complete: function () {
      var m = this.active;
      SB.Player.cash += m.def.reward;
      SB.Player.heal(30);
      SB.HUD.toast('JOB COMPLETE: +' + SB.fmtCash(m.def.reward), 'Mara is pleased. ' + (this.index + 1) + ' of 3 jobs done.');
      SB.Audio.chime();
      this.index++;
      this.active = null;
      this.marker.visible = false;
      if (this.targetCar) { this.targetCar = null; }
      if (this.index >= SB.MISSION_DEFS.length) {
        SB.HUD.toast('STORY COMPLETE', 'All three jobs done. Rico Vega is free. Free roam Solmar Bay!');
      }
      SB.Game.saveGame(true);
    },

    fail: function (reason) {
      var m = this.active;
      SB.HUD.toast('JOB FAILED', reason + ' - ' + m.def.title);
      SB.Audio.fail();
      if (this.targetCar) { this.scene.remove(this.targetCar.mesh); this.targetCar = null; }
      if (this.stealCar && m.def.id === 'm3' && m.stage === 0) { /* keep the car parked */ }
      this.active = null;
      this.marker.visible = false;
    },

    abort: function () {
      if (!this.active) return;
      if (this.targetCar) { this.scene.remove(this.targetCar.mesh); this.targetCar = null; }
      this.active = null;
      this.marker.visible = false;
    },

    // HUD text for the mission tracker.
    trackerText: function () {
      if (this.active) {
        return { title: this.active.def.title, text: this.active.stageText, timer: this.active.timer };
      }
      var def = this.currentDef();
      if (def) return { title: 'NEXT JOB: ' + def.title, text: 'Press M to start. ' + def.briefing, timer: 0 };
      return { title: 'FREE ROAM', text: 'All jobs complete. Explore Solmar Bay, steal cars, dodge the cops.', timer: 0 };
    },
  };
})();
