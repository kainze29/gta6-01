// Solmar Bay city: procedural sun-soaked coastal city built from three.js geometry.
// Roads on a grid, towers with lit windows, palm trees, a beach and animated water.
(function () {
  'use strict';

  function makeCanvas(w, h, draw) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    var tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;
    return tex;
  }

  // Building facade: warm plaster with a grid of windows, some lit.
  function buildingTexture(base, lit) {
    return makeCanvas(128, 256, function (g, w, h) {
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(0,0,0,0.12)';
      for (var y = 0; y < h; y += 16) g.fillRect(0, y, w, 2);
      for (var x = 8; x < w; x += 22) {
        for (var yy = 12; yy < h - 8; yy += 28) {
          var on = Math.random() < lit;
          g.fillStyle = on ? '#ffd97a' : 'rgba(20,40,70,0.75)';
          g.fillRect(x, yy, 13, 17);
        }
      }
    });
  }

  // Road surface with dashed centre line, drawn along the plane's length.
  function roadTexture() {
    return makeCanvas(128, 128, function (g, w, h) {
      g.fillStyle = '#2b2f36'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#f7d774';
      g.fillRect(w / 2 - 2, 0, 4, 26);
      g.fillRect(w / 2 - 2, 64, 4, 26);
      g.fillStyle = 'rgba(255,255,255,0.5)';
      g.fillRect(4, 0, 3, h); g.fillRect(w - 7, 0, 3, h);
    });
  }

  SB.City = {
    colliders: [],   // {x, z, hw, hd} building footprints
    buildings: [],   // meshes, for the minimap
    water: null,
    sun: null,

    build: function (scene) {
      var half = SB.CFG.cityHalf;
      var self = this;

      // Sky, fog, sun.
      scene.background = new THREE.Color(0x87c5e8);
      scene.fog = new THREE.Fog(0x9fd0e8, 220, 620);
      var hemi = new THREE.HemisphereLight(0xbfe3ff, 0x8a7a5a, 0.95);
      scene.add(hemi);
      var sun = new THREE.DirectionalLight(0xfff2cc, 1.35);
      sun.position.set(120, 180, 60);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      sun.shadow.camera.left = -220; sun.shadow.camera.right = 220;
      sun.shadow.camera.top = 220; sun.shadow.camera.bottom = -220;
      sun.shadow.camera.far = 600;
      scene.add(sun);
      this.sun = sun;

      // Ground: grass-green base under the whole map.
      var ground = new THREE.Mesh(
        new THREE.PlaneGeometry(half * 2 + 260, half * 2 + 260),
        new THREE.MeshLambertMaterial({ color: 0x7fae5a }));
      ground.rotation.x = -Math.PI / 2;
      ground.position.set(0, -0.05, 0);
      ground.receiveShadow = true;
      scene.add(ground);

      // Beach strip + water on the west edge (x < -190).
      var sand = new THREE.Mesh(
        new THREE.PlaneGeometry(70, half * 2 + 260),
        new THREE.MeshLambertMaterial({ color: 0xe8d29a }));
      sand.rotation.x = -Math.PI / 2;
      sand.position.set(-half - 35, 0, 0);
      sand.receiveShadow = true;
      scene.add(sand);
      var water = new THREE.Mesh(
        new THREE.PlaneGeometry(300, half * 2 + 260),
        new THREE.MeshPhongMaterial({ color: 0x1e7fa8, transparent: true, opacity: 0.82, shininess: 120 }));
      water.rotation.x = -Math.PI / 2;
      water.position.set(-half - 190, 0.4, 0);
      scene.add(water);
      this.water = water;

      // Roads: dark strips along every grid line, both directions.
      var roadTex = roadTexture();
      roadTex.wrapS = roadTex.wrapT = THREE.RepeatWrapping;
      var roadMat = new THREE.MeshLambertMaterial({ map: roadTex });
      var roadLen = half * 2 + 24;
      SB.ROAD_LINES.forEach(function (c) {
        var rx = new THREE.Mesh(new THREE.PlaneGeometry(12, roadLen), roadMat.clone());
        rx.material.map = roadTex.clone();
        rx.material.map.repeat.set(1, roadLen / 12);
        rx.material.map.needsUpdate = true;
        rx.rotation.x = -Math.PI / 2;
        rx.position.set(c, 0.02, 0);
        rx.receiveShadow = true;
        scene.add(rx);
        var rz = new THREE.Mesh(new THREE.PlaneGeometry(12, roadLen), roadMat.clone());
        rz.material.map = roadTex.clone();
        rz.material.map.repeat.set(1, roadLen / 12);
        rz.material.map.needsUpdate = true;
        rz.rotation.x = -Math.PI / 2;
        rz.rotation.z = Math.PI / 2;
        rz.position.set(0, 0.02, c);
        rz.receiveShadow = true;
        scene.add(rz);
      });

      // Sidewalks: light strips flanking each road.
      var walkMat = new THREE.MeshLambertMaterial({ color: 0xb8b0a0 });
      SB.ROAD_LINES.forEach(function (c) {
        [-9, 9].forEach(function (off) {
          var sx = new THREE.Mesh(new THREE.PlaneGeometry(5, roadLen), walkMat);
          sx.rotation.x = -Math.PI / 2;
          sx.position.set(c + off, 0.04, 0);
          sx.receiveShadow = true;
          scene.add(sx);
          var sz = new THREE.Mesh(new THREE.PlaneGeometry(5, roadLen), walkMat);
          sz.rotation.x = -Math.PI / 2;
          sz.rotation.z = Math.PI / 2;
          sz.position.set(0, 0.04, c + off);
          sz.receiveShadow = true;
          scene.add(sz);
        });
      });

      // Buildings: fill each block between roads with 1-4 towers.
      var palette = ['#e8b04b', '#d98a6a', '#7fb3d5', '#a8c686', '#c98bb9', '#f2e3c6', '#8fa3b8', '#e07856'];
      var texCache = {};
      function facade(base) {
        if (!texCache[base]) texCache[base] = buildingTexture(base, 0.35);
        return texCache[base];
      }
      var blockCentres = [];
      for (var i = 0; i < SB.ROAD_LINES.length - 1; i++) {
        for (var j = 0; j < SB.ROAD_LINES.length - 1; j++) {
          var cx = (SB.ROAD_LINES[i] + SB.ROAD_LINES[i + 1]) / 2;
          var cz = (SB.ROAD_LINES[j] + SB.ROAD_LINES[j + 1]) / 2;
          blockCentres.push({ x: cx, z: cz });
        }
      }
      var downtown = function (x, z) { return Math.abs(x) < 60 && Math.abs(z) < 60; };
      blockCentres.forEach(function (b) {
        var n = downtown(b.x, b.z) ? SB.randInt(2, 4) : SB.randInt(1, 3);
        for (var k = 0; k < n; k++) {
          var w = SB.rand(10, 18), d = SB.rand(10, 18);
          var h = downtown(b.x, b.z) ? SB.rand(28, 78) : SB.rand(9, 30);
          var ox = SB.rand(-9, 9), oz = SB.rand(-9, 9);
          var bx = b.x + ox, bz = b.z + oz;
          if (Math.abs(bx) > half - 12 || Math.abs(bz) > half - 12) return;
          var base = SB.pick(palette);
          var mat = new THREE.MeshLambertMaterial({ map: facade(base) });
          var mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
          mesh.position.set(bx, h / 2, bz);
          mesh.castShadow = true; mesh.receiveShadow = true;
          scene.add(mesh);
          self.colliders.push({ x: bx, z: bz, hw: w / 2 + 0.4, hd: d / 2 + 0.4 });
          self.buildings.push({ x: bx, z: bz, w: w, d: d, h: h });
          // Rooftop box for taller towers.
          if (h > 40) {
            var roof = new THREE.Mesh(new THREE.BoxGeometry(w * 0.4, 4, d * 0.4),
              new THREE.MeshLambertMaterial({ color: 0x5d6d7e }));
            roof.position.set(bx, h + 2, bz);
            scene.add(roof);
          }
        }
        // A palm or two per block, on the corners.
        if (Math.random() < 0.8) self.addPalm(scene, b.x + SB.rand(-14, 14), b.z + SB.rand(-14, 14));
      });

      // Palm rows along the beach and the main strip.
      for (var p = -170; p <= 170; p += 24) {
        self.addPalm(scene, -half + 8, p);
        if (Math.random() < 0.6) self.addPalm(scene, -half + 26, p + 12);
      }
      for (var q = -140; q <= 140; q += 34) {
        self.addPalm(scene, q, -half + 8);
      }

      // Streetlights along the central avenue.
      var poleMat = new THREE.MeshLambertMaterial({ color: 0x37474f });
      var lampMat = new THREE.MeshBasicMaterial({ color: 0xfff9c4 });
      SB.ROAD_LINES.forEach(function (c) {
        for (var s = -160; s <= 160; s += 48) {
          var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 7, 6), poleMat);
          pole.position.set(c + 7.5, 3.5, s);
          scene.add(pole);
          var lamp = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), lampMat);
          lamp.position.set(c + 7.5, 7.1, s);
          scene.add(lamp);
        }
      });

      // Central plaza: fountain ring at the city centre.
      var plaza = new THREE.Mesh(new THREE.CylinderGeometry(14, 14, 0.6, 24),
        new THREE.MeshLambertMaterial({ color: 0xcfd8dc }));
      plaza.position.set(0, 0.3, 0);
      plaza.receiveShadow = true;
      scene.add(plaza);
      var fountain = new THREE.Mesh(new THREE.CylinderGeometry(4, 5, 1.6, 16),
        new THREE.MeshPhongMaterial({ color: 0x4fc3f7, shininess: 90 }));
      fountain.position.set(0, 1.2, 0);
      scene.add(fountain);
      this.colliders.push({ x: 0, z: 0, hw: 14, hd: 14 });

      // Hideout marker building (Palm Heights) and docks (Old Docks): simple props.
      this.addLandmark(scene, 120, -120, 0x2e7d32, 'HIDEOUT');
      this.addLandmark(scene, -120, 120, 0x6d4c41, 'DOCKS');
    },

    addPalm: function (scene, x, z) {
      this.colliders.push({ x: x, z: z, hw: 0.7, hd: 0.7 });
      var trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.45, 7, 6),
        new THREE.MeshLambertMaterial({ color: 0x8d6e63 }));
      trunk.position.set(x, 3.5, z);
      trunk.castShadow = true;
      scene.add(trunk);
      var leafMat = new THREE.MeshLambertMaterial({ color: 0x2e9e4f });
      for (var i = 0; i < 6; i++) {
        var leaf = new THREE.Mesh(new THREE.ConeGeometry(1.1, 4.5, 4), leafMat);
        var a = i / 6 * Math.PI * 2;
        leaf.position.set(x + Math.cos(a) * 1.6, 7.2, z + Math.sin(a) * 1.6);
        leaf.rotation.z = Math.cos(a) * 1.1;
        leaf.rotation.x = -Math.sin(a) * 1.1;
        scene.add(leaf);
      }
    },

    addLandmark: function (scene, x, z, color, label) {
      var base = new THREE.Mesh(new THREE.BoxGeometry(16, 3, 16),
        new THREE.MeshLambertMaterial({ color: color }));
      base.position.set(x, 1.5, z);
      base.castShadow = true; base.receiveShadow = true;
      scene.add(base);
      this.colliders.push({ x: x, z: z, hw: 8, hd: 8 });
      var sign = new THREE.Mesh(new THREE.BoxGeometry(10, 2.2, 0.6),
        new THREE.MeshLambertMaterial({ color: 0xfff176 }));
      sign.position.set(x, 5.2, z);
      scene.add(sign);
    },

    // Keep a position inside the playable map.
    clampToCity: function (pos, margin) {
      var m = margin || 4;
      var half = SB.CFG.cityHalf;
      pos.x = SB.clamp(pos.x, -half + m, half - m);
      pos.z = SB.clamp(pos.z, -half + m, half - m);
    },

    // Nearest point on a road grid line (used to snap spawns onto streets).
    nearestRoad: function (x, z) {
      var best = SB.ROAD_LINES[0], bd = 1e9;
      SB.ROAD_LINES.forEach(function (c) {
        var d = Math.abs(x - c);
        if (d < bd) { bd = d; best = c; }
      });
      return best;
    },

    update: function (t) {
      if (this.water) this.water.material.opacity = 0.78 + Math.sin(t * 0.7) * 0.05;
    },
  };
})();
