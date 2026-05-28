/**
 * Issues Firebase Auth custom tokens after verifying teacher login via Google Apps Script.
 *
 * Configure: firebase functions:config:set gas.web_app_url="https://script.google.com/..."
 * Or set GAS_WEB_APP_URL in Cloud Functions environment (recommended).
 */
const crypto = require('crypto');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const admin = require('firebase-admin');

admin.initializeApp();

setGlobalOptions({ region: process.env.FUNCTIONS_REGION || 'asia-southeast1' });

const ADMIN_ROLES = new Set(['admin', 'adnim', 'administrator']);

function normalizeTeacherName(name) {
  return String(name ?? '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .normalize('NFKC');
}

function teacherUid(teacherName) {
  const hash = crypto.createHash('sha256').update(normalizeTeacherName(teacherName)).digest('hex');
  return `t_${hash.slice(0, 28)}`;
}

function parseAssignedClasses(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return [];
  if (s.toUpperCase() === 'ALL') return ['ALL'];
  return [
    ...new Set(
      s
        .split(/[,;]/)
        .map((p) => String(p).trim().replace(/\s+/g, ''))
        .filter(Boolean)
    )
  ];
}

function normalizeTeacherRow(raw) {
  const teacher_name = normalizeTeacherName(
    raw.teacher_name ?? raw.TEACHER_NAME ?? raw.name ?? ''
  );
  const assigned_raw = String(
    raw.assigned_classes ?? raw.ASSIGNED_CLASSES ?? raw.ASSIGNED_CLASS ?? ''
  ).trim();
  const role = String(raw.role ?? raw.ROLE ?? 'teacher')
    .trim()
    .toLowerCase();
  const assignedClasses = parseAssignedClasses(assigned_raw);
  const hasAll = assignedClasses.includes('ALL');
  const isAdmin = ADMIN_ROLES.has(role) || hasAll;
  const classesForSession = hasAll
    ? ['ALL']
    : assignedClasses.length
      ? assignedClasses
      : isAdmin
        ? ['ALL']
        : [];

  return {
    teacher_name,
    role: isAdmin ? 'admin' : role || 'teacher',
    assignedClasses: classesForSession,
    isAdmin
  };
}

async function gasRequest(action, payload = {}) {
  const url = process.env.GAS_WEB_APP_URL;
  if (!url) {
    throw new HttpsError(
      'failed-precondition',
      'GAS_WEB_APP_URL is not configured for Cloud Functions'
    );
  }

  const secret = process.env.GAS_SECRET;
  const body = { action, ...(secret ? { secret } : {}), ...payload };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body)
  });

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new HttpsError('internal', 'Invalid response from Apps Script');
  }

  const failed = data?.ok === false || data?.success === false;
  if (!res.ok || failed) {
    const msg =
      typeof data?.error === 'string'
        ? data.error
        : typeof data?.message === 'string'
          ? data.message
          : `HTTP ${res.status}`;
    throw new HttpsError('permission-denied', msg);
  }
  return data ?? {};
}

async function verifyTeacherWithGas(teacherName, pin = '') {
  const out = await gasRequest('verifyTeacherLogin', {
    teacherName: normalizeTeacherName(teacherName),
    pin: String(pin ?? '').trim()
  });
  if (!out?.teacher) return null;
  return normalizeTeacherRow(out.teacher);
}

async function lookupTeacherFromSheet(teacherName) {
  const out = await gasRequest('getTeachers', {});
  const list = Array.isArray(out?.teachers)
    ? out.teachers
    : Array.isArray(out?.data?.teachers)
      ? out.data.teachers
      : [];
  const input = normalizeTeacherName(teacherName).toLowerCase();
  const row = list.find((t) => {
    const name = normalizeTeacherName(t.teacher_name ?? t.TEACHER_NAME ?? '').toLowerCase();
    return name === input;
  });
  return row ? normalizeTeacherRow(row) : null;
}

async function mintTokenForTeacher(teacher) {
  const uid = teacherUid(teacher.teacher_name);
  const isAdmin = Boolean(teacher.isAdmin);
  const assignedClasses = teacher.assignedClasses?.length
    ? teacher.assignedClasses
    : isAdmin
      ? ['ALL']
      : [];

  if (!isAdmin && !assignedClasses.length) {
    throw new HttpsError('permission-denied', 'No assigned classes for this teacher');
  }

  await admin.auth().setCustomUserClaims(uid, {
    role: isAdmin ? 'admin' : 'teacher',
    admin: isAdmin,
    teacherName: teacher.teacher_name,
    assignedClasses
  });

  try {
    await admin.auth().getUser(uid);
  } catch (e) {
    if (e?.code === 'auth/user-not-found') {
      await admin.auth().createUser({
        uid,
        displayName: teacher.teacher_name
      });
    } else {
      throw e;
    }
  }

  const token = await admin.auth().createCustomToken(uid);
  return { token, uid, teacherName: teacher.teacher_name, isAdmin, assignedClasses };
}

/**
 * Callable: issueTeacherToken({ teacherName, pin?, refreshSession? })
 * - With pin: full GAS verifyTeacherLogin (login form).
 * - refreshSession: reload claims from getTeachers (app startup, no PIN).
 */
exports.issueTeacherToken = onCall({ cors: true }, async (request) => {
  const teacherName = normalizeTeacherName(request.data?.teacherName);
  const pin = String(request.data?.pin ?? '').trim();
  const refreshSession = Boolean(request.data?.refreshSession);

  if (!teacherName) {
    throw new HttpsError('invalid-argument', 'teacherName is required');
  }

  let teacher;
  if (refreshSession) {
    teacher = await lookupTeacherFromSheet(teacherName);
    if (!teacher) {
      throw new HttpsError('permission-denied', 'Teacher not found in TEACHERS sheet');
    }
  } else {
    teacher = await verifyTeacherWithGas(teacherName, pin);
    if (!teacher) {
      throw new HttpsError('permission-denied', 'Invalid teacher name or PIN');
    }
  }

  return mintTokenForTeacher(teacher);
});
