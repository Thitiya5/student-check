import { t } from '../i18n/index.js';
import { canManageBehaviorSession, isAdminSession } from '../services/teacherAuth.js';

/**
 * Behavior shortcut for pastoral (not shown for admin — use admin hub).
 * @param {import('../services/teacherAuth.js').TeacherAuthSession|null|undefined} session
 * @returns {{ label: string, path: string }|null}
 */
export function behaviorQuickNavLink(session) {
  if (!session || !canManageBehaviorSession(session) || isAdminSession(session)) {
    return null;
  }
  return { label: t('nav.behavior'), path: '/behavior' };
}

/**
 * @param {import('../services/teacherAuth.js').TeacherAuthSession|null|undefined} session
 * @param {Array<{ label: string, path: string, active?: boolean }>} links
 */
export function withBehaviorQuickLink(session, links) {
  const behavior = behaviorQuickNavLink(session);
  if (!behavior) return links;
  return [...links, behavior];
}
