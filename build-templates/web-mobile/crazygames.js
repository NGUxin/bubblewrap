/**
 * Bubble Wrap —— CrazyGames 适配层（Basic Launch）
 *
 * 依照 CrazyGames 官方文档实现：
 *  1. SDK v3 需要手动初始化：await window.CrazyGames.SDK.init()
 *  2. environment 为 'crazygames' / 'local' 之外（即 'disabled'）时，
 *     调用任何 SDK 方法都会抛错 —— 所以本层做环境守卫，绝不在 disabled 环境调用
 *  3. 游戏状态事件：game.loadingStart/loadingStop、game.gameplayStart/gameplayStop
 *  4. 技术规范要求：iOS 音频被系统打断后，需在 touchend 这类用户手势里 resume()
 *
 * 该文件不依赖引擎，加载失败/无 SDK 时全部退化为空操作，不影响游戏本体。
 */
(function () {
  'use strict';

  var env = 'disabled';
  var ready = false;
  var pending = [];

  function sdk() {
    return (window.CrazyGames && window.CrazyGames.SDK) || null;
  }

  function safeCall(name) {
    try {
      var s = sdk();
      if (!s || !s.game || typeof s.game[name] !== 'function') return;
      if (env !== 'crazygames' && env !== 'local') return;
      s.game[name]();
    } catch (e) {
      // SDK 抛错不能影响游戏
      if (window.console && console.warn) console.warn('[CG] ' + name + ' failed:', e && e.message);
    }
  }

  function emit(name) {
    if (!ready) { pending.push(name); return; }
    safeCall(name);
  }

  function flush() {
    var q = pending;
    pending = [];
    for (var i = 0; i < q.length; i++) safeCall(q[i]);
  }

  function boot(attempt) {
    var s = sdk();
    if (!s || typeof s.init !== 'function') {
      // SDK 还没就绪（脚本顺序/加载失败）：短暂重试；最终仍无 SDK 就退化为空操作
      if ((attempt || 0) < 10) {
        setTimeout(function () { boot((attempt || 0) + 1); }, 300);
        return;
      }
      ready = true;
      pending = [];
      return;
    }
    var p;
    try {
      p = s.init();
    } catch (e) {
      ready = true;
      pending = [];
      return;
    }
    var done = function () {
      try { env = s.environment || 'disabled'; } catch (e2) { env = 'disabled'; }
      ready = true;
      flush();
      // 平台侧静音设置（Full Implementation 要求）：把 muteAudio 透传给游戏
      try {
        if (env === 'crazygames' && s.game) {
          var applyMute = function (settings) {
            try {
              if (typeof window.__popBubblesMute === 'function') {
                window.__popBubblesMute(!!(settings && settings.muteAudio));
              }
            } catch (e4) { /* ignore */ }
          };
          if (s.game.settings) applyMute(s.game.settings);
          if (typeof s.game.addSettingsChangeListener === 'function') s.game.addSettingsChangeListener(applyMute);
        }
      } catch (e3) { /* ignore */ }
      if (window.console && console.log) console.log('[CG] SDK ready, environment =', env);
    };
    if (p && typeof p.then === 'function') p.then(done, done);
    else done();
  }

  // ---------------- iOS 音频恢复 ----------------
  var contexts = [];

  function remember(ctx) {
    if (ctx && contexts.indexOf(ctx) < 0) contexts.push(ctx);
    return ctx;
  }

  // 引擎内部的音频上下文（不同版本挂载位置不同，逐个探测）
  function internalContexts() {
    var out = [];
    try {
      var legacy = window.cclegacy;
      var internal = legacy && legacy.internal;
      var eng = internal && internal.audioEngine;
      if (eng && eng.context) out.push(eng.context);
      if (internal && internal.AudioManager && internal.AudioManager._audioContext) out.push(internal.AudioManager._audioContext);
    } catch (e) { /* ignore */ }
    return out;
  }

  function resumeAll() {
    var list = internalContexts().concat(contexts);
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      try {
        if (c && c.state === 'suspended' && typeof c.resume === 'function') c.resume();
      } catch (e) { /* ignore */ }
    }
  }

  // 捕获游戏自己创建的 AudioContext（保留原型链，instanceof 依然成立）
  function patchAudioContext(name) {
    var Orig = window[name];
    if (!Orig || Orig.__bwPatched) return;
    function Wrapped() {
      var args = Array.prototype.slice.call(arguments);
      var ctx = new (Function.prototype.bind.apply(Orig, [null].concat(args)))();
      return remember(ctx);
    }
    Wrapped.prototype = Orig.prototype;
    Wrapped.__bwPatched = true;
    try { window[name] = Wrapped; } catch (e) { /* ignore */ }
  }

  patchAudioContext('AudioContext');
  patchAudioContext('webkitAudioContext');

  var resumeEvents = ['touchend', 'pointerup', 'click'];
  for (var i = 0; i < resumeEvents.length; i++) {
    document.addEventListener(resumeEvents[i], resumeAll, { passive: true });
  }
  window.addEventListener('pageshow', resumeAll);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) resumeAll();
  });

  // ---------------- 对外接口 ----------------
  window.CG = {
    environment: function () { return env; },
    isReady: function () { return ready; },
    loadingStart: function () { emit('loadingStart'); },
    loadingStop: function () { emit('loadingStop'); },
    gameplayStart: function () { emit('gameplayStart'); },
    gameplayStop: function () { emit('gameplayStop'); },
    happyTime: function () { emit('happytime'); },
    resumeAudio: resumeAll
  };

  // 游戏开始加载
  window.CG.loadingStart();
  boot(0);
})();
