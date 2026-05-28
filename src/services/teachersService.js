import { isPinLoginEnabled } from './appConfig.js';
import {
  fetchTeachersGas,
  verifyTeacherLoginGas,
  teacherRequiresPinGas,
  changeTeacherPinGas,
  adminResetTeacherPinGas
} from './googleAppsScript.js';
import {
  parseAssignedClasses,
  saveTeacherAuthSession,
  isAdminSession,
  normalizeTeacherName,
  getTeacherNameCore,
  teacherNamesExactMatch,
  isReservedLoginTerm,
  isAdminRoleFromSheet,
  teacherNamesMatch,
  teacherNameMatchScore
} from './teacherAuth.js';

/**
 * @param {ReturnType<typeof normalizeTeacherRow>[]} teachers
 * @param {string} input
 */
function findTeacherCandidates(teachers, input) {
  const normalizedInput = normalizeTeacherName(input);
  const q = normalizedInput.toLowerCase();

  // Block "admin" etc. unless TEACHER_NAME in sheet is exactly that string
  if (isReservedLoginTerm(normalizedInput)) {
    const exact = teachers.filter((t) => teacherNamesExactMatch(t.teacher_name, normalizedInput));
    return exact.map((t) => ({ t, score: 100 }));
  }

  const scored = teachers
    .map((t) => ({ t, score: teacherNameMatchScore(t.teacher_name, normalizedInput) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length) return scored;

  // Fallback: substring on full name or core name (e.g. "เกศจุฬา" in "นางสาวเกศจุฬา ภูนาเมือง")
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
  const role = String(raw.role ?? raw.ROLE ?? 'teacher').trim().toLowerCase();
  const assignedClasses = parseAssignedClasses(assigned_raw);
  const hasAll = assignedClasses.includes('ALL');
  const isAdmin = isAdminRoleFromSheet(role) || hasAll;
  /** Admin + ม.1/3 keeps homeroom; admin with no class → ALL */
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
    role: isAdmin ? 'admin' : role || 'teacher',
    isAdmin,
    mustChangePin: Boolean(raw.must_change_pin ?? raw.MUST_CHANGE_PIN ?? raw.force_pin_reset ?? raw.FORCE_PIN_RESET),
    active:
      raw.active !== false &&
      raw.ACTIVE !== false &&
      String(raw.ACTIVE ?? raw.active ?? 'true').toLowerCase() !== 'false'
  };
}

/**
 * Load teachers from Google Sheets TEACHERS tab via Apps Script getTeachers.
 * @returns {Promise<ReturnType<typeof normalizeTeacherRow>[]>}
 */
/**
 * Whether the login form should show PIN (checked server-side; PIN never returned).
 * @param {string} teacherNameInput
 * @returns {Promise<{ found: boolean, requiresPin: boolean }>}
 */
export async function checkTeacherRequiresPin(teacherNameInput) {
  const input = String(teacherNameInput ?? '').trim();
  if (!input) return { found: false, requiresPin: false };

  try {
    const out = await teacherRequiresPinGas(input);
    return {
      found: Boolean(out?.found),
      requiresPin: Boolean(out?.requiresPin) || Boolean(out?.ambiguous),
      ambiguous: Boolean(out?.ambiguous)
    };
  } catch (err) {
    console.warn('[teachers] teacherRequiresPin failed:', err);
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
 * Legacy login — match TEACHER_NAME from getTeachers (no PIN).
 * @param {string} loginInput
 */
async function resolveTeacherLoginByName(loginInput) {
  const input = String(loginInput ?? '').trim();
  if (!input) throw new Error('กรุณาระบุชื่อครู');

  if (isReservedLoginTerm(input)) {
    throw new Error(`ไม่สามารถใช้ "${input}" เป็นชื่อล็อกอิน — กรุณาใช้ชื่อครูตามคอลัมน์ TEACHER_NAME`);
  }

  console.log('[teachers] resolveTeacherLoginByName for:', input);

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

  if (!match.isAdmin && !match.assignedClasses.length) {
    throw new Error('ครูท่านนี้ยังไม่ได้รับมอบหมายห้องเรียน');
  }

  /** @type {import('./teacherAuth.js').TeacherAuthSession} */
  const session = {
    teacherName: match.teacher_name,
    username: match.username || '',
    userId: match.userId || '',
    role: match.role,
    assignedClasses: match.assignedClasses,
    isAdmin: match.isAdmin,
    mustChangePin: false
  };

  console.log('[teachers] login OK (name):', {
    teacherName: session.teacherName,
    role: session.role,
    classes: session.assignedClasses,
    isAdmin: session.isAdmin
  });

  saveTeacherAuthSession(session);
  return session;
}

/**
 * Resolve login — PIN mode uses GAS; legacy mode matches teacher name from sheet.
 * @param {string} loginInput
 * @param {string} [pinInput]
 */
export async function resolveTeacherLogin(loginInput, pinInput = '') {
  if (!isPinLoginEnabled()) {
    return resolveTeacherLoginByName(loginInput);
  }

  const input = String(loginInput ?? '').trim();
  const pin = String(pinInput ?? '').trim();
  if (!input) throw new Error('กรุณาระบุชื่อผู้ใช้');

  console.log('[teachers] resolveTeacherLogin for:', input);

  let out;
  try {
    out = await verifyTeacherLoginGas(input, pin);
  } catch (err) {
    console.error('[teachers] verifyTeacherLogin failed:', err);
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('Unknown action')) {
      throw new Error(
        'เซิร์ฟเวอร์ยังไม่รองรับ verifyTeacherLogin — Deploy Web App จาก Code.gs ล่าสุด'
      );
    }
    throw err instanceof Error ? err : new Error(message);
  }

  const raw = out?.teacher;
  if (!raw) {
    throw new Error('ไม่พบข้อมูลครู — ตรวจสอบแท็บ TEACHERS');
  }

  const match = normalizeTeacherRow(raw);

  if (!match.isAdmin && !match.assignedClasses.length) {
    throw new Error('ครูท่านนี้ยังไม่ได้รับมอบหมายห้องเรียน');
  }

  /** @type {import('./teacherAuth.js').TeacherAuthSession} */
  const session = {
    teacherName: match.teacher_name,
    username: match.username || input,
    userId: match.userId || '',
    role: match.role,
    assignedClasses: match.assignedClasses,
    isAdmin: match.isAdmin,
    mustChangePin: Boolean(match.mustChangePin)
  };

  console.log('[teachers] login OK:', {
    teacherName: session.teacherName,
    role: session.role,
    classes: session.assignedClasses,
    isAdmin: session.isAdmin
  });

  saveTeacherAuthSession(session);
  return session;
}

/**
 * @param {import('./teacherAuth.js').TeacherAuthSession} session
 * @param {{ currentPin?: string, newPin: string, newUsername?: string, forceReset?: boolean }} payload
 */
export async function changeTeacherPin(session, payload) {
  const newPin = String(payload?.newPin ?? '').trim();
  const newUsername = String(payload?.newUsername ?? '').trim();
  if (newPin.length < 6) {
    throw new Error('PIN ต้องมีอย่างน้อย 6 หลัก');
  }
  if (newUsername && newUsername.length < 3) {
    throw new Error('Username ต้องมีอย่างน้อย 3 ตัวอักษร');
  }
  await changeTeacherPinGas({
    teacherName: session?.teacherName,
    username: session?.username,
    currentPin: String(payload?.currentPin ?? '').trim(),
    newPin,
    newUsername,
    forceReset: Boolean(payload?.forceReset || session?.mustChangePin)
  });
  if (newUsername) {
    session.username = newUsername;
  }
}

/**
 * Admin resets another teacher's PIN (must re-login with temp PIN on next use).
 * @param {import('./teacherAuth.js').TeacherAuthSession} session
 * @param {{ adminPin: string, targetUsername: string, newPin?: string }} payload
 * @returns {Promise<{ username: string, teacherName: string, tempPin: string }>}
 */
export async function adminResetTeacherPin(session, payload) {
  if (!isAdminSession(session)) {
    throw new Error('ไม่มีสิทธิ์ผู้ดูแลระบบ');
  }
  const adminPin = String(payload?.adminPin ?? '').trim();
  const targetUsername = String(payload?.targetUsername ?? '').trim().toLowerCase();
  const newPin = String(payload?.newPin ?? '').trim();
  if (!adminPin) throw new Error('กรุณากรอก PIN ผู้ดูแลระบบ');
  if (!targetUsername) throw new Error('กรุณาเลือกครูที่ต้องการรีเซ็ต');
  if (newPin && newPin.length < 6) {
    throw new Error('PIN ชั่วคราวต้องมีอย่างน้อย 6 หลัก');
  }

  let out;
  try {
    out = await adminResetTeacherPinGas({
      adminUsername: session?.username || '',
      adminPin,
      targetUsername,
      newPin
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('Unknown action')) {
      throw new Error(
        'เซิร์ฟเวอร์ยังไม่รองรับ adminResetTeacherPin — Deploy Web App จาก Code.gs ล่าสุด'
      );
    }
    throw err instanceof Error ? err : new Error(message);
  }

  const tempPin = String(out?.temp_pin ?? out?.tempPin ?? '').trim();
  if (!tempPin) {
    throw new Error('รีเซ็ตไม่สำเร็จ — ไม่ได้รับ PIN ชั่วคราวจากเซิร์ฟเวอร์');
  }

  return {
    username: String(out?.username ?? targetUsername).trim(),
    teacherName: String(out?.teacher_name ?? out?.teacherName ?? '').trim(),
    tempPin
  };
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
    role: row.role,
    assignedClasses: row.assignedClasses,
    isAdmin: row.isAdmin
  };
  saveTeacherAuthSession(session);
  return session;
}
