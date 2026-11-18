// Small math and DOM helpers shared by every Solmar Bay module.
(function () {
  'use strict';
  SB.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  SB.lerp = function (a, b, t) { return a + (b - a) * t; };
  SB.rand = function (a, b) { return a + Math.random() * (b - a); };
  SB.randInt = function (a, b) { return Math.floor(SB.rand(a, b + 1)); };
  SB.pick = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };
  SB.dist2d = function (ax, az, bx, bz) { var dx = ax - bx, dz = az - bz; return Math.sqrt(dx * dx + dz * dz); };
  SB.angleLerp = function (a, b, t) {
    var d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  };
  SB.el = function (id) { return document.getElementById(id); };
  SB.fmtCash = function (n) { return '$' + Math.round(n).toLocaleString('en-US'); };
  SB.fmtTime = function (sec) {
    sec = Math.max(0, Math.ceil(sec));
    return Math.floor(sec / 60) + ':' + ('0' + (sec % 60)).slice(-2);
  };
  // Point-in-AABB test used by collisions (x/z plane, y ignored).
  SB.pointInBox = function (x, z, box) {
    return x > box.x - box.hw && x < box.x + box.hw && z > box.z - box.hd && z < box.z + box.hd;
  };
  // Push a circle (radius r) out of an AABB; returns true if a push happened.
  SB.pushOutOfBox = function (pos, r, box) {
    var cx = SB.clamp(pos.x, box.x - box.hw, box.x + box.hw);
    var cz = SB.clamp(pos.z, box.z - box.hd, box.z + box.hd);
    var dx = pos.x - cx, dz = pos.z - cz;
    var d2 = dx * dx + dz * dz;
    if (d2 >= r * r) return false;
    if (d2 > 0.0001) {
      var d = Math.sqrt(d2);
      pos.x = cx + dx / d * r;
      pos.z = cz + dz / d * r;
    } else {
      // Centre inside the box: push out along the smallest penetration axis.
      var px = box.hw + r - Math.abs(pos.x - box.x);
      var pz = box.hd + r - Math.abs(pos.z - box.z);
      if (px < pz) pos.x = box.x + (pos.x >= box.x ? box.hw + r : -(box.hw + r));
      else pos.z = box.z + (pos.z >= box.z ? box.hd + r : -(box.hd + r));
    }
    return true;
  };
})();
