# Student Check

ระบบเช็คชื่อและคะแนนพฤติกรรมนักเรียน (PWA) — โรงเรียนยางตลาดวิทยาคาร

| | |
|---|---|
| **เวอร์ชัน** | 3.1.0 |
| **Production** | https://student-check-th.web.app |
| **Stack** | Vite + Vanilla JS, Firebase (Firestore/Hosting), Google Apps Script + Sheets |

---

## เริ่มต้นพัฒนา (5 นาที)

### ความต้องการ

- Node.js 18+
- บัญชี Firebase + Google Spreadsheet (สำหรับทดสอบจริง)

### ติดตั้งและรัน

```bash
npm install
cp .env.example .env   # แล้วกรอกค่า Firebase + GAS URL
npm run dev
```

Windows: ดับเบิลคลิก `run-dev.cmd` ได้เช่นกัน

เปิด http://localhost:5173 — ใน dev คำขอ GAS ถูก proxy ผ่าน `/api/gas` (ดู `vite.config.js`)

### Build / Deploy เว็บ

```bash
npm run build
firebase deploy --only hosting:app
```

### Deploy GAS (รายชื่อนักเรียน/ครู)

แก้ `gas-sample/Code.gs` → วางใน Apps Script → **Deploy → Manage deployments → New version**  
รายละเอียด: [`gas-sample/README.md`](gas-sample/README.md)

---

## โครงสร้างโปรเจกต์

```
src/
  main.js              # Bootstrap, routing, auth shell, บันทึกเช็คชื่อรวมศูนย์
  pages/               # หนึ่งไฟล์ต่อหนึ่งหน้า (renderXxxPage)
  services/            # Firestore, GAS, offline, PDF, auth
  components/          # UI ใช้ซ้ำ (navbar, modal, cards)
  config/              # ค่าเริ่มต้น, route guards
  data/                # ค่าคงที่ + appState (localStorage)
  styles/              # CSS แยกตามฟีเจอร์
  i18n/                # ไทย / English
gas-sample/Code.gs     # Backend อ้างอิงสำหรับ Google Sheets
functions/             # Cloud Function (optional token)
scripts/               # สร้างคู่มือ PDF / handover package
```

---

## เอกสารสำหรับนักพัฒนา

| เอกสาร | ใช้เมื่อ |
|--------|----------|
| [**CONTRIBUTING.md**](CONTRIBUTING.md) | จะเพิ่มฟีเจอร์ / แก้บั๊ก — แนวทางและจุดแก้ที่พบบ่อย |
| [**SYSTEM_DOCUMENTATION.md**](SYSTEM_DOCUMENTATION.md) | สถาปัตยกรรม, Firestore, GAS, deploy เต็มรูปแบบ |
| [**SITEMAP.md**](SITEMAP.md) | แผนที่ route ทุกหน้า + สิทธิ์ |
| `USER_MANUAL.src.md` / `ADMIN_MANUAL.src.md` | แก้คู่มือผู้ใช้ (ไม่แก้ `.md` ที่ embed รูปแล้ว) |

### คำสั่ง docs

```bash
npm run docs:screenshots   # จับภาพหน้าจอ (ต้องรัน dev server)
npm run docs:pdf           # สร้าง PDF คู่มือ
npm run docs:handover      # PDF + ZIP ส่งมอบโรงเรียน
```

---

## ข้อมูลสำคัญที่มักสับสน

| ชื่อไฟล์ | ความจริง |
|----------|----------|
| `src/data/appState.js` | สถานะแอปใน localStorage (ห้องที่เลือก, วันที่) — **ไม่ใช่ mock data** |
| `studentPointsService.js` | เขียน/อ่านคะแนนดิบใน Firestore |
| `studentScoreService.js` | คำนวณคะแนนรวม / รายงาน / risk สำหรับ dashboard |
| `googleAppsScript.js` | HTTP client ไป GAS Web App |
| `studentsService.js` | รายชื่อนักเรียน + admin CRUD ผ่าน GAS |

---

## Environment

ดู `.env.example` — ค่าสำคัญ:

- `VITE_FIREBASE_*` — Firebase config
- `VITE_GAS_WEB_APP_URL` — URL Web App หลัง deploy GAS
- `VITE_GAS_SECRET` — (ถ้ามี) ต้องตรงกับ script property `gasSecret`
- `VITE_ENABLE_PIN_LOGIN=true` — login ด้วย USERNAME + PIN

**อย่า commit `.env`**

---

## License / การส่งมอบ

แพ็กส่งมอบโรงเรียน: `npm run docs:handover` → `StudentCheck_v3.1.0_Handover/`
