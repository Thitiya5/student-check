# แนวทางพัฒนาต่อ (Contributing)

เอกสารนี้สำหรับนักพัฒนาที่มาแก้โค้ดต่อ — อ่านคู่กับ [README.md](README.md) และ [SYSTEM_DOCUMENTATION.md](SYSTEM_DOCUMENTATION.md)

---

## หลักการของโปรเจกต์

1. **Vanilla JS + ES modules** — ไม่มี React/Vue; หน้าใหม่ = ไฟล์ใน `src/pages/`
2. **Hash routing** — `#/dashboard`, `#/check` ฯลฯ จัดการใน `src/main.js` + `src/services/navigation.js`
3. **ข้อมูลสองแหล่ง**
   - **Firestore** — เช็คชื่อ, คะแนน, settings
   - **Google Sheets (ผ่าน GAS)** — รายชื่อนักเรียน, ครู, PIN
4. **หน้าไม่เรียก Firestore โดยตรงจาก UI** — ผ่าน `src/services/` เสมอ

---

## เพิ่มหน้าใหม่ (checklist)

1. สร้าง `src/pages/myPage.js` ด้วยฟังก์ชัน `export function renderMyPage(container, ctx)`
2. เพิ่ม `case '/my-page':` ใน `renderRoutePage()` ที่ `src/main.js` (dynamic `import()`)
3. ถ้าต้องจำกัดสิทธิ์ — เพิ่มใน `src/config/routeGuards.js` (อย่า copy if-block ใน main)
4. เพิ่มลิงก์ใน `src/components/navbar.js` หรือ `src/pages/menu.js` ตามความเหมาะสม
5. เพิ่มข้อความใน `src/i18n/translations.js` (ทั้ง `th` และ `en`)
6. อัปเดต [SITEMAP.md](SITEMAP.md)
7. CSS: ใส่ในไฟล์ที่เกี่ยวข้อง (ดูหัว comment ใน `src/styles/*.css`)

### `ctx` ที่หน้าจะได้รับ

```javascript
{
  state,           // appState จาก localStorage
  onNavigate,      // (path) => void
  onToast,         // showToast จาก utils/ui.js
  onLogout,
  onBack,
  // บางหน้าได้เพิ่ม เช่น submitAttendance สำหรับ /check
}
```

---

## แก้สิทธิ์ / Route guard

แก้ที่เดียว: **`src/config/routeGuards.js`**

```javascript
{
  paths: ['/my-admin-page'],
  allow: isAdminSession,        // หรือฟังก์ชัน session => boolean
  messageKey: 'admin.denied'    // key ใน translations.js
}
```

ฟังก์ชันสิทธิ์อยู่ที่ `src/services/teacherAuth.js` และ `disciplineReportService.js`

---

## แก้รายชื่อนักเรียน / ครู

| ชั้น | ไฟล์ |
|------|------|
| UI | `src/pages/adminStudents.js`, `adminTeachers.js` |
| Client API | `src/services/studentsService.js`, `teachersService.js` |
| HTTP | `src/services/googleAppsScript.js` |
| Backend จริง | `gas-sample/Code.gs` → **ต้อง deploy GAS ทุกครั้ง** |

หลัง deploy GAS ตรวจ: `YOUR_GAS_URL?action=ping` ต้องมี `gas_version`

---

## แก้เช็คชื่อ / คะแนน

| งาน | ไฟล์เริ่มต้น |
|-----|-------------|
| บันทึกเช็คชื่อ | `src/main.js` → `submitAttendance`, `src/services/attendanceService.js` |
| หน้าเช็คชื่อ | `src/pages/check.js` |
| คะแนนดิบ (Firestore) | `src/services/studentPointsService.js` |
| คะแนนรวม / รายงาน | `src/services/studentScoreService.js` |
| Sync คะแนนหลังเช็คชื่อ | `src/services/historyPointSync.js` |

---

## สไตล์โค้ด

- ใช้ `escapeHtml()` ก่อนแสดงข้อความจาก user/DB ใน template string
- ข้อความ UI ผ่าน `t('key')` — ไม่ hardcode ภาษาไทยใน logic (ยกเว้น comment)
- แก้เฉพาะ scope ที่ขอ — อย่า refactor ใหญ่พร้อม fix เล็ก
- ชื่อไฟล์: `camelCase.js`, ฟังก์ชัน render หน้า: `renderXxxPage`

---

## CSS — ไฟล์ไหนใส่อะไร

| ไฟล์ | หน้าที่เกี่ยวข้องหลัก |
|------|---------------------|
| `app-pages.css` | history, students, reports, settings, menu |
| `dashboard-home.css` | dashboard, login branding |
| `attendance.css` | check, inspection |
| `student-points.css` | behavior, points, admin students/teachers |
| `layout.css` | shell, page-content padding |
| `components.css` | bottom nav, buttons, modals |

---

## ทดสอบก่อนส่งมอบ

- [ ] `npm run build` ผ่าน
- [ ] Login + เช็คชื่อห้องที่รับผิดชอบ
- [ ] Admin: จัดการนักเรียน/ครู (หลัง deploy GAS)
- [ ] มือถือ: เลื่อนสุดรายการ, ปุ่มไม่ถูกเมนูล่างบัง
- [ ] ถ้าแก้คู่มือ: `npm run docs:pdf`

---

## ไฟล์ที่ไม่ควร commit

ดู `.gitignore` — โดยเฉพาะ `.env`, `dist/`, `*.preview.html`, handover zip ชั่วคราว

---

## คำถามที่พบบ่อย

**Q: แก้ GAS แล้วเว็บยัง error**  
A: Deploy **New version** ที่ deployment เดิม (URL ไม่เปลี่ยน) ไม่ใช่แค่ Save ใน editor

**Q: แก้เว็บแล้วคนอื่นยังไม่เห็น**  
A: `firebase deploy --only hosting:app` — GAS ไม่ต้อง deploy ถ้าไม่ได้แก้ Code.gs

**Q: `mock.js` คืออะไร**  
A: ชื่อเก่า — ใช้ `src/data/appState.js` แทน (`mock.js` re-export ไว้ให้ backward compatible)
