// Vehicles: car construction, player driving physics and ambient traffic.
// Cars are low-poly boxes with cabins, wheels and lights, built in code.
(function () {
  'use strict';

  // Build a car mesh. opts: {color, police, taxi, sport}
  SB.makeCar = function (opts) {
    opts = opts || {};
    var color = opts.police ? 0xffffff : (opts.color !== undefined ? opts.color : 0xd84315);
    var group = new THREE.Group();
    var bodyMat = new THREE.MeshLambertMaterial({ color: color });
    var glassMat = new THREE.MeshPhongMaterial({ color: 0x1a2a3a, shininess: 120 });
    var body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.4), bodyMat);
    body.position.y = 0.55;
    body.castShadow = true;
    group.add(body);
    var cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 2.2), glassMat);
    cabin.position.set(0, 1.12, -0.2);
    cabin.castShadow = true;
    group.add(cabin);
    // Bumpers.
    var bumpMat = new THREE.MeshLambertMaterial({ color: 0x263238 });
    var fb = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.22, 0.3), bumpMat);
    fb.position.set(0, 0.35, 2.25); group.add(fb);
    var rb = fb.clone(); rb.position.z = -2.25; group.add(rb);
    // Headlights and taillights.
    var hlMat = new THREE.MeshBasicMaterial({ color: 0xfff9c4 });
    [-0.7, 0.7].forEach(function (x) {
      var hl = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.08), hlMat);
      hl.position.set(x, 0.62, 2.21); group.add(hl);
      var tl = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.08),
        new THREE.MeshBasicMaterial({ color: 0xff1744 }));
      tl.position.set(x, 0.62, -2.21); group.add(tl);
    });
    if (opts.police) {
      var bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.18, 0.5),
        new THREE.MeshLambertMaterial({ color: 0x111111 }));
      bar.position.set(0, 1.5, -0.2); group.add(bar);
      var red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.5),
        new THREE.MeshBasicMaterial({ color: 0xff1744 }));
      red.position.set(-0.32, 1.52, -0.2); group.add(red);
      var blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.5),
        new THREE.MeshBasicMaterial({ color: 0x2979ff }));
      blue.position.set(0.32, 1.52, -0.2); group.add(blue);
      group.userData.lightRed = red; group.userData.lightBlue = blue;
      var stripe = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.3, 4.42),
        new THREE.MeshLambertMaterial({ color: 0x0d47a1 }));
      stripe.position.y = 0.55; group.add(stripe);
    }
    if (opts.taxi) {
      var sign = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.25, 0.5),
        new THREE.MeshLambertMaterial({ color: 0xffd54a }));
      sign.position.set(0, 1.55, -0.2); group.add(sign);
    }
    // Wheels.
    var wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 12);
    var wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    var wheels = [];
    [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]].forEach(function (p) {
      var w = new THREE.Mesh(wheelGeo, wheelMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(p[0], 0.38, p[1]);
      w.castShadow = true;
      group.add(w);
      wheels.push(w);
    });
    group.userData.wheels = wheels;
    group.userData.body = body;
    return group;
  };

  // One drivable / traffic car: mesh + state.
  SB.Car = function (scene, opts) {
    this.scene = scene;
    this.mesh = SB.makeCar(opts);
    this.mesh.position.y = 0;
    scene.add(this.mesh);
    this.speed = 0;
    this.heading = opts.heading || 0;
    this.steer = 0;
    this.health = 100;
    this.isPolice = !!opts.police;
    this.isPlayerCar = false;
    this.dead = false;
    this.smokeTimer = 0;
    this.updateMesh();
  };
  SB.Car.prototype.updateMesh = function () {
    this.mesh.position.x = this.x || 0;
    this.mesh.position.z = this.z || 0;
    this.mesh.rotation.y = this.heading;
    var spin = this.speed * 0.4;
    this.mesh.userData.wheels.forEach(function (w) { w.rotation.x += spin * 0.016; });
  };
  SB.Car.prototype.setPos = function (x, z, heading) {
    this.x = x; this.z = z; this.heading = heading;
    this.updateMesh();
  };
  // Simple arcade driving: throttle, steering, braking, building collision.
  SB.Car.prototype.drive = function (input, dt) {
    var cfg = SB.CFG;
    var accel = 0;
    if (input.up) accel += cfg.carAccel;
    if (input.down) accel -= (this.speed > 0.5 ? cfg.carBrake : cfg.carAccel * 0.6);
    if (input.brake) accel -= Math.sign(this.speed) * cfg.carBrake;
    this.speed += accel * dt;
    this.speed = SB.clamp(this.speed, -cfg.carReverseMax, cfg.carMaxSpeed);
    if (!input.up && !input.down) this.speed -= this.speed * 1.4 * dt;
    if (Math.abs(this.speed) < 0.05) this.speed = 0;
    var targetSteer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    this.steer = SB.lerp(this.steer, targetSteer, SB.clamp(dt * 8, 0, 1));
    var dir = this.speed >= 0 ? 1 : -1;
    this.heading += this.steer * cfg.carTurn * dir * SB.clamp(Math.abs(this.speed) / 12, 0, 1) * dt;
    var nx = this.x + Math.sin(this.heading) * this.speed * dt;
    var nz = this.z + Math.cos(this.heading) * this.speed * dt;
    var pos = { x: nx, z: nz };
    var hit = false;
    for (var i = 0; i < SB.City.colliders.length; i++) {
      if (SB.pushOutOfBox(pos, 2.2, SB.City.colliders[i])) hit = true;
    }
    if (hit && Math.abs(this.speed) > 8) {
      SB.Audio.crash();
      this.speed *= 0.45;
      this.health -= 6;
      SB.Game.damageFlash();
    }
    SB.City.clampToCity(pos, 6);
    this.x = pos.x; this.z = pos.z;
    this.updateMesh();
    return hit;
  };
  SB.Car.prototype.damage = function (amount) {
    this.health -= amount;
    if (this.health <= 0 && !this.dead) {
      this.dead = true;
      this.speed = 0;
      SB.Audio.crash();
    }
  };

  // Ambient traffic: cars looping around the road grid.
  SB.Traffic = {
    cars: [],
    init: function (scene, count) {
      this.cars = [];
      for (var i = 0; i < count; i++) this.spawn(scene, true);
    },
    spawn: function (scene, randomPos) {
      var line = SB.pick(SB.ROAD_LINES);
      var along = SB.rand(-170, 170);
      var horizontal = Math.random() < 0.5;
      var x = horizontal ? along : line;
      var z = horizontal ? line : along;
      var heading = horizontal ? (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (Math.random() < 0.5 ? 0 : Math.PI);
      var car = new SB.Car(scene, { color: SB.pick(SB.CAR_COLORS), heading: heading });
      car.setPos(x, z, heading);
      car.cruise = SB.rand(9, 15);
      car.lane = line;
      car.horizontal = horizontal;
      this.cars.push(car);
      return car;
    },
    // Follow the current road; at an intersection sometimes turn.
    update: function (dt, playerCar) {
      var self = this;
      this.cars.forEach(function (car) {
        if (car.dead) return;
        // Slow down if another car is close ahead.
        var slow = false;
        self.cars.forEach(function (other) {
          if (other === car || other.dead) return;
          var d = SB.dist2d(car.x, car.z, other.x, other.z);
          if (d < 9 && d > 0.1) {
            var fx = Math.sin(car.heading), fz = Math.cos(car.heading);
            var dot = (other.x - car.x) * fx + (other.z - car.z) * fz;
            if (dot > 0) slow = true;
          }
        });
        if (playerCar && SB.dist2d(car.x, car.z, playerCar.x, playerCar.z) < 9) {
          var fx2 = Math.sin(car.heading), fz2 = Math.cos(car.heading);
          var dot2 = (playerCar.x - car.x) * fx2 + (playerCar.z - car.z) * fz2;
          if (dot2 > 0) slow = true;
        }
        var target = slow ? 0 : car.cruise;
        car.speed = SB.lerp(car.speed, target, SB.clamp(dt * 1.5, 0, 1));
        car.x += Math.sin(car.heading) * car.speed * dt;
        car.z += Math.cos(car.heading) * car.speed * dt;
        // Wrap around the map edge; occasionally turn at an intersection.
        if (Math.abs(car.x) > 178 || Math.abs(car.z) > 178) {
          car.setPos(SB.pick(SB.ROAD_LINES), SB.rand(-160, 160), Math.random() < 0.5 ? 0 : Math.PI / 2);
          car.horizontal = Math.abs(car.heading) > 1;
        }
        // Intersection turn: snap to nearest crossing when close.
        if (Math.random() < dt * 0.12) {
          var nx = SB.City.nearestRoad(car.x, car.z);
          if (SB.dist2d(car.x, car.z, nx, car.z) < 3 || SB.dist2d(car.x, car.z, car.x, nx) < 3) {
            car.heading += (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2;
            car.horizontal = !car.horizontal;
          }
        }
        car.updateMesh();
      });
    },
  };

  // Parked stealable cars scattered around the city.
  SB.ParkedCars = {
    cars: [],
    init: function (scene) {
      this.cars = [];
      var spots = [
        { x: 6, z: -48, h: 0 }, { x: -42, z: 6, h: Math.PI / 2 }, { x: 54, z: -6, h: -Math.PI / 2 },
        { x: -6, z: 54, h: Math.PI }, { x: 102, z: 42, h: Math.PI / 2 }, { x: -102, z: -42, h: 0 },
        { x: 42, z: 102, h: -Math.PI / 2 }, { x: -54, z: -102, h: Math.PI }, { x: 150, z: -6, h: 0 },
        { x: -150, z: 54, h: Math.PI / 2 }, { x: 6, z: 150, h: 0 }, { x: -42, z: -150, h: Math.PI },
      ];
      var self = this;
      spots.forEach(function (s, i) {
        var car = new SB.Car(scene, { color: SB.CAR_COLORS[i % SB.CAR_COLORS.length], heading: s.h });
        car.setPos(s.x, s.z, s.h);
        car.parked = true;
        self.cars.push(car);
      });
    },
    nearest: function (x, z, maxD) {
      var best = null, bd = maxD;
      this.cars.forEach(function (c) {
        if (c.dead) return;
        var d = SB.dist2d(x, z, c.x, c.z);
        if (d < bd) { bd = d; best = c; }
      });
      return best;
    },
  };
})();
