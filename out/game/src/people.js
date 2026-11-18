// People: the player character (Rico Vega) and ambient pedestrians.
// Low-poly humanoids built from boxes, with a simple walk swing.
(function () {
  'use strict';

  SB.makePerson = function (opts) {
    opts = opts || {};
    var shirt = opts.shirt !== undefined ? opts.shirt : 0x1565c0;
    var pants = opts.pants !== undefined ? opts.pants : 0x37474f;
    var skin = opts.skin !== undefined ? opts.skin : 0xd9a066;
    var group = new THREE.Group();
    var skinMat = new THREE.MeshLambertMaterial({ color: skin });
    var shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
    var pantsMat = new THREE.MeshLambertMaterial({ color: pants });
    var legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.8, 0.24), pantsMat);
    legL.position.set(-0.14, 0.4, 0); legL.castShadow = true;
    var legR = legL.clone(); legR.position.x = 0.14;
    var torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), shirtMat);
    torso.position.y = 1.16; torso.castShadow = true;
    var armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.68, 0.2), shirtMat);
    armL.position.set(-0.42, 1.2, 0); armL.castShadow = true;
    var armR = armL.clone(); armR.position.x = 0.42;
    var head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.36, 0.32), skinMat);
    head.position.y = 1.72; head.castShadow = true;
    var hair = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.14, 0.34),
      new THREE.MeshLambertMaterial({ color: opts.hair !== undefined ? opts.hair : 0x1a1a1a }));
    hair.position.y = 1.94;
    group.add(legL, legR, torso, armL, armR, head, hair);
    group.userData.legL = legL; group.userData.legR = legR;
    group.userData.armL = armL; group.userData.armR = armR;
    return group;
  };

  // Walk-cycle swing for arms and legs.
  SB.animateWalk = function (mesh, phase, amount) {
    var u = mesh.userData;
    var s = Math.sin(phase) * amount;
    u.legL.rotation.x = s;
    u.legR.rotation.x = -s;
    u.armL.rotation.x = -s * 0.8;
    u.armR.rotation.x = s * 0.8;
  };

  // The player on foot.
  SB.Player = {
    mesh: null,
    x: 0, z: 0, y: 0,
    heading: 0,
    vy: 0,
    health: 100,
    cash: 500,
    ammo: 24,
    ammoReserve: 96,
    walkPhase: 0,
    inCar: null,
    punchCooldown: 0,
    shootCooldown: 0,
    invuln: 0,

    init: function (scene) {
      this.mesh = SB.makePerson({ shirt: 0xe53935, pants: 0x263238, skin: 0xd9a066, hair: 0x111111 });
      scene.add(this.mesh);
      this.x = 0; this.z = 24; this.heading = Math.PI;
      this.health = SB.CFG.playerHealthMax;
      this.cash = SB.CFG.startCash;
      this.ammo = SB.CFG.startAmmo;
      this.ammoReserve = 96;
      this.syncMesh();
    },
    syncMesh: function () {
      this.mesh.position.set(this.x, this.y, this.z);
      this.mesh.rotation.y = this.heading;
    },
    move: function (input, camYaw, dt) {
      var speed = input.run ? SB.CFG.runSpeed : SB.CFG.walkSpeed;
      var fx = Math.sin(camYaw), fz = Math.cos(camYaw);
      var rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
      var mx = 0, mz = 0;
      if (input.up) { mx += fx; mz += fz; }
      if (input.down) { mx -= fx; mz -= fz; }
      if (input.right) { mx += rx; mz += rz; }
      if (input.left) { mx -= rx; mz -= rz; }
      var len = Math.sqrt(mx * mx + mz * mz);
      var moving = len > 0.01;
      if (moving) {
        mx /= len; mz /= len;
        var nx = this.x + mx * speed * dt;
        var nz = this.z + mz * speed * dt;
        var pos = { x: nx, z: nz };
        for (var i = 0; i < SB.City.colliders.length; i++) SB.pushOutOfBox(pos, 0.6, SB.City.colliders[i]);
        SB.City.clampToCity(pos, 3);
        this.x = pos.x; this.z = pos.z;
        var targetHeading = Math.atan2(mx, mz);
        this.heading = SB.angleLerp(this.heading, targetHeading, SB.clamp(dt * 12, 0, 1));
        this.walkPhase += dt * speed * 1.6;
        SB.animateWalk(this.mesh, this.walkPhase, 0.55);
      } else {
        SB.animateWalk(this.mesh, this.walkPhase, 0);
      }
      if (this.punchCooldown > 0) this.punchCooldown -= dt;
      if (this.shootCooldown > 0) this.shootCooldown -= dt;
      if (this.invuln > 0) this.invuln -= dt;
      this.syncMesh();
      return moving;
    },
    takeDamage: function (amount) {
      if (this.invuln > 0) return false;
      this.health -= amount;
      this.invuln = 0.4;
      SB.Game.damageFlash();
      SB.Audio.crash();
      return this.health <= 0;
    },
    heal: function (amount) { this.health = SB.clamp(this.health + amount, 0, SB.CFG.playerHealthMax); },
  };

  // Ambient pedestrians strolling the sidewalks.
  SB.Pedestrians = {
    list: [],
    init: function (scene, count) {
      this.list = [];
      for (var i = 0; i < count; i++) {
        var mesh = SB.makePerson({
          shirt: SB.pick(SB.PED_COLORS),
          pants: SB.pick([0x37474f, 0x4e342e, 0x263238, 0x5d4037]),
          skin: SB.pick([0xd9a066, 0x8d5524, 0xe8b98a, 0x5c3a21]),
        });
        scene.add(mesh);
        var line = SB.pick(SB.ROAD_LINES);
        var horizontal = Math.random() < 0.5;
        var p = {
          mesh: mesh,
          x: horizontal ? SB.rand(-170, 170) : line + SB.pick([-9, 9]),
          z: horizontal ? line + SB.pick([-9, 9]) : SB.rand(-170, 170),
          heading: Math.random() * Math.PI * 2,
          speed: SB.rand(1.2, 2.4),
          phase: Math.random() * 6,
          state: 'walk',
          panic: 0,
          health: 30,
        };
        mesh.position.set(p.x, 0, p.z);
        this.list.push(p);
      }
    },
    update: function (dt, playerPos, wanted) {
      var self = this;
      this.list.forEach(function (p) {
        if (p.health <= 0) {
          p.mesh.visible = false;
          return;
        }
        if (p.panic > 0) p.panic -= dt;
        // Flee from the player when wanted or when the player is very close and armed.
        var d = SB.dist2d(p.x, p.z, playerPos.x, playerPos.z);
        var fleeing = p.panic > 0 || (wanted > 0 && d < 14);
        if (fleeing) {
          var ax = p.x - playerPos.x, az = p.z - playerPos.z;
          var al = Math.sqrt(ax * ax + az * az) || 1;
          p.heading = Math.atan2(ax / al, az / al);
          p.x += Math.sin(p.heading) * 4.5 * dt;
          p.z += Math.cos(p.heading) * 4.5 * dt;
          p.phase += dt * 12;
          SB.animateWalk(p.mesh, p.phase, 0.7);
        } else {
          // Stroll along the sidewalk; turn at random.
          if (Math.random() < dt * 0.15) p.heading += SB.rand(-0.9, 0.9);
          var nx = p.x + Math.sin(p.heading) * p.speed * dt;
          var nz = p.z + Math.cos(p.heading) * p.speed * dt;
          var pos = { x: nx, z: nz };
          var blocked = false;
          for (var i = 0; i < SB.City.colliders.length; i++) {
            if (SB.pushOutOfBox(pos, 0.6, SB.City.colliders[i])) { blocked = true; break; }
          }
          if (blocked) p.heading += Math.PI / 2;
          p.x = pos.x; p.z = pos.z;
          p.phase += dt * p.speed * 3;
          SB.animateWalk(p.mesh, p.phase, 0.35);
        }
        SB.City.clampToCity(p, 3);
        p.mesh.position.set(p.x, 0, p.z);
        p.mesh.rotation.y = p.heading;
      });
    },
    // Find the closest living pedestrian within range and roughly in front of a heading.
    nearestInFront: function (x, z, heading, maxD, maxAngle) {
      var best = null, bd = maxD;
      this.list.forEach(function (p) {
        if (p.health <= 0) return;
        var d = SB.dist2d(x, z, p.x, p.z);
        if (d > bd) return;
        var ang = Math.atan2(p.x - x, p.z - z);
        var diff = Math.abs(ang - heading);
        if (diff > Math.PI) diff = Math.PI * 2 - diff;
        if (diff < maxAngle) { bd = d; best = p; }
      });
      return best;
    },
  };
})();
