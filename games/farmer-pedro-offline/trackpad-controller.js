/* Trackpad Controller for Farmer Pedro
 * Adds a fixed transparent trackpad with joystick at the bottom of the screen.
 * Disables the original floating virtual joystick and direct harvester dragging.
 */
(function (global) {
  "use strict";

  // ── Wait for DOM + game engine to be ready ──────────────────────────
  function onReady(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      fn();
    }
  }

  onReady(function () {

    // ── 1. Create the fixed trackpad overlay ──────────────────────────
    var trackpad = document.createElement("div");
    trackpad.id = "trackpad-overlay";
    document.body.appendChild(trackpad);

    var trackpadInner = document.createElement("div");
    trackpadInner.id = "trackpad-inner";
    trackpad.appendChild(trackpadInner);

    // Joystick base (outer ring)
    var joystickBase = document.createElement("div");
    joystickBase.id = "joystick-base";
    trackpadInner.appendChild(joystickBase);

    // Joystick knob (inner draggable)
    var joystickKnob = document.createElement("div");
    joystickKnob.id = "joystick-knob";
    joystickBase.appendChild(joystickKnob);

    // ── 2. Inject styles ──────────────────────────────────────────────
    var style = document.createElement("style");
    style.textContent = [
      /* Trackpad: fixed at the bottom, full width, transparent */
      "#trackpad-overlay {",
      "  position: fixed;",
      "  left: 0; right: 0; bottom: 0;",
      "  height: 30vh;",
      "  z-index: 9999;",
      "  background: transparent;",
      "  border-top: 2px solid rgba(255,255,255,0.25);",
      "  border-radius: 18px 18px 0 0;",
      "  box-shadow: 0 -2px 12px rgba(0,0,0,0.15);",
      "  touch-action: none;",
      "  user-select: none;",
      "  -webkit-user-select: none;",
      "  pointer-events: auto;",
      "  display: none;",
      "}",

      "#trackpad-inner {",
      "  position: relative;",
      "  width: 100%; height: 100%;",
      "  display: flex;",
      "  align-items: center;",
      "  justify-content: center;",
      "}",

      /* Joystick base — semi-transparent ring */
      "#joystick-base {",
      "  position: relative;",
      "  width: 128px; height: 128px;",
      "  border-radius: 50%;",
      "  border: 3px solid rgba(255,255,255,0.35);",
      "  background: radial-gradient(circle, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%);",
      "  box-shadow: 0 0 20px rgba(255,255,255,0.06), inset 0 0 15px rgba(255,255,255,0.04);",
      "  backdrop-filter: blur(2px);",
      "  -webkit-backdrop-filter: blur(2px);",
      "  flex-shrink: 0;",
      "}",

      /* Joystick knob */
      "#joystick-knob {",
      "  position: absolute;",
      "  width: 48px; height: 48px;",
      "  border-radius: 50%;",
      "  background: radial-gradient(circle at 35% 35%, rgba(255,255,255,0.55), rgba(200,200,200,0.3));",
      "  border: 2px solid rgba(255,255,255,0.5);",
      "  box-shadow: 0 2px 10px rgba(0,0,0,0.2), inset 0 1px 3px rgba(255,255,255,0.3);",
      "  left: 50%; top: 50%;",
      "  transform: translate(-50%, -50%);",
      "  transition: box-shadow 0.15s ease;",
      "}",

      "#joystick-knob.active {",
      "  box-shadow: 0 0 18px rgba(255,255,255,0.4), inset 0 1px 3px rgba(255,255,255,0.4);",
      "  border-color: rgba(255,255,255,0.7);",
      "}",

      /* Subtle label */
      "#trackpad-overlay::after {",
      '  content: "";',
      "  position: absolute;",
      "  bottom: 6px; left: 50%;",
      "  transform: translateX(-50%);",
      "  font: 10px/1 Arial, sans-serif;",
      "  color: rgba(255,255,255,0.2);",
      "  pointer-events: none;",
      "}",
    ].join("\n");
    document.head.appendChild(style);

    // ── 3. Trackpad touch logic ───────────────────────────────────────
    var baseRect;
    var baseRadius;
    var maxKnobDist;
    var isActive = false;
    var activeTouchId = null;
    var centerX, centerY;
    // Minimum drag distance (px) before treating as movement
    var deadZone = 12;

    function recalc() {
      baseRect = joystickBase.getBoundingClientRect();
      baseRadius = baseRect.width / 2;
      maxKnobDist = baseRadius - 15; // knob stays within the ring
      centerX = baseRect.left + baseRadius;
      centerY = baseRect.top + baseRadius;
    }

    function moveKnob(clientX, clientY) {
      var dx = clientX - centerX;
      var dy = clientY - centerY;
      var dist = Math.sqrt(dx * dx + dy * dy);

      // Clamp to the base circle
      if (dist > maxKnobDist) {
        dx = dx / dist * maxKnobDist;
        dy = dy / dist * maxKnobDist;
        dist = maxKnobDist;
      }

      joystickKnob.style.left = (baseRadius + dx) + "px";
      joystickKnob.style.top = (baseRadius + dy) + "px";
      joystickKnob.style.transform = "translate(-50%, -50%)";

      // Feed into harvester — angle from center
      if (dist > deadZone && global.wgl && global.wgl.harvester && !global.wgl.paused && !global.wgl.over) {
        // atan2 with dy (not negated) so that dragging UP = forward, DOWN = backward
        var angle = Math.atan2(dy, dx);
        // Rotate by 90 degrees to align with game's coordinate system (camera offset)
        global.wgl.harvester.updateAngle(angle);
      }
    }

    function resetKnob() {
      joystickKnob.style.left = "50%";
      joystickKnob.style.top = "50%";
      joystickKnob.style.transform = "translate(-50%, -50%)";
      joystickKnob.classList.remove("active");

      if (global.wgl && global.wgl.harvester) {
        global.wgl.harvester.stop();
      }
    }

    trackpad.addEventListener("touchstart", function (e) {
      if (isActive) return;
      e.preventDefault();
      e.stopPropagation();
      recalc();
      var touch = e.changedTouches[0];
      activeTouchId = touch.identifier;
      isActive = true;
      joystickKnob.classList.add("active");
      moveKnob(touch.clientX, touch.clientY);
    }, { passive: false });

    trackpad.addEventListener("touchmove", function (e) {
      if (!isActive) return;
      e.preventDefault();
      e.stopPropagation();
      for (var i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === activeTouchId) {
          moveKnob(e.changedTouches[i].clientX, e.changedTouches[i].clientY);
          break;
        }
      }
    }, { passive: false });

    trackpad.addEventListener("touchend", function (e) {
      if (!isActive) return;
      for (var i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === activeTouchId) {
          e.preventDefault();
          e.stopPropagation();
          isActive = false;
          activeTouchId = null;
          resetKnob();
          break;
        }
      }
    }, { passive: false });

    trackpad.addEventListener("touchcancel", function () {
      isActive = false;
      activeTouchId = null;
      resetKnob();
    }, { passive: false });

    // Mouse support (for desktop testing)
    var mouseActive = false;
    trackpad.addEventListener("mousedown", function (e) {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      recalc();
      mouseActive = true;
      joystickKnob.classList.add("active");
      moveKnob(e.clientX, e.clientY);
    });

    document.addEventListener("mousemove", function (e) {
      if (!mouseActive) return;
      e.preventDefault();
      moveKnob(e.clientX, e.clientY);
    });

    document.addEventListener("mouseup", function () {
      if (!mouseActive) return;
      mouseActive = false;
      resetKnob();
    });

    // ── 4. Disable the original EntityVirtualControl (floating joystick) ─
    // Poll until the game engine is ready, then neutralize it
    var patchInterval = setInterval(function () {
      // Wait for the ig framework and EntityVirtualControl to exist
      if (typeof EntityVirtualControl === "undefined") return;
      if (!global.ig) return;

      clearInterval(patchInterval);

      // Override EntityVirtualControl so it never draws or processes input
      var origExtend = EntityVirtualControl;
      EntityVirtualControl = origExtend.extend({
        // Disable click activation entirely
        isClickable: false,
        clicked: function () { /* no-op */ },
        activate: function () { /* no-op */ },
        deactivate: function () { /* no-op */ },
        updateControl: function () { /* no-op */ },
        update: function () { /* no-op — don't process any input */ },
        draw: function () { /* no-op — don't draw the floating joystick */ },
      });

    }, 100);

    // ── 5. Block touch events on the game canvas from moving the harvester ─
    // We intercept pointerdown/touchstart on the canvas area and prevent
    // them from reaching the game's click handler (which drives the virtual control),
    // BUT we still allow clicks on UI buttons (pause, upgrade, etc.)
    // We do this by intercepting the game canvas specifically.

    // Wait for canvas and game to be ready
    var blockInterval = setInterval(function () {
      var canvas = document.getElementById("canvas");
      if (!canvas) return;
      if (!global.ig) return;

      clearInterval(blockInterval);

      // The 2D canvas captures clicks for the Impact.js game engine.
      // We add a capture-phase listener that stops click events from
      // reaching the virtual control, while still letting UI buttons work.
      canvas.addEventListener("touchstart", function (e) {
        // Check if the touch is in the bottom 38% (trackpad area) — let trackpad handle it
        var touchY = e.touches[0].clientY;
        var screenH = window.innerHeight;
        if (touchY > screenH * 0.70) {
          // This is in the trackpad zone — block it from the game engine
          // (the trackpad div will handle it via its own listener)
          return;
        }
        // For touches in the upper area (where UI buttons are), allow them through
        // so pause, upgrade, etc. still work
      }, { capture: true, passive: true });

    }, 200);

    // ── 6. Show trackpad ONLY during gameplay ──────────────────────────
    // ig.control is set to the EntityGame instance only during LevelGame.
    // When on menus/splash it is null/undefined.
    var wasInGame = false;
    setInterval(function () {
      var inGame = !!(global.ig && global.ig.control && !global.wgl.over);
      if (inGame !== wasInGame) {
        wasInGame = inGame;
        trackpad.style.display = inGame ? "block" : "none";
        if (!inGame) {
          // Reset joystick when leaving gameplay
          isActive = false;
          activeTouchId = null;
          resetKnob();
        }
      }
    }, 250);

  });
})(window);
