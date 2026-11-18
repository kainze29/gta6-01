// Solmar Bay HUD: cash, health, car, ammo, wanted stars, mission tracker,
// speedometer, clock, district name, prompts, toasts, and the minimap.
// All names, places and characters are original inventions for this game.
(function () {
  'use strict';
  var SB = window.SB || {};
  window.SB = SB;

  // World units across the whole map, used to scale the minimap.
  var MAP_SPAN = 400;
  var MAP_R = 92;

  SB.HUD = {
    els: null,
    toastTimer: null,
    mapCtx: null,

    init: function () {
      var g = function (id) { return document.getElementById(id); };
      this.els = {
        hud: g('hud'),
        cash: g('cashValue'),
        healthFill: g('healthFill'),
        healthValue: g('healthValue'),
        carRow: g('carRow'),
        carFill: g('carFill'),
        carValue: g('carValue'),
        ammo: g('ammoValue'),
        stars: g('stars'),
        wantedLabel: g('wantedLabel'),
        clock: g('clockValue'),
        district: g('districtValue'),
        missionTitle: g('missionTitle'),
        missionText: g('missionText'),
        missionTimer: g('missionTimer'),
        speedo: g('speedo'),
        speed: g('speedValue'),
        minimap: g('minimap'),
        prompt: g('prompt'),
        promptText: g('promptText'),
        toast: g('toast'),
        toastTitle: g('toastTitle'),
        toastSub: g('toastSub'),
        damageFlash: g('damageFlash'),
        debug: g('debugState'),
      };
      this.mapCtx = this.els.minimap.getContext('2d');
      // The HUD stays hidden behind the title screen; beginPlay shows it.
    },

    // One frame of HUD: reads the player, the police and the missions directly.
    update: function (view) {
      var e = this.els;
      if (!e) return;
      var p = SB.Player;
      e.cash.textContent = SB.fmtCash(p.cash);
      var hp = SB.clamp(p.health, 0, SB.CFG.playerHealthMax);
      e.healthFill.style.width = (hp / SB.CFG.playerHealthMax * 100) + '%';
      e.healthValue.textContent = String(Math.round(hp));
      if (p.inCar) {
        e.carRow.style.visibility = 'visible';
        var ch = SB.clamp(p.inCar.health, 0, 100);
        e.carFill.style.width = ch + '%';
        e.carValue.textContent = Math.round(ch) + '%';
      } else {
        e.carRow.style.visibility = 'hidden';
      }
      e.ammo.textContent = p.ammo + ' / ' + p.ammoReserve;

      var wanted = SB.Police.wanted;
      var stars = e.stars.children;
      for (var i = 0; i < stars.length; i++) {
        stars[i].className = 'star' + (i < wanted ? ' lit' : '');
      }
      e.wantedLabel.textContent = wanted > 0 ? ('WANTED: ' + wanted + (wanted === 1 ? ' STAR' : ' STARS')) : '';

      var hh = Math.floor(view.hour);
      var mm = Math.floor((view.hour - hh) * 60);
      e.clock.textContent = (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
      e.district.textContent = view.district;

      var t = SB.Missions.trackerText();
      e.missionTitle.textContent = t.title;
      e.missionText.textContent = t.text;
      if (t.timer > 0) {
        e.missionTimer.textContent = SB.fmtTime(t.timer);
        e.missionTimer.className = t.timer < 30 ? 'low' : '';
      } else {
        e.missionTimer.textContent = '';
        e.missionTimer.className = '';
      }

      if (p.inCar) {
        e.speedo.style.visibility = 'visible';
        e.speed.textContent = String(Math.round(Math.abs(p.inCar.speed) * 2.237));
      } else {
        e.speedo.style.visibility = 'hidden';
      }

      this.drawMinimap();
    },

    // Circular minimap: roads, towers, the player, patrol cars, the job marker.
    drawMinimap: function () {
      var ctx = this.mapCtx;
      if (!ctx) return;
      var p = SB.Player;
      var size = 184, half = size / 2;
      var scale = size / MAP_SPAN;
      var toX = function (x) { return half + (x - p.x) * scale; };
      var toY = function (z) { return half + (z - p.z) * scale; };

      ctx.clearRect(0, 0, size, size);
      ctx.save();
      ctx.beginPath();
      ctx.arc(half, half, MAP_R, 0, Math.PI * 2);
      ctx.clip();

      // Ground.
      ctx.fillStyle = '#12303e';
      ctx.fillRect(0, 0, size, size);

      // Roads: the grid lines of Solmar Bay.
      ctx.strokeStyle = '#3d5a6b';
      ctx.lineWidth = 5;
      SB.ROAD_LINES.forEach(function (c) {
        ctx.beginPath(); ctx.moveTo(toX(c), 0); ctx.lineTo(toX(c), size); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, toY(c)); ctx.lineTo(size, toY(c)); ctx.stroke();
      });
      ctx.strokeStyle = '#8fb4c7';
      ctx.lineWidth = 1;
      SB.ROAD_LINES.forEach(function (c) {
        ctx.beginPath(); ctx.moveTo(toX(c), 0); ctx.lineTo(toX(c), size); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, toY(c)); ctx.lineTo(size, toY(c)); ctx.stroke();
      });

      // Towers as small blocks, sized by their footprint.
      ctx.fillStyle = '#5d7d90';
      SB.City.buildings.forEach(function (b) {
        var bx = toX(b.x), by = toY(b.z);
        if (bx < -4 || bx > size + 4 || by < -4 || by > size + 4) return;
        var bw = Math.max(2, b.w * scale), bh = Math.max(2, b.d * scale);
        ctx.fillRect(bx - bw / 2, by - bh / 2, bw, bh);
      });

      // Job marker: a gold diamond on the objective.
      var target = SB.Missions.missionTargetPos();
      if (target) {
        var tx = toX(target.x), ty = toY(target.z);
        ctx.fillStyle = '#ffd54a';
        ctx.beginPath();
        ctx.moveTo(tx, ty - 6); ctx.lineTo(tx + 5, ty); ctx.lineTo(tx, ty + 6); ctx.lineTo(tx - 5, ty);
        ctx.closePath(); ctx.fill();
      }

      // Patrol cars: red dots with a blue ring.
      SB.Police.cops.forEach(function (cop) {
        var cx = toX(cop.x), cy = toY(cop.z);
        ctx.fillStyle = '#ff5252';
        ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#4d8dff';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.stroke();
      });

      // The player: a white arrow pointing where they face.
      // Map north is -z (up); the arrow starts pointing down (+z, heading 0).
      var heading = p.inCar ? p.inCar.heading : p.heading;
      ctx.save();
      ctx.translate(half, half);
      ctx.rotate(-heading);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(0, 8); ctx.lineTo(5, -6); ctx.lineTo(-5, -6);
      ctx.closePath(); ctx.fill();
      ctx.restore();

      ctx.restore();
    },

    // A big centre message that fades away on its own.
    toast: function (title, sub) {
      var e = this.els;
      if (!e) return;
      e.toastTitle.textContent = title;
      e.toastSub.textContent = sub || '';
      e.toast.classList.add('show');
      var self = this;
      if (this.toastTimer) clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(function () {
        e.toast.classList.remove('show');
      }, 3500);
    },

    // The contextual action hint above the bottom bar.
    showPrompt: function (text) {
      var e = this.els;
      if (!e) return;
      e.promptText.textContent = text;
      e.prompt.style.display = 'block';
    },

    hidePrompt: function () {
      var e = this.els;
      if (!e) return;
      e.prompt.style.display = 'none';
    },

    // A red vignette flash for taking damage.
    flashDamage: function () {
      var e = this.els;
      if (!e) return;
      e.damageFlash.style.opacity = '1';
      setTimeout(function () { e.damageFlash.style.opacity = '0'; }, 140);
    },

    // One line of debug state, kept in the DOM for headless checks.
    setDebug: function (text) {
      var e = this.els;
      if (!e) return;
      e.debug.textContent = text;
    },
  };
})();
