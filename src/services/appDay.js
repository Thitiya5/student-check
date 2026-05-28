import { getTodayDate } from '../utils/dateIso.js';

/** @deprecated use getTodayDate from dateIso.js */
export function getTodayDateKey() {
  return getTodayDate();
}

/**
 * Roll app state to today when the calendar day changes (Bangkok).
 * @param {Record<string, unknown>} state
 */
export function syncStateToToday(state) {
  const today = getTodayDate();
  const storedDate = String(state?.currentDate ?? '').trim();
  const dayChanged = Boolean(storedDate && storedDate !== today);

  if (!dayChanged && storedDate === today) {
    return { state, dayChanged: false };
  }

  return {
    state: {
      ...state,
      currentDate: today,
      attendance: {},
      classConfirmed: false,
      historyDate: today
    },
    dayChanged
  };
}

/**
 * @param {() => void} onNewDay
 * @returns {() => void} cleanup
 */
export function startDayRolloverWatch(onNewDay) {
  let lastDay = getTodayDate();

  const tick = () => {
    const today = getTodayDate();
    if (today === lastDay) return;
    lastDay = today;
    onNewDay();
  };

  const intervalId = window.setInterval(tick, 60_000);
  const onVisible = () => {
    if (document.visibilityState === 'visible') tick();
  };
  document.addEventListener('visibilitychange', onVisible);

  return () => {
    window.clearInterval(intervalId);
    document.removeEventListener('visibilitychange', onVisible);
  };
}
