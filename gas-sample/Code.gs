/**
 * Google Apps Script — Web App backend for Student Attendance
 *
 * Deploy: Execute as Me | Who has access: Anyone (or your org)
 *
 * Sheet tabs:
 *   Students — STUDENT_ID, PREFIX, FIRST_NAME, LAST_NAME, LEVEL, ROOM, NUMBER, CLASS_KEY, PARENT_NAME, PARENT_PHONE
 *   TEACHERS — TEACHER_NAME, ASSIGNED_CLASSES, ROLE
 *   Attendance — DATE, STUDENT_ID, STATUS, TYPE, TERM, TIMESTAMP, unique_key
 *     (also accepts header typos: STAUS, TIMESAMP)
 *
 * TYPE  = ชั้น/ระดับ (ส่งจากแอพ = LEVEL เช่น M2)
 * TERM  = ห้อง/เทอม (ส่งจากแอพ = ROOM เช่น 1)
 *
 * Script property (optional): gasSecret
 */

const SHEET_ID = 'YOUR_SPREADSHEET_ID';
const SECRET_KEY = 'gasSecret';
const STUDENTS_SHEET = 'Students';
const ATTENDANCE_SHEET = 'Attendance';
const TEACHERS_SHEET = 'TEACHERS';
const PIN_SALT = 'student-check-2026';

/** Map logical field → possible header labels in row 1 */
const ATTENDANCE_HEADERS = {
  DATE: ['DATE'],
  STUDENT_ID: ['STUDENT_ID', 'STUDENT ID'],
  CHECKED_BY: ['CHECKED_BY', 'CHECKED BY', 'CHECKER', 'CHECKEDBY'],
  STATUS: ['STATUS', 'STAUS', 'STATUs'],
  TYPE: ['TYPE'],
  TERM: ['TERM'],
  TIMESTAMP: ['TIMESTAMP', 'TIMESAMP', 'TIME STAMP'],
  UNIQUE_KEY: ['UNIQUE_KEY', 'UNIQUE KEY', 'unique_key']
};

function checkSecret_(body) {
  const expected = PropertiesService.getScriptProperties().getProperty(SECRET_KEY);
  if (!expected) return true;
  return body && body.secret === expected;
}

function getSpreadsheet_() {
  const propId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const id = propId || SHEET_ID;
  if (!id || id === 'YOUR_SPREADSHEET_ID') {
    throw new Error('Missing SHEET_ID: set script property SHEET_ID or replace the SHEET_ID constant in Code.gs and redeploy the Web App.');
  }
  return SpreadsheetApp.openById(id);
}

/**
 * Normalize ?action= from doGet event (handles arrays / whitespace).
 * @param {GoogleAppsScript.Events.DoGet} e
 * @returns {string}
 */
function getActionFromEvent_(e) {
  var params = e && e.parameter ? e.parameter : {};
  var action = params.action;
  if (action === undefined || action === null || action === '') {
    return '';
  }
  if (Object.prototype.toString.call(action) === '[object Array]') {
    action = action[0];
  }
  return String(action).trim();
}

/**
 * GET ?action=getTeachers | getStudents | getClassOptions | getAttendance | ping
 */
function doGet(e) {
  Logger.log('doGet: start');
  e = e || {};
  var params = e.parameter || {};
  var action = getActionFromEvent_(e);
  if (!action) {
    action = 'ping';
  }
  Logger.log('doGet: action=[' + action + ']');

  if (params.secret) {
    if (!checkSecret_({ secret: params.secret })) {
      Logger.log('doGet: unauthorized (bad secret)');
      return jsonOut(fail_('Unauthorized'));
    }
  }

  try {
    switch (action) {
      case 'ping':
        Logger.log('doGet: ping');
        return jsonOut(
          ok_({ message: 'Student attendance API ready', actions: listActions_() })
        );

      case 'getTeachers': {
        Logger.log('doGet: getTeachers');
        var teachers = getTeachers();
        Logger.log('doGet: getTeachers count=' + teachers.length);
        return jsonOut({
          success: true,
          ok: true,
          teachers: teachers
        });
      }

      case 'getStudents': {
        Logger.log('doGet: getStudents');
        var level = String(params.level || '').trim();
        var room = String(params.room || params.term || '').trim();
        var students = readStudents_(level, room);
        Logger.log('doGet: getStudents count=' + students.length);
        return jsonOut({
          success: true,
          ok: true,
          students: students
        });
      }

      case 'getClassOptions': {
        Logger.log('doGet: getClassOptions');
        var opts = readClassOptions_();
        return jsonOut({
          success: true,
          ok: true,
          levels: opts.levels,
          roomsByLevel: opts.roomsByLevel
        });
      }

      case 'getAttendance': {
        Logger.log('doGet: getAttendance');
        var date = String(params.date || '');
        var type = String(params.type || params.level || '');
        var term = String(params.term || params.room || '');
        var out = readAttendanceForSession_(date, type, term, null);
        return jsonOut({
          success: true,
          ok: true,
          date: date,
          type: type,
          term: term,
          attendance: out.attendance,
          records: out.records
        });
      }

      default:
        Logger.log('doGet: unknown action [' + action + ']');
        return jsonOut(fail_('Unknown action: ' + action));
    }
  } catch (err) {
    Logger.log('doGet: error ' + err);
    return jsonOut(fail_('doGet error: ' + err));
  }
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents || '{}');
  } catch (err) {
    return jsonOut(fail_('Invalid JSON'));
  }

  if (!checkSecret_(body)) {
    return jsonOut(fail_('Unauthorized'));
  }

  try {
    const action = String(body.action || '').trim();
    const result = routeAction_(action, body);
    return jsonOut(result);
  } catch (err) {
    return jsonOut(fail_(String(err)));
  }
}

/**
 * Central action router for doGet / doPost.
 * @param {string} action
 * @param {Object} params
 */
function routeAction_(action, params) {
  params = params || {};

  switch (action) {
    case 'getStudents': {
      const level = String(params.level || '').trim();
      const room = String(params.room || params.term || '').trim();
      return ok_({ students: readStudents_(level, room) });
    }
    case 'getClassOptions':
      return ok_(readClassOptions_());
    case 'getTeachers':
      return ok_({ teachers: getTeachers() });
    case 'verifyTeacherLogin':
      return verifyTeacherLogin_(
        String(params.login || params.username || params.teacherName || params.name || ''),
        String(params.pin || params.teacherPin || '')
      );
    case 'teacherRequiresPin':
      return teacherRequiresPin_(String(params.teacherName || params.name || ''));
    case 'changeTeacherCredentials':
      return changeTeacherCredentials_(
        String(params.username || params.login || ''),
        String(params.currentPin || ''),
        String(params.newPin || ''),
        String(params.newUsername || ''),
        String(params.forceReset || '').toLowerCase() === 'true'
      );
    case 'adminResetTeacherPin':
      return adminResetTeacherPin_(
        String(params.adminUsername || ''),
        String(params.adminPin || ''),
        String(params.targetUsername || params.username || ''),
        String(params.newPin || params.tempPin || '')
      );
    case 'getAttendance': {
      const date = String(params.date || '');
      const type = String(params.type || params.level || '');
      const term = String(params.term || params.room || '');
      var studentIds = null;
      if (Array.isArray(params.student_ids)) {
        studentIds = params.student_ids.map(String);
      }
      const out = readAttendanceForSession_(date, type, term, studentIds);
      return ok_({
        date: date,
        type: type,
        term: term,
        attendance: out.attendance,
        records: out.records
      });
    }
    case 'saveAttendance': {
      const date = String(params.date || '');
      const type = String(params.type || params.level || '');
      const term = String(params.term || params.room || '');
      const records = Array.isArray(params.records) ? params.records : [];
      const saved = writeAttendanceRecords_(date, type, term, records);
      return ok_({ saved: saved, date: date, type: type, term: term });
    }
    case 'ping':
      return ok_({ message: 'Student attendance API ready', actions: listActions_() });
    default:
      return fail_('Unknown action: ' + action);
  }
}

function listActions_() {
  return [
    'ping',
    'getStudents',
    'getClassOptions',
    'getTeachers',
    'verifyTeacherLogin',
    'teacherRequiresPin',
    'changeTeacherCredentials',
    'adminResetTeacherPin',
    'getAttendance',
    'saveAttendance'
  ];
}

function ok_(payload) {
  const base = { ok: true, success: true };
  if (payload && typeof payload === 'object') {
    Object.keys(payload).forEach(function (k) {
      base[k] = payload[k];
    });
  }
  return base;
}

function fail_(message) {
  return { ok: false, success: false, error: String(message || 'Error') };
}

/**
 * Public API — load all teachers from TEACHERS sheet tab.
 * Used by doGet ?action=getTeachers and doPost action getTeachers.
 * @returns {Object[]}
 */
function getTeachers() {
  Logger.log('getTeachers: reading TEACHERS sheet');
  var rows = readTeachers_();
  Logger.log('getTeachers: loaded ' + rows.length + ' teacher(s)');
  return rows.map(publicTeacherRow_);
}

/**
 * Login — name + optional PIN verified server-side (PIN never sent in getTeachers).
 * @param {string} nameInput
 * @param {string} pinInput
 */
function teacherIsAdmin_(match) {
  var role = String(match.role || match.ROLE || '').toLowerCase();
  var assigned = String(match.ASSIGNED_CLASSES || match.assigned_classes || '');
  return (
    role === 'admin' ||
    role === 'adnim' ||
    assigned.toUpperCase().indexOf('ALL') >= 0
  );
}

/** True when login UI must collect PIN (sheet PIN or admin account). */
function teacherLoginRequiresPin_(match) {
  if (String(match.TEACHER_PIN || '').trim()) return true;
  return teacherIsAdmin_(match);
}

/**
 * Whether a matched teacher needs PIN on login (does not expose PIN value).
 * @param {string} nameInput
 */
function teacherRequiresPin_(nameInput) {
  var teachers = readTeachers_();
  var matches = findTeachersByLoginName_(teachers, nameInput);
  if (!matches.length) {
    return ok_({ found: false, requiresPin: false, ambiguous: false });
  }
  if (matches.length > 1) {
    return ok_({ found: true, requiresPin: true, ambiguous: true });
  }
  return ok_({
    found: true,
    requiresPin: teacherLoginRequiresPin_(matches[0]),
    ambiguous: false
  });
}

function verifyTeacherLogin_(nameInput, pinInput) {
  var teachers = readTeachers_();
  var login = String(nameInput || '').trim().toLowerCase();
  if (!login) return fail_('กรุณาระบุชื่อผู้ใช้');
  var match = null;
  var i;
  for (i = 0; i < teachers.length; i++) {
    if (String(teachers[i].USERNAME || '').trim().toLowerCase() === login) {
      match = teachers[i];
      break;
    }
  }
  if (!match) return fail_('ไม่พบผู้ใช้');
  if (!match.ACTIVE) return fail_('บัญชีถูกปิดการใช้งาน');

  var pinRequired = String(match.TEACHER_PIN || '').trim();
  var pinHash = String(match.PIN_HASH || '').trim();
  var isAdmin = teacherIsAdmin_(match);

  var pin = String(pinInput || '').trim();
  if (!pin) return fail_('กรุณาระบุ PIN');
  if (pinHash) {
    if (!verifyPin_(pin, pinHash)) return fail_('ชื่อผู้ใช้หรือ PIN ไม่ถูกต้อง');
  } else if (pinRequired) {
    if (pin !== pinRequired) return fail_('ชื่อผู้ใช้หรือ PIN ไม่ถูกต้อง');
  } else if (isAdmin) {
    return fail_('บัญชีผู้ดูแลระบบต้องตั้งรหัส PIN');
  } else {
    return fail_('บัญชีนี้ยังไม่ได้ตั้งค่า PIN');
  }

  if (!isAdmin && !String(match.ASSIGNED_CLASSES || match.assigned_classes || '').trim()) {
    return fail_('ครูท่านนี้ยังไม่ได้รับมอบหมายห้องเรียน');
  }

  return ok_({ teacher: publicTeacherRow_(match) });
}

function changeTeacherCredentials_(usernameInput, currentPin, newPin, newUsername, forceReset) {
  var username = String(usernameInput || '').trim().toLowerCase();
  var nextUsername = String(newUsername || '').trim().toLowerCase();
  var pin = String(newPin || '').trim();
  if (!username) return fail_('ไม่พบ username ปัจจุบัน');
  if (!pin || pin.length < 6) return fail_('PIN ต้องอย่างน้อย 6 หลัก');
  if (nextUsername && nextUsername.length < 3) return fail_('Username ต้องมีอย่างน้อย 3 ตัวอักษร');

  var sh = getTeachersSheet_();
  var vals = sh.getDataRange().getValues();
  if (vals.length < 2) return fail_('ไม่พบข้อมูลครู');
  var header = vals[0].map(normalizeHeader_);
  var col = function () {
    var names = Array.prototype.slice.call(arguments);
    for (var n = 0; n < names.length; n++) {
      var pos = header.indexOf(normalizeHeader_(names[n]));
      if (pos >= 0) return pos;
    }
    return -1;
  };
  var iUsername = col('USERNAME');
  var iPinHash = col('PIN_HASH');
  var iMustChange = col('MUST_CHANGE_PIN', 'FORCE_PIN_RESET');
  var iTeacherPin = col('TEACHER_PIN', 'PIN', 'PASSWORD', 'PASSCODE');
  if (iUsername < 0 || iPinHash < 0) return fail_('ต้องมีคอลัมน์ USERNAME และ PIN_HASH');

  var targetRow = -1;
  for (var r = 1; r < vals.length; r++) {
    if (String(vals[r][iUsername] || '').trim().toLowerCase() === username) {
      targetRow = r;
      break;
    }
  }
  if (targetRow < 0) return fail_('ไม่พบบัญชีผู้ใช้');

  var oldHash = String(vals[targetRow][iPinHash] || '').trim();
  var oldPin = iTeacherPin >= 0 ? String(vals[targetRow][iTeacherPin] || '').trim() : '';
  if (!forceReset) {
    var cp = String(currentPin || '').trim();
    if (!cp) return fail_('กรุณากรอก PIN ปัจจุบัน');
    if (oldHash) {
      if (!verifyPin_(cp, oldHash)) return fail_('PIN ปัจจุบันไม่ถูกต้อง');
    } else if (oldPin) {
      if (cp !== oldPin) return fail_('PIN ปัจจุบันไม่ถูกต้อง');
    } else {
      return fail_('บัญชีนี้ไม่มี PIN เดิมให้ตรวจสอบ');
    }
  }

  if (nextUsername && nextUsername !== username) {
    for (var i = 1; i < vals.length; i++) {
      if (i === targetRow) continue;
      if (String(vals[i][iUsername] || '').trim().toLowerCase() === nextUsername) {
        return fail_('Username นี้ถูกใช้งานแล้ว');
      }
    }
  }

  vals[targetRow][iPinHash] = hashPin_(pin);
  if (iMustChange >= 0) vals[targetRow][iMustChange] = false;
  if (nextUsername) vals[targetRow][iUsername] = nextUsername;
  if (iTeacherPin >= 0) vals[targetRow][iTeacherPin] = '';

  sh.getRange(2, 1, vals.length - 1, vals[0].length).setValues(vals.slice(1));
  return ok_({ success: true });
}

/**
 * Admin resets a teacher PIN — requires admin username + PIN verification.
 * Sets PIN_HASH, MUST_CHANGE_PIN=true, clears TEACHER_PIN.
 */
function adminResetTeacherPin_(adminUsername, adminPin, targetUsername, newPin) {
  var auth = verifyAdminPin_(adminUsername, adminPin);
  if (!auth.ok) return fail_(auth.error);

  var targetLogin = String(targetUsername || '').trim().toLowerCase();
  if (!targetLogin) return fail_('กรุณาระบุ username ครูที่ต้องการรีเซ็ต');

  var tempPin = String(newPin || '').trim();
  if (!tempPin) {
    tempPin = String(Math.floor(100000 + Math.random() * 900000));
  }
  if (tempPin.length < 6) return fail_('PIN ชั่วคราวต้องมีอย่างน้อย 6 หลัก');

  var sh = getTeachersSheet_();
  var vals = sh.getDataRange().getValues();
  if (vals.length < 2) return fail_('ไม่พบข้อมูลครู');
  var header = vals[0].map(normalizeHeader_);
  var col = function () {
    var names = Array.prototype.slice.call(arguments);
    for (var n = 0; n < names.length; n++) {
      var pos = header.indexOf(normalizeHeader_(names[n]));
      if (pos >= 0) return pos;
    }
    return -1;
  };
  var iName = col('TEACHER_NAME', 'TEACHER', 'NAME');
  var iUsername = col('USERNAME');
  var iPinHash = col('PIN_HASH');
  var iMustChange = col('MUST_CHANGE_PIN', 'FORCE_PIN_RESET');
  var iTeacherPin = col('TEACHER_PIN', 'PIN', 'PASSWORD', 'PASSCODE');
  if (iUsername < 0 || iPinHash < 0) return fail_('ต้องมีคอลัมน์ USERNAME และ PIN_HASH');

  var targetRow = -1;
  for (var r = 1; r < vals.length; r++) {
    if (String(vals[r][iUsername] || '').trim().toLowerCase() === targetLogin) {
      targetRow = r;
      break;
    }
  }
  if (targetRow < 0) return fail_('ไม่พบครูที่ต้องการรีเซ็ต');

  vals[targetRow][iPinHash] = hashPin_(tempPin);
  if (iMustChange >= 0) vals[targetRow][iMustChange] = true;
  if (iTeacherPin >= 0) vals[targetRow][iTeacherPin] = '';

  sh.getRange(2, 1, vals.length - 1, vals[0].length).setValues(vals.slice(1));

  var teacherName = iName >= 0 ? String(vals[targetRow][iName] || '').trim() : '';
  return ok_({
    success: true,
    username: targetLogin,
    teacher_name: teacherName,
    temp_pin: tempPin,
    must_change_pin: true
  });
}

/** @returns {{ ok: boolean, error?: string, admin?: Object }} */
function verifyAdminPin_(adminUsername, adminPin) {
  var login = String(adminUsername || '').trim().toLowerCase();
  var pin = String(adminPin || '').trim();
  if (!login || !pin) return { ok: false, error: 'กรุณาระบุรหัสผู้ดูแลและ PIN' };

  var teachers = readTeachers_();
  var admin = null;
  var i;
  for (i = 0; i < teachers.length; i++) {
    if (String(teachers[i].USERNAME || '').trim().toLowerCase() === login) {
      admin = teachers[i];
      break;
    }
  }
  if (!admin) return { ok: false, error: 'ไม่พบบัญชีผู้ดูแลระบบ' };
  if (!teacherIsAdmin_(admin)) return { ok: false, error: 'ไม่มีสิทธิ์ผู้ดูแลระบบ' };
  if (!admin.ACTIVE) return { ok: false, error: 'บัญชีผู้ดูแลระบบถูกปิดการใช้งาน' };

  var pinHash = String(admin.PIN_HASH || '').trim();
  var pinPlain = String(admin.TEACHER_PIN || '').trim();
  if (pinHash) {
    if (!verifyPin_(pin, pinHash)) return { ok: false, error: 'PIN ผู้ดูแลระบบไม่ถูกต้อง' };
  } else if (pinPlain) {
    if (pin !== pinPlain) return { ok: false, error: 'PIN ผู้ดูแลระบบไม่ถูกต้อง' };
  } else {
    return { ok: false, error: 'บัญชีผู้ดูแลระบบต้องตั้งรหัส PIN' };
  }
  return { ok: true, admin: admin };
}

function hashPin_(pin) {
  var raw = PIN_SALT + ':' + String(pin || '').trim();
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw);
  var out = '';
  for (var i = 0; i < bytes.length; i++) {
    var v = (bytes[i] + 256) % 256;
    var h = v.toString(16);
    out += h.length === 1 ? '0' + h : h;
  }
  return out;
}

function verifyPin_(pin, hash) {
  return hashPin_(pin) === String(hash || '').trim();
}

function publicTeacherRow_(t) {
  return {
    TEACHER_NAME: t.TEACHER_NAME || t.teacher_name,
    USERNAME: t.USERNAME || t.username || '',
    ASSIGNED_CLASSES: t.ASSIGNED_CLASSES || t.assigned_classes,
    ROLE: t.ROLE || t.role,
    MUST_CHANGE_PIN: Boolean(t.MUST_CHANGE_PIN),
    ACTIVE: t.ACTIVE !== false,
    teacher_name: t.teacher_name || t.TEACHER_NAME,
    username: t.username || t.USERNAME || '',
    assigned_classes: t.assigned_classes || t.ASSIGNED_CLASSES,
    role: t.role || t.ROLE,
    must_change_pin: Boolean(t.MUST_CHANGE_PIN),
    active: t.ACTIVE !== false
  };
}

function stripHonorificsGAS_(name) {
  var s = String(name || '').trim().toLowerCase();
  var titles = ['นางสาว', 'นาง', 'นาย', 'ครู'];
  var changed = true;
  while (changed) {
    changed = false;
    var i;
    for (i = 0; i < titles.length; i++) {
      var t = titles[i];
      if (s.indexOf(t) === 0) {
        s = s.slice(t.length).trim();
        changed = true;
        break;
      }
    }
  }
  return s;
}

function normalizeTeacherNameGAS_(name) {
  return String(name || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function teacherNamesMatchGAS_(sheetName, input) {
  var a = normalizeTeacherNameGAS_(sheetName).toLowerCase();
  var b = normalizeTeacherNameGAS_(input).toLowerCase();
  if (!a || !b) return false;
  if (a === b) return true;

  var aCore = stripHonorificsGAS_(a);
  var bCore = stripHonorificsGAS_(b);
  if (aCore && bCore && aCore === bCore) return true;

  var aFirst = (aCore.split(/\s+/)[0] || '');
  var bFirst = (bCore.split(/\s+/)[0] || '');
  if (bFirst.length >= 2 && aFirst === bFirst && bCore.indexOf(' ') < 0) return true;

  return false;
}

function findTeachersByLoginName_(teachers, input) {
  var q = String(input || '').trim();
  if (!q) return [];
  var matches = [];
  var i;
  for (i = 0; i < teachers.length; i++) {
    if (teacherNamesMatchGAS_(teachers[i].teacher_name, q)) {
      matches.push(teachers[i]);
    }
  }
  return matches;
}

/**
 * Resolve single teacher or null. Caller handles 0 / many matches.
 */
function findTeacherByLoginName_(teachers, input) {
  var matches = findTeachersByLoginName_(teachers, input);
  if (matches.length === 1) return matches[0];
  return null;
}

function resolveTeacherLoginMatch_(teachers, nameInput, pinInput) {
  var matches = findTeachersByLoginName_(teachers, nameInput);
  if (!matches.length) {
    return { ok: false, error: 'ไม่พบชื่อครูในระบบ — ตรวจสอบแท็บ TEACHERS' };
  }

  if (matches.length > 1) {
    var pin = String(pinInput || '').trim();
    if (pin) {
      var pinHits = [];
      var i;
      for (i = 0; i < matches.length; i++) {
        if (String(matches[i].TEACHER_PIN || '').trim() === pin) {
          pinHits.push(matches[i]);
        }
      }
      if (pinHits.length === 1) {
        return { ok: true, teacher: pinHits[0] };
      }
      if (pinHits.length > 1) {
        return {
          ok: false,
          error:
            'รหัส PIN นี้ตรงกับหลายบัญชี — กรุณาใช้ชื่อเต็มตามคอลัมน์ TEACHER_NAME'
        };
      }
    }
    var names = matches
      .map(function (t) {
        return t.teacher_name;
      })
      .join(', ');
    return {
      ok: false,
      error:
        'พบครูหลายคนที่ตรงกับชื่อนี้: ' +
        names +
        ' — กรุณาใช้ชื่อเต็มตามชีต หรือกรอก PIN ของครูท่านนั้น'
    };
  }

  return { ok: true, teacher: matches[0] };
}

/**
 * Run from Apps Script editor to verify TEACHERS sheet + deploy.
 */
function testGetTeachers() {
  var teachers = getTeachers();
  Logger.log('testGetTeachers count=' + teachers.length);
  Logger.log(JSON.stringify(teachers));
}

/**
 * TEACHERS use ม.1 — Students sheet LEVEL uses M1.
 * @param {string} level
 * @returns {string}
 */
function normalizeLevelForSheet_(level) {
  var s = String(level || '').trim().replace(/\s+/g, '');
  if (!s) return '';
  var th = s.match(/^ม\.?(\d+)$/);
  if (th) return 'M' + th[1];
  var en = s.match(/^m\.?(\d+)$/i);
  if (en) return 'M' + en[1];
  return s;
}

/**
 * @param {string} level
 * @param {string} room
 * @param {string} class_key
 * @param {string} lvlFilter normalized M*
 * @param {string} rmFilter
 */
function studentMatchesClassFilter_(level, room, class_key, lvlFilter, rmFilter) {
  if (!lvlFilter && !rmFilter) return true;
  var rowLvl = normalizeLevelForSheet_(level);
  var rm = String(rmFilter || '').trim();
  if (lvlFilter && rowLvl !== lvlFilter) {
    if (!class_key || !rm) return false;
    var ck = String(class_key).replace(/\s+/g, '');
    var wantEn = lvlFilter + '/' + rm;
    var wantTh = 'ม.' + lvlFilter.replace(/^M/i, '') + '/' + rm;
    var wantTh2 = 'ม' + lvlFilter.replace(/^M/i, '') + '/' + rm;
    if (ck !== wantEn && ck !== wantTh && ck !== wantTh2) return false;
  }
  if (rm && String(room).trim() !== rm) return false;
  return true;
}

function readStudents_(levelFilter, roomFilter) {
  const sh = getSpreadsheet_().getSheetByName(STUDENTS_SHEET);
  if (!sh) throw new Error('Sheet not found: ' + STUDENTS_SHEET);
  const vals = sh.getDataRange().getValues();
  if (vals.length < 2) return [];
  const header = vals[0].map(normalizeHeader_);
  const idx = (name) => header.indexOf(normalizeHeader_(name));
  const students = [];
  const lvlFilter = normalizeLevelForSheet_(String(levelFilter || '').trim());
  const rmFilter = String(roomFilter || '').trim();

  for (let r = 1; r < vals.length; r++) {
    const row = vals[r];
    const student_id = String(row[idx('STUDENT_ID')] || '').trim();
    const prefix = String(row[idx('PREFIX')] || '').trim();
    const first_name = String(row[idx('FIRST_NAME')] || '').trim();
    const last_name = String(row[idx('LAST_NAME')] || '').trim();
    const level = String(row[idx('LEVEL')] || '').trim();
    const room = String(row[idx('ROOM')] || '').trim();
    const number = String(row[idx('NUMBER')] || '').trim();
    const class_key = String(row[idx('CLASS_KEY')] || '').trim();
    const parent_name = String(row[idx('PARENT_NAME')] || '').trim();
    const parent_phone = String(row[idx('PARENT_PHONE')] || '').trim();
    if (!student_id || !first_name) continue;
    if (!studentMatchesClassFilter_(level, room, class_key, lvlFilter, rmFilter)) continue;
    students.push({
      student_id: student_id,
      prefix: prefix,
      first_name: first_name,
      last_name: last_name,
      level: level,
      room: room,
      number: number,
      class_key: class_key,
      parent_name: parent_name,
      parent_phone: parent_phone
    });
  }
  return students;
}

function readClassOptions_() {
  const sh = getSpreadsheet_().getSheetByName(STUDENTS_SHEET);
  if (!sh) throw new Error('Sheet not found: ' + STUDENTS_SHEET);
  const vals = sh.getDataRange().getValues();
  if (vals.length < 2) return { levels: [], roomsByLevel: {} };
  const header = vals[0].map(normalizeHeader_);
  const idxLevel = header.indexOf(normalizeHeader_('LEVEL'));
  const idxRoom = header.indexOf(normalizeHeader_('ROOM'));
  const levelSet = {};
  const roomsByLevel = {};

  for (let r = 1; r < vals.length; r++) {
    const row = vals[r];
    const level = idxLevel >= 0 ? String(row[idxLevel] || '').trim() : '';
    const room = idxRoom >= 0 ? String(row[idxRoom] || '').trim() : '';
    if (!level) continue;
    levelSet[level] = true;
    if (!room) continue;
    if (!roomsByLevel[level]) roomsByLevel[level] = {};
    roomsByLevel[level][room] = true;
  }

  const levels = Object.keys(levelSet).sort(function (a, b) {
    return a.localeCompare(b, undefined, { numeric: true });
  });
  Object.keys(roomsByLevel).forEach(function (lvl) {
    roomsByLevel[lvl] = Object.keys(roomsByLevel[lvl]).sort(function (a, b) {
      return a.localeCompare(b, undefined, { numeric: true });
    });
  });
  return { levels: levels, roomsByLevel: roomsByLevel };
}

/**
 * TEACHERS sheet: TEACHER_NAME, USERNAME, ASSIGNED_CLASSES, ROLE, TEACHER_PIN/PIN_HASH, MUST_CHANGE_PIN, ACTIVE
 * Also accepts ASSIGNED_CLASS (singular). PIN is never returned by getTeachers.
 */
function readTeachers_() {
  const sh = getTeachersSheet_();
  const vals = sh.getDataRange().getValues();
  if (vals.length < 2) return [];

  const header = vals[0].map(normalizeHeader_);
  const col = function () {
    var names = Array.prototype.slice.call(arguments);
    for (var n = 0; n < names.length; n++) {
      var pos = header.indexOf(normalizeHeader_(names[n]));
      if (pos >= 0) return pos;
    }
    return -1;
  };

  const iName = col('TEACHER_NAME', 'TEACHER', 'NAME');
  const iUsername = col('USERNAME', 'USER_NAME', 'LOGIN', 'USER');
  const iClasses = col('ASSIGNED_CLASSES', 'ASSIGNED_CLASS', 'CLASSES', 'CLASS');
  const iRole = col('ROLE', 'TYPE');
  const iPin = col('TEACHER_PIN', 'PIN', 'PASSWORD', 'PASSCODE');
  const iPinHash = col('PIN_HASH', 'PINHASH');
  const iMustChange = col('MUST_CHANGE_PIN', 'FORCE_PIN_RESET');
  const iActive = col('ACTIVE');
  const teachers = [];

  for (var r = 1; r < vals.length; r++) {
    var row = vals[r];
    var teacher_name = String(row[iName >= 0 ? iName : 0] || '').trim();
    if (!teacher_name) continue;
    var username = iUsername >= 0 ? String(row[iUsername] || '').trim() : '';
    var assigned = String(row[iClasses >= 0 ? iClasses : 1] || '').trim();
    var role = String(row[iRole >= 0 ? iRole : 2] || 'teacher').trim();
    var teacher_pin = iPin >= 0 ? String(row[iPin] || '').trim() : '';
    var pin_hash = iPinHash >= 0 ? String(row[iPinHash] || '').trim() : '';
    var must_change = iMustChange >= 0
      ? row[iMustChange] === true || String(row[iMustChange]).toLowerCase() === 'true'
      : false;
    var active = iActive >= 0
      ? row[iActive] === true || String(row[iActive]).toLowerCase() === 'true'
      : true;
    teachers.push({
      TEACHER_NAME: teacher_name,
      USERNAME: username,
      ASSIGNED_CLASSES: assigned,
      ROLE: role,
      TEACHER_PIN: teacher_pin,
      PIN_HASH: pin_hash,
      MUST_CHANGE_PIN: must_change,
      ACTIVE: active,
      teacher_name: teacher_name,
      username: username,
      assigned_classes: assigned,
      role: role
    });
  }
  return teachers;
}

function getTeachersSheet_() {
  const ss = getSpreadsheet_();
  var sh = ss.getSheetByName(TEACHERS_SHEET);
  if (!sh) sh = ss.getSheetByName('Teachers');
  if (!sh) sh = ss.getSheetByName('teachers');
  if (!sh) {
    throw new Error(
      'Sheet not found: "' + TEACHERS_SHEET + '". Add a tab named TEACHERS with columns TEACHER_NAME, ASSIGNED_CLASSES, ROLE.'
    );
  }
  return sh;
}

/**
 * @param {string} date yyyy-MM-dd
 * @param {string} type LEVEL → TYPE column
 * @param {string} term ROOM → TERM column
 * @param {string[]|null} studentIds optional roster filter
 */
function readAttendanceForSession_(date, type, term, studentIds) {
  const sh = getAttendanceSheet_();
  const map = buildHeaderIndex_(sh, ATTENDANCE_HEADERS);
  const vals = sh.getDataRange().getValues();
  const attendance = {};
  const records = [];
  const idSet =
    studentIds && studentIds.length ? new Set(studentIds.map(String)) : null;

  for (let r = 1; r < vals.length; r++) {
    const row = vals[r];
    if (dateKey_(row[map.DATE]) !== date) continue;
    if (type && String(row[map.TYPE] || '') !== type) continue;
    if (term && String(row[map.TERM] || '') !== term) continue;
    const sid = String(row[map.STUDENT_ID] || '').trim();
    if (!sid) continue;
    if (idSet && !idSet.has(sid)) continue;
    const status = normalizeStatus_(row[map.STATUS]);
    attendance[sid] = status;
    records.push({
      date: dateKey_(row[map.DATE]),
      student_id: sid,
      status: status,
      type: String(row[map.TYPE] || ''),
      term: String(row[map.TERM] || ''),
      timestamp: row[map.TIMESTAMP] || null,
      unique_key: String(row[map.UNIQUE_KEY] || ''),
      checked_by: map.CHECKED_BY >= 0 ? String(row[map.CHECKED_BY] || '') : ''
    });
  }
  return { attendance: attendance, records: records };
}

/**
 * Replace rows for date+type+term for given student IDs, then append new rows.
 */
function writeAttendanceRecords_(date, type, term, records) {
  const sh = getAttendanceSheet_();
  const map = buildHeaderIndex_(sh, ATTENDANCE_HEADERS);
  ensureAttendanceHeaders_(sh, map);

  const studentIds = records.map(function (rec) {
    return String(rec.student_id || '');
  }).filter(Boolean);

  deleteAttendanceRows_(sh, map, date, type, term, studentIds);

  const now = new Date();
  const colCount = Math.max(sh.getLastColumn(), 7);
  const rows = [];
  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    const sid = String(rec.student_id || '').trim();
    if (!sid) continue;
    const status = normalizeStatus_(rec.status);
    const recType = String(rec.type || type || '');
    const recTerm = String(rec.term || term || '');
    const ts = rec.timestamp ? new Date(rec.timestamp) : now;
    const uniqueKey =
      String(rec.unique_key || '').trim() ||
      buildUniqueKey_(date, sid, recType, recTerm);

    const row = Array(colCount).fill('');
    row[map.DATE] = date;
    row[map.STUDENT_ID] = sid;
    row[map.STATUS] = status;
    row[map.TYPE] = recType;
    row[map.TERM] = recTerm;
    row[map.TIMESTAMP] = ts;
    row[map.UNIQUE_KEY] = uniqueKey;
    if (map.CHECKED_BY >= 0) row[map.CHECKED_BY] = String(rec.checked_by || rec.checkedBy || '');
    rows.push(row);
  }

  if (rows.length === 0) return 0;

  const startRow = sh.getLastRow() + 1;
  sh.getRange(startRow, 1, rows.length, colCount).setValues(rows);
  return rows.length;
}

function deleteAttendanceRows_(sh, map, date, type, term, studentIds) {
  const vals = sh.getDataRange().getValues();
  if (vals.length < 2) return;
  const idSet = new Set(studentIds.map(String));
  const toDelete = [];

  for (let r = 1; r < vals.length; r++) {
    const row = vals[r];
    if (dateKey_(row[map.DATE]) !== date) continue;
    if (type && String(row[map.TYPE] || '') !== type) continue;
    if (term && String(row[map.TERM] || '') !== term) continue;
    const sid = String(row[map.STUDENT_ID] || '').trim();
    if (!idSet.has(sid)) continue;
    toDelete.push(r + 1);
  }

  toDelete.sort(function (a, b) {
    return b - a;
  });
  toDelete.forEach(function (rowNum) {
    sh.deleteRow(rowNum);
  });
}

function getAttendanceSheet_() {
  const ss = getSpreadsheet_();
  let sh = ss.getSheetByName(ATTENDANCE_SHEET);
  if (!sh) sh = ss.getSheetByName('attendence');
  if (!sh) throw new Error('Sheet not found: ' + ATTENDANCE_SHEET);
  return sh;
}

/**
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sh
 * @param {Object.<string, string[]>} headerSpec
 */
function buildHeaderIndex_(sh, headerSpec) {
  const headerRow = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const normalized = headerRow.map(normalizeHeader_);
  /** @type {Record<string, number>} */
  const index = {};
  Object.keys(headerSpec).forEach(function (field) {
    const aliases = headerSpec[field];
    for (let a = 0; a < aliases.length; a++) {
      const pos = normalized.indexOf(normalizeHeader_(aliases[a]));
      if (pos >= 0) {
        index[field] = pos;
        return;
      }
    }
    index[field] = -1;
  });
  return index;
}

function ensureAttendanceHeaders_(sh, map) {
  const required = ['DATE', 'STUDENT_ID', 'STATUS', 'TYPE', 'TERM', 'TIMESTAMP', 'UNIQUE_KEY', 'CHECKED_BY'];
  const missing = required.filter(function (k) {
    return map[k] < 0;
  });
  if (missing.length === 0) return;

  const defaults = {
    DATE: 'DATE',
    STUDENT_ID: 'STUDENT_ID',
    STATUS: 'STATUS',
    TYPE: 'TYPE',
    TERM: 'TERM',
    TIMESTAMP: 'TIMESTAMP',
    UNIQUE_KEY: 'unique_key',
    CHECKED_BY: 'checked_by'
  };
  const lastCol = Math.max(sh.getLastColumn(), 1);
  const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  let col = headers.length;
  missing.forEach(function (field) {
    col += 1;
    sh.getRange(1, col).setValue(defaults[field]);
    map[field] = col - 1;
  });
}

function buildUniqueKey_(date, studentId, type, term) {
  return [date, studentId, type, term].join('|');
}

function normalizeStatus_(value) {
  const s = String(value || 'present')
    .trim()
    .toLowerCase();
  if (s === 'present' || s === 'late' || s === 'absent' || s === 'leave' || s === 'sick') return s;
  if (s === 'มา' || s === 'p') return 'present';
  if (s === 'สาย' || s === 'l') return 'late';
  if (s === 'ขาด' || s === 'a') return 'absent';
  if (s === 'ลา') return 'leave';
  if (s === 'ลาป่วย' || s === 'ป่วย') return 'sick';
  return 'present';
}

function normalizeHeader_(label) {
  return String(label || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
}

function dateKey_(cell) {
  if (Object.prototype.toString.call(cell) === '[object Date]') {
    return Utilities.formatDate(cell, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  const s = String(cell || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s;
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
