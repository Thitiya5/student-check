import {
  fetchTeachersGas,
  teacherRequiresPinGas,
  verifyAdminLoginByNameGas,
  verifyPastoralPinByNameGas,
  changeTeacherPinGas
} from './googleAppsScript.js';
import {
  parseAssignedClasses,
  saveTeacherAuthSession,
  isAdminSession,
  isPastoralRoleFromSheet,
  isPastoralSession,
  normalizeTeacherName,
  getTeacherNameCore,
  teacherNamesExactMatch,
  isReservedLoginTerm,
  isAdminRoleFromSheet,
  teacherNameMatchScore
} from './teacherAuth.js';

/**
 * @param {ReturnType<typeof normalizeTeacherRow>[]} teachers
 * @param {string} input
 */
function findTeacherCandidates(teachers, input) {
  const normalizedInput = normalizeTeacherName(input);
  const q = normalizedInput.toLowerCase();

  if (isReservedLoginTerm(normalizedInput)) {
    const exact = teachers.filter((t) => teacherNamesExactMatch(t.teacher_name, normalizedInput));
    return exact.map((t) => ({ t, score: 100 }));
  }

  const scored = teachers
    .map((t) => ({ t, score: teacherNameMatchScore(t.teacher_name, normalizedInput) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length) return scored;

  if (q.length < 2) return [];

  return teachers
    .map((t) => {
      const full = normalizeTeacherName(t.teacher_name).toLowerCase();
      const core = getTeacherNameCore(t.teacher_name);
      let score = 0;
      if (full.includes(q)) score = 70;
      else if (core.includes(q)) score = 65;
      else if (q.length >= 3 && core.split(/\s+/).some((w) => w.startsWith(q) || q.startsWith(w))) score = 55;
      return { t, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
}

/**
 * @param {ReturnType<typeof normalizeTeacherRow>[]} teachers
 * @param {string} input
 */
function suggestSimilarTeachers(teachers, input, limit = 5) {
  const q = normalizeTeacherName(input).toLowerCase();
  if (q.length < 2) return [];

  return teachers
    .map((t) => {
      const full = normalizeTeacherName(t.teacher_name).toLowerCase();
      const core = getTeacherNameCore(t.teacher_name);
      let score = 0;
      if (full.includes(q) || core.includes(q)) score += 20;
      const first = core.split(/\s+/)[0] || '';
      if (first && (first.startsWith(q) || q.startsWith(first))) score += 15;
      for (let i = 0; i < Math.min(q.length, full.length); i++) {
        if (q[i] === full[i]) score++;
        else break;
      }
      return { name: t.teacher_name, score };
    })
    .filter((x) => x.score >= 4)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.name);
}

/**
 * @param {unknown} raw
 */
export function normalizeTeacherRow(raw) {
  const teacher_name = normalizeTeacherName(
    raw.teacher_name ?? raw.TEACHER_NAME ?? raw.name ?? ''
  );
  const username = String(raw.username ?? raw.USERNAME ?? '').trim();
  const userId = String(raw.user_id ?? raw.USER_ID ?? '').trim();
  const assigned_raw = String(
    raw.assigned_classes ?? raw.ASSIGNED_CLASSES ?? raw.ASSIGNED_CLASS ?? ''
  ).trim();
  const roleRaw = String(raw.role ?? raw.ROLE ?? 'teacher').trim().toLowerCase();
  const assignedClasses = parseAssignedClasses(assigned_raw);
  const hasAll = assignedClasses.includes('ALL');
  const isAdmin = isAdminRoleFromSheet(roleRaw) || hasAll;
  const isPastoral = isPastoralRoleFromSheet(roleRaw);
  const classesForSession = hasAll
    ? ['ALL']
    : assignedClasses.length
      ? assignedClasses
      : isAdmin
        ? ['ALL']
        : [];

  return {
    teacher_name,
    username,
    userId,
    assigned_classes: assigned_raw,
    assignedClasses: classesForSession,
    role: isAdmin ? 'admin' : isPastoral ? 'pastoral' : roleRaw || 'teacher',
    isAdmin,
    isPastoral,
    mustChangePin: false,
    active:
      raw.active !== false &&
      raw.ACTIVE !== false &&
      String(raw.ACTIVE ?? raw.active ?? 'true').toLowerCase() !== 'false'
  };
}

/**
 * Whether the login form should show PIN (admin and pastoral accounts).
 * @param {string} teacherNameInput
 * @returns {Promise<{ found: boolean, requiresPin: boolean, ambiguous?: boolean }>}
 */
export async function checkTeacherRequiresPin(teacherNameInput) {
  const input = String(teacherNameInput ?? '').trim();
  if (!input) return { found: false, requiresPin: false };

  try {
    const out = await teacherRequiresPinGas(input);
    if (out?.found) {
      return {
        found: true,
        requiresPin: Boolean(out?.requiresPin) || Boolean(out?.ambiguous),
        ambiguous: Boolean(out?.ambiguous)
      };
    }
  } catch (err) {
    console.warn('[teachers] teacherRequiresPin failed:', err);
  }

  try {
    const teachers = await fetchTeachers();
    const candidates = findTeacherCandidates(teachers, input);
    if (!candidates.length) return { found: false, requiresPin: false };
    const top = candidates[0];
    const second = candidates[1];
    if (second && top.score === second.score && top.score < 100) {
      return { found: true, requiresPin: true, ambiguous: true };
    }
    const match = top.t;
    return {
      found: true,
      requiresPin: Boolean(match.isAdmin || match.isPastoral),
      ambiguous: false
    };
  } catch (err) {
    console.warn('[teachers] checkTeacherRequiresPin fallback failed:', err);
    return { found: false, requiresPin: false };
  }
}

export async function fetchTeachers() {
  console.log('[teachers] fetchTeachers() — loading from GAS...');
  const rawList = await fetchTeachersGas();
  const list = rawList.map(normalizeTeacherRow).filter((t) => t.teacher_name);
  console.log('[teachers] loaded', list.length, 'teacher(s):', list.map((t) => t.teacher_name));
  return list;
}

/**
 * @param {ReturnType<typeof normalizeTeacherRow>} match
 * @returns {import('./teacherAuth.js').TeacherAuthSession}
 */
function sessionFromTeacherRow(match) {
  return {
    teacherName: match.teacher_name,
    username: match.username || '',
    userId: match.userId || '',
    role: match.role,
    assignedClasses: match.assignedClasses,
    isAdmin: match.isAdmin,
    isPastoral: match.isPastoral,
    mustChangePin: false
  };
}

/**
 * Login — ครูใช้ชื่ออย่างเดียว / แอดมินและครูปกครองต้องกรอก PIN
 * @param {string} loginInput
 * @param {string} [pinInput]
 */
export async function resolveTeacherLogin(loginInput, pinInput = '') {
  const input = String(loginInput ?? '').trim();
  if (!input) throw new Error('กรุณาระบุชื่อครู');

  if (isReservedLoginTerm(input)) {
    throw new Error(`ไม่สามารถใช้ "${input}" เป็นชื่อล็อกอิน — กรุณาใช้ชื่อครูตามคอลัมน์ TEACHER_NAME`);
  }

  console.log('[teachers] resolveTeacherLogin for:', input);

  const teachers = await fetchTeachers();
  const candidates = findTeacherCandidates(teachers, input);
  if (!candidates.length) {
    const hints = suggestSimilarTeachers(teachers, input);
    throw new Error(
      hints.length ? `ไม่พบชื่อครู — ลอง: ${hints.join(', ')}` : 'ไม่พบชื่อครูในระบบ — ตรวจสอบแท็บ TEACHERS'
    );
  }

  const top = candidates[0];
  const second = candidates[1];
  if (second && top.score === second.score && top.score < 100) {
    throw new Error('พบชื่อใกล้เคียงหลายคน — พิมพ์ชื่อเต็มให้ชัดขึ้น');
  }

  const match = top.t;
  if (match.active === false) {
    throw new Error('บัญชีถูกปิดการใช้งาน');
  }

  if (!match.isAdmin && !match.isPastoral && !match.assignedClasses.length) {
    throw new Error('ครูท่านนี้ยังไม่ได้รับมอบหมายห้องเรียน');
  }

  if (match.isAdmin) {
    const pin = String(pinInput ?? '').trim();
    if (!pin) throw new Error('กรุณากรอก PIN ผู้ดูแลระบบ');

    let out;
    try {
      out = await verifyAdminLoginByNameGas(match.teacher_name, pin);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('Unknown action')) {
        throw new Error(
          'เซิร์ฟเวอร์ยังไม่รองรับ verifyAdminLoginByName — Deploy Web App จาก Code.gs ล่าสุด'
        );
      }
      throw err instanceof Error ? err : new Error(message);
    }

    const verified = normalizeTeacherRow(out?.teacher ?? match);
    const session = sessionFromTeacherRow(verified);
    console.log('[teachers] admin login OK:', session.teacherName);
    saveTeacherAuthSession(session);
    return session;
  }

  if (match.isPastoral) {
    const pin = String(pinInput ?? '').trim();
    if (!pin) throw new Error('กรุณากรอก PIN ครูปกครอง');

    let out;
    try {
      out = await verifyPastoralPinByNameGas(match.teacher_name, pin);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('Unknown action')) {
        throw new Error(
          'เซิร์ฟเวอร์ยังไม่รองรับ verifyPastoralPinByName — Deploy Web App จาก Code.gs ล่าสุด'
        );
      }
      throw err instanceof Error ? err : new Error(message);
    }

    const verified = normalizeTeacherRow(out?.teacher ?? match);
    const session = sessionFromTeacherRow(verified);
    console.log('[teachers] pastoral login OK:', session.teacherName);
    saveTeacherAuthSession(session);
    return session;
  }

  const session = sessionFromTeacherRow(match);
  console.log('[teachers] teacher login OK (name):', session.teacherName);
  saveTeacherAuthSession(session);
  return session;
}

/**
 * Admin changes own PIN.
 * @param {import('./teacherAuth.js').TeacherAuthSession} session
 * @param {{ currentPin?: string, newPin: string }} payload
 */
export async function changeTeacherPin(session, payload) {
  if (!isAdminSession(session)) {
    throw new Error('ไม่มีสิทธิ์เปลี่ยน PIN');
  }
  const newPin = String(payload?.newPin ?? '').trim();
  if (newPin.length < 6) {
    throw new Error('PIN ต้องมีอย่างน้อย 6 หลัก');
  }
  await changeTeacherPinGas({
    teacherName: session?.teacherName,
    username: session?.username,
    currentPin: String(payload?.currentPin ?? '').trim(),
    newPin,
    forceReset: false
  });
}

/**
 * Build admin auth payload for GAS write actions.
 * @param {import('./teacherAuth.js').TeacherAuthSession} session
 * @param {string} adminPin
 */
/**
 * Verify PIN before pastoral behavior writes (admin uses admin PIN).
 * @param {import('./teacherAuth.js').TeacherAuthSession} session
 * @param {string} pin
 */
export async function verifyBehaviorWritePin(session, pin) {
  const pinStr = String(pin ?? '').trim();
  if (!pinStr) throw new Error('กรุณากรอก PIN');

  if (isAdminSession(session)) {
    await verifyAdminLoginByNameGas(session.teacherName, pinStr);
    return;
  }

  if (isPastoralSession(session)) {
    try {
      await verifyPastoralPinByNameGas(session.teacherName, pinStr);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('Unknown action')) {
        throw new Error(
          'เซิร์ฟเวอร์ยังไม่รองรับ verifyPastoralPinByName — Deploy Web App จาก Code.gs ล่าสุด'
        );
      }
      throw err instanceof Error ? err : new Error(message);
    }
    return;
  }

  throw new Error('ไม่มีสิทธิ์บันทึกพฤติกรรม');
}

export function buildAdminAuthPayload(session, adminPin = '') {
  return {
    adminUsername: String(session?.username ?? '').trim(),
    adminTeacherName: String(session?.teacherName ?? '').trim(),
    adminPin: String(adminPin ?? '').trim()
  };
}

/**
 * @param {import('./teacherAuth.js').TeacherAuthSession} session
 * @param {string} adminPin
 * @param {Record<string, unknown>} payload
 */
async function adminGasWrite(session, adminPin, action, payload) {
  if (!isAdminSession(session)) {
    throw new Error('ไม่มีสิทธิ์ผู้ดูแลระบบ');
  }
  const { adminCreateTeacherGas, adminUpdateTeacherGas, adminDeactivateTeacherGas } = await import(
    './googleAppsScript.js'
  );
  const auth = buildAdminAuthPayload(session, adminPin);
  const body = { ...auth, ...payload };
  const runners = {
    create: adminCreateTeacherGas,
    update: adminUpdateTeacherGas,
    deactivate: adminDeactivateTeacherGas
  };
  const fn = runners[action];
  if (!fn) throw new Error('Unknown admin action');
  try {
    return await fn(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('Unknown action')) {
      throw new Error('เซิร์ฟเวอร์ยังไม่รองรับการจัดการครู — Deploy Web App จาก Code.gs ล่าสุด');
    }
    throw err instanceof Error ? err : new Error(message);
  }
}

/**
 * @param {import('./teacherAuth.js').TeacherAuthSession} session
 * @param {{ adminPin: string, teacher_name: string, username: string, assigned_classes: string, role?: string }} payload
 */
export async function adminCreateTeacher(session, payload) {
  const username = String(payload?.username ?? '').trim().toLowerCase();
  const teacherName = String(payload?.teacher_name ?? '').trim();
  const assigned = String(payload?.assigned_classes ?? '').trim();
  if (!teacherName) throw new Error('กรุณาระบุชื่อครู');
  if (!username || username.length < 3) throw new Error('Username ต้องมีอย่างน้อย 3 ตัวอักษร');
  if (!assigned) throw new Error('กรุณาระบุห้องที่รับผิดชอบ');

  const out = await adminGasWrite(session, payload.adminPin, 'create', {
    teacher_name: teacherName,
    username,
    assigned_classes: assigned,
    role: String(payload?.role ?? 'teacher').trim()
  });
  return {
    teacher: normalizeTeacherRow(out?.teacher ?? {})
  };
}

/**
 * @param {import('./teacherAuth.js').TeacherAuthSession} session
 * @param {{ adminPin: string, username: string, teacher_name?: string, assigned_classes?: string, role?: string, active?: boolean }} payload
 */
export async function adminUpdateTeacher(session, payload) {
  const username = String(payload?.username ?? '').trim().toLowerCase();
  if (!username) throw new Error('กรุณาระบุ username');
  const out = await adminGasWrite(session, payload.adminPin, 'update', {
    username,
    teacher_name: String(payload?.teacher_name ?? '').trim(),
    assigned_classes: String(payload?.assigned_classes ?? '').trim(),
    role: String(payload?.role ?? '').trim(),
    active: payload?.active
  });
  return normalizeTeacherRow(out?.teacher ?? {});
}

/**
 * @param {import('./teacherAuth.js').TeacherAuthSession} session
 * @param {{ adminPin: string, username: string }} payload
 */
export async function adminDeactivateTeacher(session, payload) {
  return adminGasWrite(session, payload.adminPin, 'deactivate', {
    username: String(payload?.username ?? '').trim().toLowerCase()
  });
}

/**
 * @param {import('./teacherAuth.js').TeacherAuthSession|null} session
 */
export function describeTeacherAccess(session) {
  if (!session) return '';
  if (isAdminSession(session)) return 'ALL';
  return session.assignedClasses.join(', ');
}

/**
 * Re-load role/classes from Google Sheets (prevents forged localStorage admin).
 * @param {string} teacherName
 */
export async function refreshTeacherSessionFromSheet(teacherName) {
  const name = normalizeTeacherName(teacherName);
  if (!name) return null;

  const teachers = await fetchTeachers();
  const row = teachers.find((t) => teacherNamesExactMatch(t.teacher_name, name));
  if (!row) {
    console.warn('[teachers] session verify failed — not in TEACHERS sheet:', name);
    return null;
  }

  const session = {
    teacherName: row.teacher_name,
    username: row.username || '',
    role: row.role,
    assignedClasses: row.assignedClasses,
    isAdmin: row.isAdmin
  };
  saveTeacherAuthSession(session);
  return session;
}
