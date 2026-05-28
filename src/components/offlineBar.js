import { escapeHtml } from '../utils/html.js';
import { getSyncState } from '../services/offlineSync.js';
import { flushPendingAttendance } from '../services/offlineSync.js';
import { t } from '../i18n/index.js';

export function renderOfflineBarMarkup() {
  return `<div id="offlineBar" class="offline-bar" hidden aria-live="polite"></div>`;
}

let offlineBarBound = false;
/** @type {(() => void)|null} */
let offlineBarTeardown = null;

/** @param {(msg: string) => void} [onToast] */
export function bindOfflineBar(onToast) {
  if (offlineBarBound) return offlineBarTeardown || (() => {});
  offlineBarBound = true;

  const el = document.getElementById('offlineBar');
  if (!el) return () => {};

  async function paint() {
    const { online, pending, syncing } = await getSyncState();
    const show = !online || pending > 0 || syncing;
    if (!show) {
      el.hidden = true;
      return;
    }

    el.hidden = false;
    el.className = `offline-bar ${online ? 'offline-bar--sync' : 'offline-bar--offline'}`;

    let text;
    if (syncing) {
      text = t('offline.syncing');
    } else if (!online) {
      text =
        pending > 0
          ? t('offline.offlinePending', { count: pending })
          : t('offline.offline');
    } else if (pending > 0) {
      text = t('offline.pendingUpload', { count: pending });
    } else {
      text = t('offline.online');
    }

    el.innerHTML = `
      <span class="offline-bar__dot" aria-hidden="true"></span>
      <span class="offline-bar__text">${escapeHtml(text)}</span>
      ${
        online && pending > 0 && !syncing
          ? `<button type="button" class="offline-bar__btn" id="offlineSyncNow">${escapeHtml(t('offline.syncNow'))}</button>`
          : ''
      }`;
  }

  const onStatus = () => void paint();
  window.addEventListener('offline-status-changed', onStatus);
  window.addEventListener('online', onStatus);
  window.addEventListener('offline', onStatus);

  el.addEventListener('click', async (e) => {
    if (!(e.target instanceof HTMLElement)) return;
    if (e.target.id !== 'offlineSyncNow') return;
    const result = await flushPendingAttendance();
    if (result.synced > 0) {
      onToast?.(t('offline.syncedCount', { count: result.synced }));
    }
    void paint();
  });

  void paint();
  const interval = window.setInterval(() => void paint(), 15000);

  offlineBarTeardown = () => {
    window.removeEventListener('offline-status-changed', onStatus);
    window.removeEventListener('online', onStatus);
    window.removeEventListener('offline', onStatus);
    window.clearInterval(interval);
    offlineBarBound = false;
  };
  return offlineBarTeardown;
}
