/**
 * Google Apps Script Web App client
 *
 * Students sheet: STUDENT_ID, PREFIX, FIRST_NAME, LAST_NAME, LEVEL, ROOM, NUMBER, CLASS_KEY, PARENT_NAME, PARENT_PHONE
 * Attendance sheet: DATE, STUDENT_ID, STATUS, TYPE, TERM, TIMESTAMP, unique_key
 *
 * Configure via `.env` only: VITE_GAS_WEB_APP_URL or VITE_GOOGLE_SCRIPT_URL, optional VITE_GAS_SECRET
 */

import { loadConfig } from './appConfig.js';
import { normalizeSheetLevel } from './teacherAuth.js';

function config() {
  const { gasUrl, gasSecret } = loadConfig();
  return { url: gasUrl, secret: gasSecret };
}

export function isGasConfigured() {
  return Boolean(config().url);
}

/**
 * @param {string} action
 * @param {Record<string, unknown>} [payload]
 */
export async function gasRequest(action, payload = {}) {
  const { url, secret } = config();
  if (!url) {
    throw new Error('ยังไม่ได้ตั้งค่า Google Sheets API — ติดต่อผู้ดูแลระบบ (VITE_GAS_WEB_APP_URL)');
  }

  const body = { action, ...(secret ? { secret } : {}), ...payload };
  console.log('[GAS] request', action, { ...payload, secret: secret ? '***' : undefined });

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(body)
    });
  } catch (err) {
    console.error('[GAS] network error', err);
    throw new Error(
      `ไม่สามารถเชื่อมต่อ Web App ได้: ${err?.message || 'Failed to fetch'}. ` +
        'ตรวจสอบว่า URL ถูกต้องและ Web App เปิดให้ Anyone เข้าถึงได้'
    );
  }

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (parseErr) {
    console.error('[GAS] invalid JSON', text?.slice?.(0, 200));
    throw new Error('API ตอบกลับไม่ใช่ JSON — ตรวจสอบ Apps Script deploy URL');
  }

  console.log('[GAS] response', action, data);

  const failed = data?.ok === false || data?.success === false;
  if (!res.ok || failed) {
    const msg =
      typeof data?.error === 'string'
        ? data.error
        : typeof data?.message === 'string'
          ? data.message
          : `HTTP ${res.status}`;
    console.error('[GAS] API error', msg);
    throw new Error(msg);
  }
  return data ?? {};
}

/**
 * GET request — ?action=... (read-only endpoints, e.g. getTeachers)
 * @param {string} action
 * @param {Record<string, string>} [queryParams]
 */
export async function gasGetRequest(action, queryParams = {}) {
  const { url, secret } = config();
  if (!url) {
    throw new Error('ยังไม่ได้ตั้งค่า Google Sheets API — ติดต่อผู้ดูแลระบบ (VITE_GAS_WEB_APP_URL)');
  }

  const params = new URLSearchParams({ action, ...queryParams });
  if (secret) params.set('secret', secret);
  const fullUrl = `${url}${url.includes('?') ? '&' : '?'}${params.toString()}`;

  console.log('[GAS] GET', fullUrl.replace(secret || '', '***'));

  let res;
  try {
    res = await fetch(fullUrl, { method: 'GET', mode: 'cors' });
  } catch (err) {
    console.error('[GAS] GET network error', err);
    throw new Error(`ไม่สามารถเชื่อมต่อ Web App ได้: ${err?.message || 'Failed to fetch'}`);
  }

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    console.error('[GAS] GET invalid JSON', text?.slice?.(0, 200));
    throw new Error('API ตอบกลับไม่ใช่ JSON — ตรวจสอบ Apps Script deploy URL');
  }

  console.log('[GAS] GET response', action, data);

  const failed =
    data?.ok === false ||
    data?.success === false ||
    (typeof data?.error === 'string' && data.error.length > 0 && data.success !== true);
  if (!res.ok || failed) {
    const msg =
      typeof data?.error === 'string'
        ? data.error
        : typeof data?.message === 'string'
          ? data.message
          : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data ?? {};
}

/**
 * @param {unknown} data
 * @returns {object[]}
 */
export function parseTeachersResponse(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.teachers)) return data.teachers;
  if (Array.isArray(data?.data?.teachers)) return data.data.teachers;
  return [];
}

/**
 * @param {unknown} data
 * @returns {object[]}
 */
export function parseStudentsResponse(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.students)) return data.students;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.data?.students)) return data.data.students;
  return [];
}

/**
 * @param {object} raw
 */
export function normalizeStudentRow(raw) {
  return {
    student_id: String(raw.student_id ?? raw.STUDENT_ID ?? '').trim(),
    prefix: String(raw.prefix ?? raw.PREFIX ?? '').trim(),
    first_name: String(raw.first_name ?? raw.FIRST_NAME ?? '').trim(),
    last_name: String(raw.last_name ?? raw.LAST_NAME ?? '').trim(),
    level: String(raw.level ?? raw.LEVEL ?? '').trim(),
    room: String(raw.room ?? raw.ROOM ?? '').trim(),
    number: String(raw.number ?? raw.NUMBER ?? '').trim(),
    class_key: String(raw.class_key ?? raw.CLASS_KEY ?? '').trim(),
    parent_name: String(raw.parent_name ?? raw.PARENT_NAME ?? '').trim(),
    parent_phone: String(raw.parent_phone ?? raw.PARENT_PHONE ?? '').trim()
  };
}

/**
 * @param {{ level?: string, room?: string }} [filters]
 */
export async function fetchStudentsGas(filters = {}) {
  const levelRaw = String(filters.level ?? '').trim();
  const room = String(filters.room ?? '').trim();
  const level = normalizeSheetLevel(levelRaw);

  console.log('Fetching students...', {
    level: level || '(all)',
    room: room || '(all)',
    levelRaw: levelRaw !== level ? levelRaw : undefined
  });

  const out = await gasRequest('getStudents', {
    ...(level ? { level } : {}),
    ...(room ? { room } : {}),
    ...(levelRaw && levelRaw !== level ? { level_raw: levelRaw } : {})
  });

  const rawList = parseStudentsResponse(out);
  console.log('[GAS] API response students count:', rawList.length);

  let list = rawList.map(normalizeStudentRow).filter((s) => s.student_id && (s.first_name || s.last_name));

  const norm = (v) => String(v ?? '').trim();
  if (level) {
    list = list.filter((s) => norm(s.level) === norm(level));
  }
  if (room) {
    list = list.filter((s) => norm(s.room) === norm(room));
  }

  list.sort((a, b) =>
    String(a.number).localeCompare(String(b.number), undefined, { numeric: true })
  );

  console.log('Student count loaded:', list.length);
  return list;
}

function buildClassOptionsFromStudents(students) {
  const levels = [...new Set(students.map((s) => s.level).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  );
  /** @type {Record<string, string[]>} */
  const roomsByLevel = {};
  for (const s of students) {
    if (!s.level || !s.room) continue;
    if (!roomsByLevel[s.level]) roomsByLevel[s.level] = [];
    const rm = String(s.room).trim();
    if (!roomsByLevel[s.level].includes(rm)) roomsByLevel[s.level].push(rm);
  }
  Object.keys(roomsByLevel).forEach((lvl) => {
    roomsByLevel[lvl].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  });
  return { levels, roomsByLevel };
}

/**
 * Level/room lists from Google Sheets (via full student roster).
 * Deployed scripts without getClassOptions use this path automatically.
 */
/**
 * Teachers roster from TEACHERS sheet — POST first (best CORS with GAS), GET fallback.
 */
export async function fetchTeachersGas() {
  console.log('[GAS] fetchTeachersGas — action=getTeachers');

  try {
    const out = await gasRequest('getTeachers');
    const teachers = parseTeachersResponse(out);
    console.log('[GAS] getTeachers (POST) count:', teachers.length);
    return teachers;
  } catch (postErr) {
    const postMsg = String(postErr?.message || postErr);
    console.warn('[GAS] getTeachers POST failed:', postMsg);

    if (postMsg.includes('Failed to fetch')) {
      throw new Error(
        'ไม่สามารถเชื่อมต่อ Google Apps Script — ตรวจสอบ VITE_GAS_WEB_APP_URL ใน .env (ไม่มีช่องว่าง/ตัวอักษรเกิน) และตั้ง Deploy เป็น Anyone'
      );
    }

    console.log('[GAS] retry getTeachers via GET ?action=getTeachers');
    const out = await gasGetRequest('getTeachers');
    const teachers = parseTeachersResponse(out);
    console.log('[GAS] getTeachers (GET) count:', teachers.length);
    return teachers;
  }
}

export async function fetchClassOptionsGas() {
  console.log('[GAS] Fetching class options from student roster...');

  try {
    const out = await gasRequest('getClassOptions');
    if (out?.ok !== false) {
      const levels = Array.isArray(out?.levels) ? out.levels.map(String).filter(Boolean) : [];
      const roomsByLevel =
        out?.roomsByLevel && typeof out.roomsByLevel === 'object' ? out.roomsByLevel : {};
      if (levels.length) {
        return {
          levels: [...new Set(levels)].sort((a, b) =>
            a.localeCompare(b, undefined, { numeric: true })
          ),
          roomsByLevel
        };
      }
    }
  } catch (err) {
    console.warn('[GAS] getClassOptions not available:', err?.message);
  }

  const students = await fetchStudentsGas();
  if (!students.length) {
    throw new Error('ไม่พบรายชื่อนักเรียนใน Google Sheets — ตรวจสอบแท็บ Students และหัวคอลัมน์');
  }
  const options = buildClassOptionsFromStudents(students);
  console.log('[GAS] class options from roster:', options.levels);
  return options;
}

export async function fetchAttendanceGas(dateKey, level, room, studentIds) {
  const out = await gasRequest('getAttendance', {
    date: dateKey,
    type: level,
    term: room,
    level,
    room,
    student_ids: studentIds
  });
  const raw = out?.attendance ?? out?.data?.attendance ?? null;
  const records = Array.isArray(out?.records) ? out.records : Array.isArray(out?.data?.records) ? out.data.records : [];
  if (!raw || typeof raw !== 'object') return { attendance: {}, records };
  /** @type {Record<string,string>} */
  const map = {};
  for (const [k, v] of Object.entries(raw)) {
    map[String(k)] = String(v).toLowerCase();
  }
  return { attendance: map, records };
}

export async function saveAttendanceGas(opts) {
  const { date, level, room, checked_by, records } = opts;
  return gasRequest('saveAttendance', {
    date,
    type: level,
    term: room,
    level,
    room,
    checked_by: checked_by || '',
    records
  });
}

export async function pingGas() {
  return gasRequest('ping');
}

/**
 * Server-side login — PIN verified in Apps Script (not exposed via getTeachers).
 * @param {string} identifier
 * @param {string} [pin]
 */
export async function verifyTeacherLoginGas(identifier, pin = '') {
  const value = String(identifier ?? '').trim();
  return gasRequest('verifyTeacherLogin', {
    teacherName: value,
    username: value,
    login: value,
    pin: String(pin ?? '').trim()
  });
}

/**
 * Whether login should show PIN field (no PIN value returned).
 * @param {string} teacherName
 */
export async function teacherRequiresPinGas(teacherName) {
  return gasRequest('teacherRequiresPin', {
    teacherName: String(teacherName ?? '').trim()
  });
}

/**
 * Change current teacher credentials on server.
 * @param {{ teacherName?: string, username?: string, currentPin?: string, newPin: string, newUsername?: string, forceReset?: boolean }} payload
 */
export async function changeTeacherPinGas(payload) {
  return gasRequest('changeTeacherCredentials', {
    teacherName: String(payload?.teacherName ?? '').trim(),
    username: String(payload?.username ?? '').trim(),
    currentPin: String(payload?.currentPin ?? '').trim(),
    newPin: String(payload?.newPin ?? '').trim(),
    newUsername: String(payload?.newUsername ?? '').trim(),
    forceReset: Boolean(payload?.forceReset)
  });
}

/**
 * Admin resets another teacher's PIN (verified server-side).
 * @param {{ adminUsername: string, adminPin: string, targetUsername: string, newPin?: string }} payload
 */
export async function adminResetTeacherPinGas(payload) {
  return gasRequest('adminResetTeacherPin', {
    adminUsername: String(payload?.adminUsername ?? '').trim(),
    adminPin: String(payload?.adminPin ?? '').trim(),
    targetUsername: String(payload?.targetUsername ?? '').trim(),
    newPin: String(payload?.newPin ?? '').trim()
  });
}
