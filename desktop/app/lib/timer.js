// Pure domain logic for Countdown, Stopwatch, and Pomodoro (renderer + Node tests).
(function (root) {
  const PRESETS = Object.freeze([1, 3, 5, 10, 15, 25, 45, 60]);

  const DEFAULT_POMODORO_CONFIG = Object.freeze({
    focusMin: 25,
    shortBreakMin: 5,
    longBreakMin: 15,
    cycles: 4,
  });

  // --- Countdown ---
  function createCountdown(minutes = 5, _nowMs) {
    const ms = Math.max(1, Number(minutes) || 1) * 60000;
    return {
      durationMs: ms,
      remainingMs: ms,
      running: false,
      endAt: null,
    };
  }

  function startCountdown(cd, nowMs = Date.now()) {
    if (cd.running) return cd;
    return Object.assign({}, cd, {
      running: true,
      endAt: nowMs + Math.max(0, cd.remainingMs),
    });
  }

  function pauseCountdown(cd, nowMs = Date.now()) {
    if (!cd.running) return cd;
    const remainingMs = cd.endAt != null ? Math.max(0, cd.endAt - nowMs) : cd.remainingMs;
    return Object.assign({}, cd, {
      running: false,
      remainingMs,
      endAt: null,
    });
  }

  function remainingCountdown(cd, nowMs = Date.now()) {
    if (cd.running && cd.endAt != null) {
      return Math.max(0, cd.endAt - nowMs);
    }
    return Math.max(0, cd.remainingMs || 0);
  }

  function adjustCountdown(cd, deltaMin, nowMs = Date.now()) {
    const deltaMs = (Number(deltaMin) || 0) * 60000;
    const minMs = cd.running ? 10000 : 60000;
    const currentRem = remainingCountdown(cd, nowMs);
    const remainingMs = Math.max(minMs, currentRem + deltaMs);
    const durationMs = Math.max(minMs, (cd.durationMs || 0) + deltaMs);
    return Object.assign({}, cd, {
      durationMs,
      remainingMs,
      endAt: cd.running ? nowMs + remainingMs : null,
    });
  }

  // --- Stopwatch ---
  function createStopwatch() {
    return {
      running: false,
      startedAt: 0,
      elapsedMs: 0,
      laps: [],
    };
  }

  function startStopwatch(sw, nowMs = Date.now()) {
    if (sw.running) return sw;
    return Object.assign({}, sw, {
      running: true,
      startedAt: nowMs,
    });
  }

  function pauseStopwatch(sw, nowMs = Date.now()) {
    if (!sw.running) return sw;
    const elapsedMs = (sw.elapsedMs || 0) + Math.max(0, nowMs - (sw.startedAt || nowMs));
    return Object.assign({}, sw, {
      running: false,
      startedAt: 0,
      elapsedMs,
    });
  }

  function resetStopwatch() {
    return createStopwatch();
  }

  function elapsedStopwatch(sw, nowMs = Date.now()) {
    if (!sw.running) return sw.elapsedMs || 0;
    return (sw.elapsedMs || 0) + Math.max(0, nowMs - (sw.startedAt || nowMs));
  }

  function lapStopwatch(sw, nowMs = Date.now()) {
    const totalMs = elapsedStopwatch(sw, nowMs);
    const laps = Array.isArray(sw.laps) ? sw.laps : [];
    const prevTotalMs = laps.length > 0 ? laps[laps.length - 1].totalMs : 0;
    const splitMs = Math.max(0, totalMs - prevTotalMs);
    const nextLaps = laps.concat({
      index: laps.length + 1,
      totalMs,
      splitMs,
    });
    return Object.assign({}, sw, { laps: nextLaps });
  }

  // --- Pomodoro ---
  function createPomodoro(config) {
    const cfg = Object.assign({}, DEFAULT_POMODORO_CONFIG, config || {});
    const totalMs = Math.max(1, Number(cfg.focusMin) || 25) * 60000;
    return {
      phase: 'focus',
      cycle: 1,
      cycles: Math.max(1, Number(cfg.cycles) || 4),
      running: false,
      remainingMs: totalMs,
      totalMs,
      endAt: null,
      completedToday: 0,
      config: cfg,
    };
  }

  function startPomodoro(p, nowMs = Date.now()) {
    if (p.running) return p;
    return Object.assign({}, p, {
      running: true,
      endAt: nowMs + Math.max(0, p.remainingMs),
    });
  }

  function pausePomodoro(p, nowMs = Date.now()) {
    if (!p.running) return p;
    const remainingMs = p.endAt != null ? Math.max(0, p.endAt - nowMs) : p.remainingMs;
    return Object.assign({}, p, {
      running: false,
      remainingMs,
      endAt: null,
    });
  }

  function resetPomodoro(p) {
    const cfg = (p && p.config) || DEFAULT_POMODORO_CONFIG;
    const totalMs = Math.max(1, Number(cfg.focusMin) || 25) * 60000;
    return Object.assign({}, p, {
      phase: 'focus',
      cycle: 1,
      running: false,
      remainingMs: totalMs,
      totalMs,
      endAt: null,
    });
  }

  function advancePomodoro(p) {
    const cfg = p.config || DEFAULT_POMODORO_CONFIG;
    const cycles = Math.max(1, p.cycles || cfg.cycles || 4);
    if (p.phase === 'focus') {
      const completedToday = (p.completedToday || 0) + 1;
      const isLong = p.cycle % cycles === 0;
      const restMin = isLong ? cfg.longBreakMin : cfg.shortBreakMin;
      const totalMs = Math.max(1, Number(restMin) || 5) * 60000;
      return Object.assign({}, p, {
        phase: 'rest',
        running: false,
        remainingMs: totalMs,
        totalMs,
        endAt: null,
        completedToday,
      });
    }
    const nextCycle = (p.cycle % cycles) + 1;
    const totalMs = Math.max(1, Number(cfg.focusMin) || 25) * 60000;
    return Object.assign({}, p, {
      phase: 'focus',
      cycle: nextCycle,
      running: false,
      remainingMs: totalMs,
      totalMs,
      endAt: null,
    });
  }

  function remainingPomodoro(p, nowMs = Date.now()) {
    if (p.running && p.endAt != null) {
      return Math.max(0, p.endAt - nowMs);
    }
    return Math.max(0, p.remainingMs || 0);
  }

  root.TimerLib = {
    PRESETS,
    createCountdown,
    startCountdown,
    pauseCountdown,
    adjustCountdown,
    remainingCountdown,
    createStopwatch,
    startStopwatch,
    pauseStopwatch,
    resetStopwatch,
    elapsedStopwatch,
    lapStopwatch,
    createPomodoro,
    startPomodoro,
    pausePomodoro,
    resetPomodoro,
    advancePomodoro,
    remainingPomodoro,
  };
})(typeof window !== 'undefined' ? window : globalThis);
