// HUD: cash, health, wanted stars, mission tracker, speedometer, clock,
// toasts and the circular canvas minimap with live blips.
(function () {
  'use strict';
  var toastTimer = null;

  SB.HUD = {
    show: function () { SB.el('hud').classList.remove('hidden'); },
    hide: function () { SB.el('hud').classList.add('hidden'); },

    toast: function (title, sub) {
      SB.el('toast').textContent = title || '';
      SB.el('toastSub').textContent = sub || '';
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(function () {
        SB.el('toast').textContent = '';
        SB.el('toastSub').textContent = '';
      }, 3400);
    },

    setHint: function (text) { SB.el('hint').textContent = text || ''; },

    update: function (state) {
      SB.el('cash').textContent = SB.fmtCash(SB.Player.cash);
      SB.el('healthFill').style.width = SB.clamp(SB.Player.health, 0, 100) + '%';
      SB.el('armorLabel').textContent = 'Health ' + Math.max(0, Math.round(SB.Player.health)) +
        (state.inCar ? '   |   Car ' + Math.max(0, Math.min(100, Math.round(state.carHealth))) + '%' : '');
      SB.el('ammoLabel').textContent = 'Pistol ammo ' + SB.Player.ammo + ' / ' + SB.Player.ammoReserve;
      // Wanted stars.
      var stars = '';
      for (var i = 0; i < 5; i++) stars += i < state.wanted ? '\u2605' : '<span class="off">\u2605</span>';
      SB.el('stars').innerHTML = stars;
      SB.el('wantedLabel').textContent = state.wanted > 0 ?
        (state.wanted >= 3 ? 'SOLMAR BAY POLICE IN PURSUIT' : 'WANTED - LOSE THE COPS') : '';
      // Mission tracker.
      var tr = SB.Missions.trackerText();
      var box = SB.el('missionBox');
      if (state.started) {
        box.classList.remove('hidden');
        SB.el('missionTitle').textContent = tr.title;
        SB.el('missionText').textContent = tr.text;
        SB.el('missionTimer').textContent = tr.timer > 0 ? 'Time left: ' + SB.fmtTime(tr.timer) : '';
      } else box.classList.add('hidden');
      // Speedometer.
      var sp = SB.el('speedo');
      if (state.inCar) {
        sp.classList.remove('hidden');
        sp.innerHTML = Math.round(Math.abs(state.speed) * 2.2) + '<small>mph &middot; ' + (state.carName || 'car') + '</small>';
      } else sp.classList.add('hidden');
      SB.el('crosshair').classList.toggle('hidden', state.inCar);
      // Clock: in-game time from the day timer.
      var mins = SB.CFG.dayStartHour * 60 + (state.dayTime / SB.CFG.dayLengthSec) * 24 * 60;
      var hh = Math.floor(mins / 60) % 24, mm = Math.floor(mins % 60);
      SB.el('clock').innerHTML = ('0' + hh).slice(-2) + ':' + ('0' + mm).slice(-2) + '<br>Solmar Bay';
      this.drawMinimap(state);
    },

    // Top-down minimap: roads, buildings, player arrow, mission and police blips.
    drawMinimap: function (state) {
      var cv = SB.el('minimap');
      var g = cv.getContext('2d');
      var S = 180, half = SB.CFG.cityHalf;
      function toMap(x, z) { return [(x + half) / (half * 2) * S, (z + half) / (half * 2) * S]; }
      g.clearRect(0, 0, S, S);
      g.fillStyle = '#1b4d3e'; g.fillRect(0, 0, S, S);
      // Water on the west edge.
      g.fillStyle = '#1e7fa8'; g.fillRect(0, 0, 8, S);
      g.fillStyle = '#e8d29a'; g.fillRect(8, 0, 5, S);
      // Roads.
      g.strokeStyle = '#3a3f46'; g.lineWidth = 5;
      SB.ROAD_LINES.forEach(function (c) {
        var p = toMap(c, 0);
        g.beginPath(); g.moveTo(p[0], 0); g.lineTo(p[0], S); g.stroke();
        var q = toMap(0, c);
        g.beginPath(); g.moveTo(0, q[1]); g.lineTo(S, q[1]); g.stroke();
      });
      // Buildings.
      g.fillStyle = '#8a7a5a';
      SB.City.buildings.forEach(function (b) {
        var p = toMap(b.x, b.z);
        var w = Math.max(2, b.w / (half * 2) * S), d = Math.max(2, b.d / (half * 2) * S);
        g.fillRect(p[0] - w / 2, p[1] - d / 2, w, d);
      });
      // Mission target blip (yellow diamond).
      var tgt = SB.Missions.missionTargetPos();
      if (tgt) {
        var tp = toMap(tgt.x, tgt.z);
        g.fillStyle = '#ffd54a';
        g.beginPath();
        g.moveTo(tp[0], tp[1] - 7); g.lineTo(tp[0] + 6, tp[1]); g.lineTo(tp[0], tp[1] + 7); g.lineTo(tp[0] - 6, tp[1]);
        g.closePath(); g.fill();
        g.strokeStyle = '#000'; g.lineWidth = 1; g.stroke();
      }
      // Police blips (red/blue dots).
      g.fillStyle = '#ff1744';
      SB.Police.cars.forEach(function (c) {
        var p = toMap(c.x, c.z);
        g.beginPath(); g.arc(p[0], p[1], 3.5, 0, Math.PI * 2); g.fill();
      });
      // Player arrow (white triangle, rotated by heading).
      var pp = toMap(state.playerX, state.playerZ);
      g.save();
      g.translate(pp[0], pp[1]);
      g.rotate(-state.heading);
      g.fillStyle = '#ffffff';
      g.strokeStyle = '#000'; g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(0, -8); g.lineTo(5.5, 6); g.lineTo(-5.5, 6);
      g.closePath(); g.fill(); g.stroke();
      g.restore();
    },
  };
})();
