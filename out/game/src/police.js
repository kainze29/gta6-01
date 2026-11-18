// Wanted level and the Solmar Bay Police: patrol cars that chase, ram and bust the player.
(function () {
  'use strict';

  SB.Police = {
    wanted: 0,
    cars: [],
    heat: 0,            // 0..100, drives wanted up
    coolTimer: 0,       // seconds since last crime; wanted decays after 25 s clean
    bustTimer: 0,       // time a cop has been touching the player on foot
    sirenPhase: 0,

    init: function (scene) {
      this.cars = [];
      this.wanted = 0;
      this.heat = 0;
      this.coolTimer = 0;
      this.scene = scene;
    },
    setWanted: function (level, reason) {
      level = SB.clamp(Math.round(level), 0, 5);
      if (level > this.wanted) {
        this.wanted = level;
        this.coolTimer = 0;
        SB.HUD.toast(level >= 3 ? 'WANTED: ' + level + ' STARS' : 'Police alerted', reason || '');
        SB.Audio.setSiren(level > 0);
      } else if (level < this.wanted) {
        this.wanted = level;
        if (level === 0) {
          SB.HUD.toast('You lost the cops', 'Wanted level cleared');
          SB.Audio.setSiren(false);
        }
      }
    },
    addHeat: function (amount) {
      this.heat = SB.clamp(this.heat + amount, 0, 100);
      this.coolTimer = 0;
      var level = this.heat < 12 ? 0 : this.heat < 30 ? 1 : this.heat < 50 ? 2 : this.heat < 72 ? 3 : this.heat < 90 ? 4 : 5;
      if (level > this.wanted) this.setWanted(level, 'The police saw that');
    },
    crime: function (kind) {
      // kind: 'steal' | 'assault' | 'shoot' | 'speeding'
      if (kind === 'steal') this.addHeat(28);
      else if (kind === 'assault') this.addHeat(18);
      else if (kind === 'shoot') this.addHeat(34);
      else if (kind === 'speeding') this.addHeat(4);
      this.coolTimer = 0;
    },

    desiredCopCount: function () {
      return [0, 1, 2, 3, 4, 5][this.wanted];
    },

    spawnCop: function (scene, nearX, nearZ) {
      var a = Math.random() * Math.PI * 2;
      var x = nearX + Math.cos(a) * SB.rand(35, 55);
      var z = nearZ + Math.sin(a) * SB.rand(35, 55);
      x = SB.clamp(x, -175, 175); z = SB.clamp(z, -175, 175);
      var car = new SB.Car(scene, { police: true, heading: 0 });
      car.setPos(x, z, Math.atan2(nearX - x, nearZ - z));
      car.isCop = true;
      this.cars.push(car);
      return car;
    },

    update: function (dt, playerPos, playerSpeed, inCar, playerCar) {
      var self = this;
      // Wanted decay: stay clean and the heat fades.
      if (this.wanted > 0) {
        this.coolTimer += dt;
        if (this.coolTimer > 25) {
          this.heat = Math.max(0, this.heat - dt * 4);
          var level = this.heat < 12 ? 0 : this.heat < 30 ? 1 : this.heat < 50 ? 2 : this.heat < 72 ? 3 : this.heat < 90 ? 4 : 5;
          if (level < this.wanted) this.setWanted(level);
        }
      }
      // Speeding in a car near cops adds a little heat.
      if (inCar && playerSpeed > 40) this.addHeat(dt * 0.25);
      // Keep the right number of cop cars.
      var want = this.desiredCopCount();
      while (this.cars.length < want) this.spawnCop(this.scene, playerPos.x, playerPos.z);
      while (this.cars.length > want) {
        var old = this.cars.pop();
        this.scene.remove(old.mesh);
      }
      // Siren flash.
      this.sirenPhase += dt * 6;
      var flash = Math.sin(this.sirenPhase) > 0;
      this.cars.forEach(function (cop) {
        if (cop.mesh.userData.lightRed) {
          cop.mesh.userData.lightRed.material.color.setHex(flash ? 0xff1744 : 0x550000);
          cop.mesh.userData.lightBlue.material.color.setHex(flash ? 0x112244 : 0x2979ff);
        }
      });
      // Chase AI: steer toward the player, ram on contact.
      var busted = false;
      this.cars.forEach(function (cop) {
        var dx = playerPos.x - cop.x, dz = playerPos.z - cop.z;
        var d = Math.sqrt(dx * dx + dz * dz);
        var targetHeading = Math.atan2(dx, dz);
        cop.heading = SB.angleLerp(cop.heading, targetHeading, SB.clamp(dt * 2.2, 0, 1));
        var cruise = SB.clamp(16 + self.wanted * 3.5, 16, 34);
        cop.speed = SB.lerp(cop.speed, cruise, SB.clamp(dt * 1.2, 0, 1));
        var nx = cop.x + Math.sin(cop.heading) * cop.speed * dt;
        var nz = cop.z + Math.cos(cop.heading) * cop.speed * dt;
        var pos = { x: nx, z: nz };
        for (var i = 0; i < SB.City.colliders.length; i++) SB.pushOutOfBox(pos, 2.2, SB.City.colliders[i]);
        cop.x = pos.x; cop.z = pos.z;
        cop.updateMesh();
        if (d < 3.2) {
          if (inCar && playerCar) {
            // Ram: shove the player car and damage it.
            playerCar.speed *= 0.9;
            if (cop.speed > 8) playerCar.health -= 1.0 * dt * 10;
            SB.Audio.crash();
            SB.Game.damageFlash();
            if (playerCar.health <= 0) {
              playerCar.dead = true;
              SB.Game.onCarWrecked();
            }
          } else {
            // On foot: a cop touching you for 2.5 s busts you.
            self.bustTimer += dt;
            if (self.bustTimer > 2.5) busted = true;
          }
        }
      });
      if (this.cars.length === 0) this.bustTimer = 0;
      else if (!this.cars.some(function (c) { return SB.dist2d(c.x, c.z, playerPos.x, playerPos.z) < 3.2; })) {
        this.bustTimer = Math.max(0, this.bustTimer - dt * 2);
      }
      // Screenshot mode: hold the cops in a visible pursuit formation around the player.
      if (SB._shotChase && this.cars.length >= 2) {
        var ph = playerCar ? playerCar.heading : 0;
        var fx = Math.sin(ph), fz = Math.cos(ph);
        var lx = Math.cos(ph), lz = -Math.sin(ph);
        var formation = [[-7, 8], [7, 8], [0, -16]];
        this.cars.forEach(function (cop, ci) {
          var off = formation[ci % formation.length];
          cop.x = playerPos.x + lx * off[0] + fx * off[1];
          cop.z = playerPos.z + lz * off[0] + fz * off[1];
          cop.heading = ph;
          cop.speed = 26;
          cop.updateMesh();
        });
      }
      if (busted) SB.Game.onBusted();
    },

    clearAll: function () {
      var self = this;
      this.cars.forEach(function (c) { self.scene.remove(c.mesh); });
      this.cars = [];
      this.wanted = 0;
      this.heat = 0;
      this.bustTimer = 0;
      SB.Audio.setSiren(false);
    },
  };
})();
