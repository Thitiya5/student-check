/**
 * Declarative route access rules — checked in `main.js` before rendering a page.
 * Add a new guarded route here instead of copying another if-block in main.js.
 */
import {
  isAdminSession,
  canManageBehaviorSession,
  canViewPointsReportSession,
  canReturnDisciplinePointsSession
} from '../services/teacherAuth.js';
import { canViewDisciplineReportSession } from '../services/disciplineReportService.js';
import { isExecutiveEnabled } from './featureFlags.js';

/** @typedef {{ paths: string[], allow: (session: object|null|undefined) => boolean, messageKey: string }} RouteGuard */

/** @type {RouteGuard[]} */
export const ROUTE_GUARDS = [
  {
    paths: [
      '/change-pin',
      '/admin',
      '/inspection',
      '/settings-admin',
      '/admin-teachers',
      '/admin-students'
    ],
    allow: isAdminSession,
    messageKey: 'admin.denied'
  },
  {
    paths: ['/executive'],
    allow: (session) => isExecutiveEnabled() && isAdminSession(session),
    messageKey: 'admin.denied'
  },
  {
    paths: ['/admin-discipline'],
    allow: canReturnDisciplinePointsSession,
    messageKey: 'disciplineRecords.denied'
  },
  {
    paths: ['/behavior'],
    allow: canManageBehaviorSession,
    messageKey: 'behavior.denied'
  },
  {
    paths: ['/points-report'],
    allow: canViewPointsReportSession,
    messageKey: 'pointsReport.denied'
  },
  {
    paths: ['/discipline-report'],
    allow: canViewDisciplineReportSession,
    messageKey: 'disciplineReport.denied'
  }
];

/**
 * @param {string} route
 * @param {object|null|undefined} session
 * @returns {{ messageKey: string }|null}
 */
export function getRouteAccessDenied(route, session) {
  for (const guard of ROUTE_GUARDS) {
    if (!guard.paths.includes(route)) continue;
    if (!guard.allow(session)) {
      return { messageKey: guard.messageKey };
    }
  }
  return null;
}
