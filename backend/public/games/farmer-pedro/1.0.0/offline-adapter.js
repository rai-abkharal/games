/* Farmer Pedro offline GameSnacks compatibility adapter.
 * Offline-only execution engine & asset resolver.
 */
(function (global) {
  "use strict";

  // 1. Ensure branding assets exist in offline resource dictionary
  if (global.__FARMER_PEDRO_RESOURCES__) {
    var transparent1x1 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAAElFTkSuQmCA=";
    var splashEntry = { base64: transparent1x1, mime: "image/png" };
    global.__FARMER_PEDRO_RESOURCES__["branding/splash1.png"] = splashEntry;
    global.__FARMER_PEDRO_RESOURCES__["branding/logo.png"] = splashEntry;
    global.__FARMER_PEDRO_RESOURCES__["splash1.png"] = splashEntry;
    global.__FARMER_PEDRO_RESOURCES__["logo.png"] = splashEntry;
  }

  // 2. Build filename fallback index for instant lookup
  var filenameIndex = Object.create(null);
  if (global.__FARMER_PEDRO_RESOURCES__) {
    for (var key in global.__FARMER_PEDRO_RESOURCES__) {
      var fname = key.split("/").pop();
      if (fname && !filenameIndex[fname]) {
        filenameIndex[fname] = key;
      }
    }
  }

  function resolveResourceKey(url) {
    if (!url || typeof url !== "string") return null;
    var clean = url.replace(/\\/g, "/").split("#")[0].split("?")[0];
    try { clean = decodeURIComponent(clean); } catch (_) {}
    var res = global.__FARMER_PEDRO_RESOURCES__;
    if (!res) return null;
    if (res[clean]) return clean;

    var mediaAt = clean.lastIndexOf("/media/");
    if (mediaAt >= 0 && res[clean.slice(mediaAt + 1)]) return clean.slice(mediaAt + 1);

    var vendorAt = clean.lastIndexOf("/vendor/");
    if (vendorAt >= 0 && res[clean.slice(vendorAt + 1)]) return clean.slice(vendorAt + 1);

    var brandingAt = clean.lastIndexOf("/branding/");
    if (brandingAt >= 0 && res[clean.slice(brandingAt + 1)]) return clean.slice(brandingAt + 1);

    var gameAt = clean.lastIndexOf("/game/");
    if (gameAt >= 0) {
      var afterGame = clean.slice(gameAt + 6);
      if (res[afterGame]) return afterGame;
    }

    var stripped = clean.replace(/^\.\//, "").replace(/^\.\.\//, "");
    if (stripped.indexOf("game/") === 0) stripped = stripped.slice(5);
    if (res[stripped]) return stripped;

    var fname = clean.split("/").pop();
    if (fname && filenameIndex[fname]) return filenameIndex[fname];

    return null;
  }

  // 3. Augment FarmerPedroResources lookup
  if (global.FarmerPedroResources) {
    var origHas = global.FarmerPedroResources.has;
    var origDataUrl = global.FarmerPedroResources.dataUrl;
    var origBytes = global.FarmerPedroResources.bytes;

    global.FarmerPedroResources.has = function (url) {
      if (origHas && origHas(url)) return true;
      return !!resolveResourceKey(url);
    };

    global.FarmerPedroResources.dataUrl = function (url) {
      var resKey = resolveResourceKey(url);
      if (resKey && origDataUrl) {
        var d = origDataUrl(resKey);
        if (d) return d;
      }
      if (resKey && global.__FARMER_PEDRO_RESOURCES__ && global.__FARMER_PEDRO_RESOURCES__[resKey]) {
        var entry = global.__FARMER_PEDRO_RESOURCES__[resKey];
        return "data:" + entry.mime + ";base64," + entry.base64;
      }
      return origDataUrl ? origDataUrl(url) : null;
    };

    global.FarmerPedroResources.bytes = function (url) {
      var resKey = resolveResourceKey(url);
      if (resKey && origBytes) {
        var b = origBytes(resKey);
        if (b) return b;
      }
      if (resKey && global.__FARMER_PEDRO_RESOURCES__ && global.__FARMER_PEDRO_RESOURCES__[resKey]) {
        var bin = atob(global.__FARMER_PEDRO_RESOURCES__[resKey].base64);
        var bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return bytes;
      }
      return origBytes ? origBytes(url) : null;
    };
  }

  // 4. Intercept Image and Audio src to eliminate CORS net::ERR_FAILED on file:///
  try {
    var origImgSrcDesc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");
    var origImgSrcSet = origImgSrcDesc && origImgSrcDesc.set;
    var origImgSrcGet = origImgSrcDesc && origImgSrcDesc.get;

    if (origImgSrcSet) {
      Object.defineProperty(HTMLImageElement.prototype, "src", {
        configurable: true,
        enumerable: true,
        get: function () {
          return origImgSrcGet ? origImgSrcGet.call(this) : this.getAttribute("src");
        },
        set: function (url) {
          if (url && typeof url === "string" && url.indexOf("data:") !== 0 && url.indexOf("blob:") !== 0) {
            var resKey = resolveResourceKey(url);
            if (resKey && global.FarmerPedroResources) {
              this.crossOrigin = null;
              this.removeAttribute("crossorigin");
              var dataUrl = global.FarmerPedroResources.dataUrl(resKey);
              if (dataUrl) return origImgSrcSet.call(this, dataUrl);
            }
          }
          return origImgSrcSet.call(this, url);
        }
      });
    }

    var origImgCrossOrigin = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "crossOrigin");
    if (origImgCrossOrigin && origImgCrossOrigin.set) {
      Object.defineProperty(HTMLImageElement.prototype, "crossOrigin", {
        configurable: true,
        enumerable: true,
        get: function () {
          return origImgCrossOrigin.get ? origImgCrossOrigin.get.call(this) : null;
        },
        set: function (val) {
          if (location.protocol === "file:" || (this.src && this.src.indexOf("data:") === 0)) {
            return;
          }
          return origImgCrossOrigin.set.call(this, val);
        }
      });
    }

    var origImgSetAttr = HTMLImageElement.prototype.setAttribute;
    HTMLImageElement.prototype.setAttribute = function (name, value) {
      var n = String(name).toLowerCase();
      if (n === "src") {
        this.src = value;
        return;
      }
      if (n === "crossorigin" && (location.protocol === "file:" || (this.src && this.src.indexOf("data:") === 0))) {
        return;
      }
      return origImgSetAttr.apply(this, arguments);
    };

    var origAudioSrcDesc = Object.getOwnPropertyDescriptor(HTMLAudioElement.prototype, "src");
    var origAudioSrcSet = origAudioSrcDesc && origAudioSrcDesc.set;
    var origAudioSrcGet = origAudioSrcDesc && origAudioSrcDesc.get;

    if (origAudioSrcSet) {
      Object.defineProperty(HTMLAudioElement.prototype, "src", {
        configurable: true,
        enumerable: true,
        get: function () {
          return origAudioSrcGet ? origAudioSrcGet.call(this) : this.getAttribute("src");
        },
        set: function (url) {
          if (url && typeof url === "string" && url.indexOf("data:") !== 0 && url.indexOf("blob:") !== 0) {
            var resKey = resolveResourceKey(url);
            if (resKey && global.FarmerPedroResources) {
              var dataUrl = global.FarmerPedroResources.dataUrl(resKey);
              if (dataUrl) return origAudioSrcSet.call(this, dataUrl);
            }
          }
          return origAudioSrcSet.call(this, url);
        }
      });
    }
  } catch (err) {
    console.warn("Offline prototype hook:", err);
  }

  // 5. Lightweight jQuery shim so $('#ajaxbar').css('background', 'none') succeeds
  global.$ = global.jQuery = function (selector) {
    var element = typeof selector === "string" ? document.querySelector(selector) : selector;
    var wrapper = {
      0: element,
      length: element ? 1 : 0,
      css: function (prop, val) {
        if (element && element.style) {
          if (typeof prop === "object") {
            for (var k in prop) element.style[k] = prop[k];
          } else if (val !== undefined) {
            element.style[prop] = val;
          }
        }
        return wrapper;
      },
      show: function () { if (element && element.style) element.style.display = "block"; return wrapper; },
      hide: function () { if (element && element.style) element.style.display = "none"; return wrapper; },
      on: function (event, handler) { if (element && element.addEventListener) element.addEventListener(event, handler); return wrapper; },
      off: function (event, handler) { if (element && element.removeEventListener) element.removeEventListener(event, handler); return wrapper; },
      fadeIn: function (speed, callback) {
        if (element && element.style) { element.style.opacity = "1"; element.style.display = "block"; }
        if (typeof callback === "function") callback();
        return wrapper;
      },
      fadeOut: function (speed, callback) {
        if (element && element.style) { element.style.opacity = "0"; }
        if (typeof callback === "function") callback();
        return wrapper;
      }
    };
    return wrapper;
  };

  // 6. Intercept dynamic script tags for Draco if created via document.createElement
  var origCreateElement = document.createElement.bind(document);
  document.createElement = function (tagName) {
    var element = origCreateElement.apply(document, arguments);
    if (String(tagName).toLowerCase() === "script") {
      var origSetAttr = element.setAttribute.bind(element);
      element.setAttribute = function (name, value) {
        if (String(name).toLowerCase() === "src") {
          element.src = value;
          return;
        }
        return origSetAttr.apply(element, arguments);
      };
      var _src = "";
      Object.defineProperty(element, "src", {
        configurable: true,
        get: function () { return _src; },
        set: function (url) {
          _src = String(url || "");
          var fname = _src.split("/").pop().split("?")[0].split("#")[0];
          if (fname.indexOf("draco_") === 0 && (fname.endsWith(".js") || fname.indexOf(".js") >= 0)) {
            global.setTimeout(function () {
              if (typeof global.DracoDecoderModule === "undefined" && global.FarmerPedroResources) {
                var bytes = global.FarmerPedroResources.bytes("vendor/babylon/" + fname) || global.FarmerPedroResources.bytes(fname);
                if (bytes) {
                  try {
                    var txt = new TextDecoder("utf-8").decode(bytes);
                    (new Function(txt))();
                  } catch (err) {
                    console.error("Draco inline eval error:", err);
                  }
                }
              }
              if (typeof element.onload === "function") {
                element.onload();
              }
            }, 0);
          } else {
            origSetAttr("src", _src);
          }
        }
      });
    }
    return element;
  };

  // 7. Ensure Babylon DracoCompression never attempts to use Web Workers offline & disable CORS on file://
  function hookBabylon(b) {
    if (!b) return;
    try {
      if (b.Tools) {
        b.Tools.CorsBehavior = "";
      }
      if (b.DracoCompression) {
        b.DracoCompression.DefaultNumWorkers = 0;
      }
    } catch (e) {}
  }

  var _babylon = global.BABYLON;
  Object.defineProperty(global, "BABYLON", {
    configurable: true,
    enumerable: true,
    get: function () { return _babylon; },
    set: function (val) {
      _babylon = val;
      hookBabylon(_babylon);
    }
  });
  if (_babylon) hookBabylon(_babylon);

  // 8. Clear ajaxbar loading spinner
  function clearSpinner() {
    var ajaxbar = document.getElementById("ajaxbar");
    if (ajaxbar) {
      ajaxbar.style.backgroundImage = "none";
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      clearSpinner();
      var observer = new MutationObserver(clearSpinner);
      var ab = document.getElementById("ajaxbar");
      if (ab) observer.observe(ab, { childList: true, subtree: true });
    });
  } else {
    clearSpinner();
  }

  // 9. Storage and GameSnacks compatibility layer
  var STORAGE_PREFIX = "farmer-pedro-offline:";
  var memory = Object.create(null);
  var pauseCallbacks = [];
  var resumeCallbacks = [];
  var audioCallbacks = [];
  var audioEnabled = true;

  function safeLocalStorage() {
    try {
      var testKey = STORAGE_PREFIX + "__test__";
      global.localStorage.setItem(testKey, "1");
      global.localStorage.removeItem(testKey);
      return global.localStorage;
    } catch (_error) {
      return null;
    }
  }

  var local = safeLocalStorage();
  var storage = {
    get length() {
      if (local) {
        var count = 0;
        for (var index = 0; index < local.length; index += 1) {
          if ((local.key(index) || "").indexOf(STORAGE_PREFIX) === 0) count += 1;
        }
        return count;
      }
      return Object.keys(memory).length;
    },
    getItem: function (key) {
      var scoped = STORAGE_PREFIX + String(key);
      return local ? local.getItem(scoped) : Object.prototype.hasOwnProperty.call(memory, scoped) ? memory[scoped] : null;
    },
    setItem: function (key, value) {
      var scoped = STORAGE_PREFIX + String(key);
      if (local) local.setItem(scoped, String(value));
      else memory[scoped] = String(value);
    },
    removeItem: function (key) {
      var scoped = STORAGE_PREFIX + String(key);
      if (local) local.removeItem(scoped);
      else delete memory[scoped];
    },
    clear: function () {
      if (local) {
        var keys = [];
        for (var index = 0; index < local.length; index += 1) {
          var key = local.key(index);
          if (key && key.indexOf(STORAGE_PREFIX) === 0) keys.push(key);
        }
        keys.forEach(function (key) { local.removeItem(key); });
      } else memory = Object.create(null);
    },
    key: function (index) {
      var keys = [];
      if (local) {
        for (var cursor = 0; cursor < local.length; cursor += 1) {
          var key = local.key(cursor);
          if (key && key.indexOf(STORAGE_PREFIX) === 0) keys.push(key.slice(STORAGE_PREFIX.length));
        }
      } else {
        keys = Object.keys(memory).map(function (key) { return key.slice(STORAGE_PREFIX.length); });
      }
      return typeof keys[index] === "string" ? keys[index] : null;
    }
  };

  function callAll(callbacks) {
    callbacks.slice().forEach(function (callback) {
      try { callback(); } catch (error) { console.warn("Offline callback failed", error); }
    });
  }

  function unavailableAd(options) {
    options = options || {};
    global.setTimeout(function () {
      if (typeof options.adViewed === "function") {
        options.adViewed();
      } else if (typeof options.adDismissed === "function") {
        options.adDismissed();
      }
      if (typeof options.adBreakDone === "function") {
        options.adBreakDone({ breakStatus: "dismissed", placement: options.type || "unknown" });
      }
    }, 0);
  }

  // Disable all ads, rewarded videos, and promotional links in game configuration
  var _settings = null;
  Object.defineProperty(global, "_SETTINGS", {
    configurable: true,
    enumerable: true,
    get: function () { return _settings; },
    set: function (val) {
      _settings = val;
      if (_settings) {
        if (_settings.RewardedVideo) _settings.RewardedVideo.Enabled = false;
        if (_settings.MoreGames) _settings.MoreGames.Enabled = false;
        if (_settings.Ad && _settings.Ad.Mobile) {
          if (_settings.Ad.Mobile.Preroll) _settings.Ad.Mobile.Preroll.Enabled = false;
          if (_settings.Ad.Mobile.Header) _settings.Ad.Mobile.Header.Enabled = false;
          if (_settings.Ad.Mobile.Footer) _settings.Ad.Mobile.Footer.Enabled = false;
          if (_settings.Ad.Mobile.End) _settings.Ad.Mobile.End.Enabled = false;
        }
      }
    }
  });

  // Ensure ad popups and ad failure dialogs never display
  var popupCheckTimer = setInterval(function () {
    if (global.EntityPopupRvFail) {
      global.EntityPopupRvFail = global.EntityPopupRvFail.extend({
        init: function () {
          this.parent.apply(this, arguments);
          this.kill();
        }
      });
    }
    if (global.EntityPopupAd) {
      global.EntityPopupAd = global.EntityPopupAd.extend({
        init: function () {
          this.parent.apply(this, arguments);
          if (this.callback) this.callback(true);
          this.kill();
        }
      });
    }
    if (global.EntityPopupRvFail && global.EntityPopupAd) {
      clearInterval(popupCheckTimer);
    }
  }, 50);

  global.GameSnacks = {
    storage: storage,
    game: {
      firstFrameReady: function () { global.dispatchEvent(new Event("offline-first-frame-ready")); },
      ready: function () { global.dispatchEvent(new Event("offline-game-ready")); },
      gameOver: function () { storage.setItem("last-game-over", Date.now()); },
      levelComplete: function (level) { storage.setItem("last-completed-level", level); },
      onPause: function (callback) { if (typeof callback === "function") pauseCallbacks.push(callback); },
      onResume: function (callback) { if (typeof callback === "function") resumeCallbacks.push(callback); }
    },
    score: {
      update: function (score) { storage.setItem("last-score", score); }
    },
    audio: {
      isEnabled: function () { return audioEnabled; },
      subscribe: function (callback) {
        if (typeof callback === "function") {
          audioCallbacks.push(callback);
          callback(audioEnabled);
        }
      },
      setEnabled: function (enabled) {
        audioEnabled = !!enabled;
        audioCallbacks.slice().forEach(function (callback) { callback(audioEnabled); });
      }
    },
    ad: { break: unavailableAd }
  };

  global.FarmerPedroOffline = {
    pause: function () { callAll(pauseCallbacks); },
    resume: function () { callAll(resumeCallbacks); },
    setAudioEnabled: global.GameSnacks.audio.setEnabled,
    storage: storage,
    version: "1.0.0"
  };

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) callAll(pauseCallbacks);
    else callAll(resumeCallbacks);
  });
})(window);
