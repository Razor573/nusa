// Pure domain logic for Water tracker (renderer + Node tests).
(function (root) {
  const MIN_INTERVAL_MS = 20 * 60000;
  const MAX_INTERVAL_MS = 90 * 60000;

  const DEFAULT_CONFIG = Object.freeze({
    goalMl: 2000,
    sipMl: 250,
    bottleMl: 500,
    startHour: 8,
    endHour: 22,
    remind: false,
  });

  function localDateStr(nowMs = Date.now()) {
    const d = new Date(nowMs);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function createState(dateStr, config) {
    const cfg = Object.assign({}, DEFAULT_CONFIG, config || {});
    return {
      date: dateStr || localDateStr(),
      entries: [],
      goalMl: Number(cfg.goalMl) || DEFAULT_CONFIG.goalMl,
      sipMl: Number(cfg.sipMl) || DEFAULT_CONFIG.sipMl,
      bottleMl: Number(cfg.bottleMl) || DEFAULT_CONFIG.bottleMl,
      startHour: Number.isFinite(cfg.startHour) ? cfg.startHour : DEFAULT_CONFIG.startHour,
      endHour: Number.isFinite(cfg.endHour) ? cfg.endHour : DEFAULT_CONFIG.endHour,
      remind: Boolean(cfg.remind),
      bottleCarryMl: 0,
      snoozedUntil: 0,
      lastRemindedAt: 0,
    };
  }

  function totalMl(state) {
    if (!state || !Array.isArray(state.entries)) return 0;
    let sum = 0;
    for (const e of state.entries) sum += Number(e.ml) || 0;
    return sum;
  }

  function logSip(state, ml, nowMs = Date.now()) {
    const amount = Math.max(0, Number(ml != null ? ml : state.sipMl) || 0);
    const entries = (state.entries || []).concat({ at: nowMs, ml: amount });
    let bottleCarryMl = (state.bottleCarryMl || 0) + amount;
    const bottleMl = Number(state.bottleMl) || 0;
    const refillNeeded = bottleMl > 0 && bottleCarryMl >= bottleMl;
    if (refillNeeded) {
      bottleCarryMl = bottleCarryMl % bottleMl;
    }
    const nextState = Object.assign({}, state, { entries, bottleCarryMl });
    const total = totalMl(nextState);
    const goalReached = total >= (nextState.goalMl || 0);
    return { state: nextState, totalMl: total, goalReached, refillNeeded };
  }

  function undoSip(state) {
    if (!state || !Array.isArray(state.entries) || state.entries.length === 0) {
      return state;
    }
    const last = state.entries[state.entries.length - 1];
    const entries = state.entries.slice(0, -1);
    const bottleCarryMl = Math.max(0, (state.bottleCarryMl || 0) - (Number(last.ml) || 0));
    return Object.assign({}, state, { entries, bottleCarryMl });
  }

  function hourlyBuckets(state) {
    const buckets = new Array(24).fill(0);
    if (!state || !Array.isArray(state.entries)) return buckets;
    for (const e of state.entries) {
      const h = new Date(e.at).getHours();
      if (h >= 0 && h < 24) {
        buckets[h] += Number(e.ml) || 0;
      }
    }
    return buckets;
  }

  function nextReminderDue(state, nowMs = Date.now()) {
    if (!state || !state.remind) return false;
    const total = totalMl(state);
    if (total >= state.goalMl) return false;

    const nowDate = new Date(nowMs);
    const hour = nowDate.getHours();
    if (hour < state.startHour || hour >= state.endHour) return false;
    if (nowMs < (state.snoozedUntil || 0)) return false;

    const endToday = new Date(nowMs);
    endToday.setHours(state.endHour, 0, 0, 0);
    const activeMs = Math.max(0, endToday.getTime() - nowMs);

    const remainingMl = Math.max(0, state.goalMl - total);
    const remainingSips = Math.max(1, Math.ceil(remainingMl / Math.max(1, state.sipMl || 1)));
    const rawInterval = activeMs / remainingSips;
    const interval = Math.min(MAX_INTERVAL_MS, Math.max(MIN_INTERVAL_MS, rawInterval));

    return nowMs - (state.lastRemindedAt || 0) >= interval;
  }

  function snooze(state, nowMs = Date.now(), minutes = 15) {
    return Object.assign({}, state, {
      snoozedUntil: nowMs + Math.max(0, Number(minutes) || 0) * 60000,
    });
  }

  function resetDay(state, dateStr) {
    return Object.assign({}, state, {
      date: dateStr || localDateStr(),
      entries: [],
      bottleCarryMl: 0,
      snoozedUntil: 0,
      lastRemindedAt: 0,
    });
  }

  root.Water = {
    DEFAULT_CONFIG,
    createState,
    logSip,
    undoSip,
    hourlyBuckets,
    totalMl,
    nextReminderDue,
    snooze,
    resetDay,
  };
})(typeof window !== 'undefined' ? window : globalThis);
