// Solmar Bay police: wanted level, heat, patrol cars that chase and ram, bust timer.
// All names, places and characters are original inventions for this game.
(function () {
  'use strict';
  var SB = window.SB || {};
  window.SB = SB;

  // Heat needed before a punch or a fender-bender turns into a star.
  var HEAT_PER_STAR = 100;
  // Seconds of clean behaviour before one star fades.
  var CLEAN_SECONDS = 25;
  // Seconds a patrol car must stay in arm's reach of a player on foot to bust them.
  var BUST_SECONDS = 2.5;
  // Ram damage per second while a patrol car grinds against the player's car.
  var RAM_DPS = 10;
  // One patrol car per wanted star, at most five on the road.
  var MAX_COPS = 5;

  SB.Police = {
    scene: null,
    wanted: 0,
    heat: 0,
    cops: [],
    time: 0,
    lastCrime: -999,
    bustTimer: 0,
    sirenOn: false,
    flashClock: 0,

    init: function (scene) {
      this.scene = scene;
      this.wanted = 0;
      this.heat = 0;
      this.cops = [];
      this.time = 0;
      this.lastCrime = -999;
      this.bustTimer = 0;
      this.sirenOn = false;
      this.flashClock = 0;
    },

    // A crime the player just committed. Stealing and shooting are loud:
    // a star at once. Punching and ramming build heat first.
    crime: function (type) {
      if (type === 'steal' || type === 'shoot') {
        this.wanted = SB.clamp(this.wanted + 1, 0, 5);
        this.heat = HEAT_PER_STAR;
      } else if (type === 'punch') {
        this.heat += 50;
        if (this.heat >= HEAT_PER_STAR) {
          this.wanted = SB.clamp(this.wanted + 1, 0, 5);
          this.heat = 0;
        }
      } else if (type === 'ram') {
        this.heat += 25;
        if (this.heat >= HEAT_PER_STAR) {
          this.wanted = SB.clamp(this.wanted + 1, 0, 5);
          this.heat = 0;
        }
      }
      this.lastCrime = this.time;
      this.bustTimer = 0;
    },

    // Set the wanted level outright (used by the self-test and the shot setups).
    setWanted: function (n) {
      this.wanted = SB.clamp(n, 0, 5);
      this.heat = this.wanted > 0 ? HEAT_PER_STAR : 0;
      this.lastCrime = this.time;
      this.bustTimer = 0;
    },

    // Remove every patrol car, drop the heat, clear the wanted level.
    clear: function () {
      var self = this;
      this.cops.forEach(function (cop) {
        if (cop.mesh) self.scene.remove(cop.mesh);
      });
      this.cops = [];
      this.wanted = 0;
      this.heat = 0;
      this.bustTimer = 0;
      SB.Audio.setSiren(false);
      this.sirenOn = false;
    },

    // Drop one patrol car onto a nearby road, facing the player.
    spawnCop: function (playerPos) {
      var angle = Math.random() * Math.PI * 2;
      var dist = SB.rand(32, 52);
      var x = playerPos.x + Math.sin(angle) * dist;
      var z = playerPos.z + Math.cos(angle) * dist;
      // Snap the spawn onto the nearest road so the car is never inside a tower.
      var line = SB.City.nearestRoad(x, z);
      if (Math.abs(x - line) < Math.abs(z - line)) x = line; else z = line;
      var spawnPos = { x: x, z: z };
      SB.City.clampToCity(spawnPos, 6);
      x = spawnPos.x; z = spawnPos.z;
      var cop = new SB.Car(this.scene, { police: true, heading: Math.atan2(playerPos.x - x, playerPos.z - z) });
      cop.setPos(x, z, cop.heading);
      cop.cruise = SB.rand(30, 36);
      cop.touching = false;
      this.cops.push(cop);
      return cop;
    },

    // How many patrol cars the current wanted level calls for.
    desiredCops: function () {
      return Math.min(this.wanted, MAX_COPS);
    },

    update: function (dt, playerPos, inCar, playerCar) {
      this.time += dt;
      this.flashClock += dt;

      // Stars fade after a long stretch with no new crime.
      if (this.wanted > 0 && this.time - this.lastCrime > CLEAN_SECONDS) {
        this.wanted -= 1;
        this.lastCrime = this.time;
        this.heat = this.wanted > 0 ? HEAT_PER_STAR / 2 : 0;
        if (this.wanted === 0) SB.HUD.toast('YOU LOST THEM', 'The patrols gave up. Stay clean.');
      }

      // Keep the patrol count matched to the wanted level.
      var want = this.wanted > 0 ? this.desiredCops() : 0;
      while (this.cops.length < want) this.spawnCop(playerPos);
      while (this.cops.length > want) {
        var gone = this.cops.pop();
        if (gone.mesh) this.scene.remove(gone.mesh);
      }

      // Siren follows the patrols, and the light bars blink.
      var siren = this.cops.length > 0;
      if (siren !== this.sirenOn) { SB.Audio.setSiren(siren); this.sirenOn = siren; }
      var blink = Math.floor(this.flashClock / 0.35) % 2 === 0;

      var self = this;
      var bust = false;
      var wrecked = false;
      this.cops.forEach(function (cop) {
        // Steer toward the player and chase them down.
        var dx = playerPos.x - cop.x;
        var dz = playerPos.z - cop.z;
        var dist = Math.sqrt(dx * dx + dz * dz) || 1;
        var targetHeading = Math.atan2(dx, dz);
        var diff = targetHeading - cop.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        var input = { up: cop.speed < cop.cruise, down: false, left: diff > 0.15, right: diff < -0.15, brake: false };
        cop.drive(input, dt);

        // A patrol car that wandered too far gets moved back onto the hunt.
        if (dist > 150) {
          var a = Math.random() * Math.PI * 2;
          var nx = playerPos.x + Math.sin(a) * 40;
          var nz = playerPos.z + Math.cos(a) * 40;
          var pos = { x: nx, z: nz };
          SB.City.clampToCity(pos, 6);
          cop.setPos(pos.x, pos.z, Math.atan2(playerPos.x - pos.x, playerPos.z - pos.z));
          cop.speed = 10;
        }

        // Blink the light bar: red one beat, blue the next.
        if (cop.mesh && cop.mesh.userData) {
          if (cop.mesh.userData.lightRed) cop.mesh.userData.lightRed.visible = blink;
          if (cop.mesh.userData.lightBlue) cop.mesh.userData.lightBlue.visible = !blink;
        }

        // Contact: ram a car (and shake its driver), or corner a player on foot.
        if (dist < 4.5) {
          if (inCar && playerCar) {
            if (!cop.touching) { SB.Audio.crash(); cop.touching = true; }
            playerCar.damage(RAM_DPS * dt);
            playerCar.speed *= (1 - 0.6 * dt);
            SB.Player.takeDamage(RAM_DPS * 0.2 * dt);
            if (playerCar.health <= 0) wrecked = true;
          } else if (dist < 3) {
            self.bustTimer += dt;
            if (self.bustTimer > BUST_SECONDS) bust = true;
          }
        } else {
          cop.touching = false;
          if (!inCar) self.bustTimer = Math.max(0, self.bustTimer - dt * 2);
        }
      });

      if (wrecked) SB.Game.onCarWrecked();
      else if (bust) SB.Game.onBusted();
    },
  };
})();
