# คู่มือผู้ดูแลระบบ — ระบบเช็คชื่อนักเรียน

**โรงเรียนยางตลาดวิทยาคาร · Student Check**  
**Firebase Project:** `famous-augury-495905-c3`  
**Hosting Site:** `student-check-th` → https://student-check-th.web.app

---

## 1. โครงสร้างระบบ

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│  แอป (PWA)      │────▶│  Firebase            │     │  Google Sheets  │
│  Vite + JS      │     │  · Firestore         │     │  · Students     │
│  student-check  │     │  · Hosting           │     │  · TEACHERS     │
└────────┬────────┘     │  · Functions (opt.)  │     │  · Attendance*  │
         │                └──────────────────────┘     └────────▲────────┘
         │                                                       │
         └──────────────────────────▶ Google Apps Script ────────┘
                                      (Web App API)
```

| ชั้น | เทคโนโลยี | บทบาท |
|------|-----------|--------|
| Frontend | Vite, JavaScript, PWA | UI ครูและ admin |
| Backend ข้อมูลรายชื่อ | Google Apps Script | อ่าน/เขียน Sheets |
| Backend ข้อมูลเช็คชื่อ | Firebase Firestore | attendance, student_points, app_settings |
| Hosting | Firebase Hosting | เสิร์ฟไฟล์จาก `dist/` |

\* แท็บ Attendance ใน Sheets ใช้โดย GAS เป็นทางเลือก — แอปหลักบันทึกเช็คชื่อใน **Firestore**

---

## 2. สิทธิ์ผู้ดูแลระบบ (Admin)

บัญชีถือเป็น **admin** เมื่อตรงเงื่อนไขใดเงื่อนไขหนึ่ง:

| เงื่อนไข | ที่มา |
|----------|--------|
| `ROLE` = `admin`, `adnim`, หรือ `administrator` | แท็บ TEACHERS |
| `ASSIGNED_CLASSES` มีค่า `ALL` | แท็บ TEACHERS |

Admin เข้าได้ทุกห้อง ดูรายงานทั้งโรงเรียน จัดการเช็คชื่อ ตั้งค่าระบบ ตรวจระเบียบ และรีเซ็ต PIN (เมื่อเปิดระบบ PIN)

---

## 3. หน้าจัดการในแอป (Admin)

เข้าจากแท็บ **จัดการ** หรือเมนูด่วนบนหน้าหลัก

| หน้า | เส้นทาง | หน้าที่ |
|------|---------|--------|
| จัดการระบบ | `/admin` | ค้นหา/แก้ไข/ลบรายการเช็คชื่อทั้งโรงเรียน |
| ตรวจระเบียบประจำเดือน | `/inspection` | บันทึกระเบียบทั้งห้องในวันตรวจ |
| รีเซ็ตรหัสครู | `/admin-teachers` | รีเซ็ต PIN ชั่วคราว (เมื่อเปิด PIN) |
| ตั้งค่าระบบ | `/settings-admin` | คะแนน ระเบียบ ตารางตรวจ แจ้งเตือน |

---

## 4. การจัดการครู (Google Sheets)

แอป **ไม่มีหน้าเพิ่ม/แก้ไขครูใน UI** — จัดการที่แท็บ **`TEACHERS`**

### คอลัมน์ที่ระบบรองรับ

| คอลัมน์ | จำเป็น | คำอธิบาย |
|---------|--------|----------|
| `TEACHER_NAME` | ✓ | ชื่อครู (ใช้ login แบบเดิม) |
| `USERNAME` | เมื่อใช้ PIN | ชื่อผู้ใช้สำหรับ login |
| `ASSIGNED_CLASSES` | ✓ (ยกเว้น admin) | ห้องที่รับผิดชอบ เช่น `M2/1` คั่นด้วย `,` หรือ `;` |
| `ROLE` | แนะนำ | `teacher` หรือ `admin` |
| `TEACHER_PIN` | ชั่วคราว | PIN  plain ก่อน hash |
| `PIN_HASH` | เมื่อใช้ PIN | ค่า hash จาก GAS |
| `MUST_CHANGE_PIN` | เมื่อใช้ PIN | `TRUE` = บังคับเปลี่ยน PIN ครั้งแรก |
| `ACTIVE` | แนะนำ | `TRUE` / `FALSE` |

### วิธีเพิ่มครูใหม่

1. เปิด Google Spreadsheet ที่เชื่อมกับ GAS
2. แท็บ **TEACHERS** → แถวใหม่
3. กรอก `TEACHER_NAME`, `ASSIGNED_CLASSES`, `ROLE`
4. ถ้าใช้ PIN: กรอก `USERNAME`, `TEACHER_PIN` หรือรันสคริปต์ setup ใน GAS
5. บันทึก — ครู login ได้ทันที (ไม่ต้อง deploy แอปใหม่)

### วิธีกำหนดสิทธิ์ครูประจำชั้น

ใส่ห้องใน `ASSIGNED_CLASSES`:

```
M1/3
```

หลายห้อง:

```
M1/3, M1/4
```

ครูประจำชั้นหลายระดับ:

```
M1/3, M2/1
```

### วิธีตั้งผู้ดูแลระบบ

```
ROLE: admin
ASSIGNED_CLASSES: ALL
```

หรือ `ROLE: admin` โดยไม่ใส่ห้อง (ระบบถือว่าเข้าถึงได้ทั้งโรงเรียน)

### รีเซ็ต PIN ผ่านแอป (เมื่อเปิด `VITE_ENABLE_PIN_LOGIN`)

1. Login เป็น admin
2. **จัดการ** → **รีเซ็ตรหัสครู**
3. เลือกครู → **รีเซ็ต PIN**
4. กรอก PIN admin + (ถ้าต้องการ) PIN ชั่วคราว
5. แจ้งครู username + PIN ชั่วคราว — ครูต้องเปลี่ยน PIN เมื่อ login ครั้งถัดไป

---

## 5. การจัดการนักเรียน (Google Sheets)

รายชื่อนักเรียนโหลดจากแท็บ **`Students`** — **ไม่มีการแก้ไขในแอป**

### คอลัมน์ที่ระบบอ่าน

| คอลัมน์ | คำอธิบาย |
|---------|----------|
| `STUDENT_ID` | รหัสนักเรียน (ไม่ซ้ำ) |
| `PREFIX` | คำนำหน้า |
| `FIRST_NAME` | ชื่อ |
| `LAST_NAME` | นามสกุล |
| `LEVEL` | ระดับชั้น เช่น M1, M2 |
| `ROOM` | ห้อง เช่น 1, 2 |
| `NUMBER` | เลขที่ |
| `CLASS_KEY` | รหัสห้อง (ถ้ามี) |
| `PARENT_NAME` | ชื่อผู้ปกครอง |
| `PARENT_PHONE` | เบอร์ผู้ปกครอง |

### วิธีเพิ่มนักเรียน

1. แท็บ **Students** → แถวใหม่
2. กรอก `STUDENT_ID`, ชื่อ, `LEVEL`, `ROOM`, `NUMBER`
3. บันทึก — แอปจะโหลดรายชื่อใหม่เมื่อเปิดหน้าเช็คชื่อ/นักเรียน (มี cache 24 ชม.)

### วิธีแก้ไขข้อมูลนักเรียน

แก้ใน Sheet โดยตรง — ข้อมูลเช็คชื่อเดิมใน Firestore ยังอ้างอิง `student_id` เดิม

### คืนคะแนนพฤติกรรม (ในแอป)

Admin เปิด **โปรไฟล์นักเรียน** → **คืนคะแนน**  
บันทึกเป็น transaction ใน `student_points` (ไม่ใช่แก้ Sheet)

---

## 6. การตั้งค่าระบบ (Settings Admin)

**จัดการ** → **ตั้งค่าระบบ** หรือ **ตั้งค่า** → **เปิดหน้าตั้งค่า**

ข้อมูลบันทึกใน Firestore: collection `app_settings`, document `school`

### 6.1 การมาเรียน

| การตั้งค่า | ค่าเริ่มต้น | ความหมาย |
|------------|-------------|----------|
| เปิดหักคะแนนการมาเรียน | เปิด | ปิด = ไม่หักคะแนนจากขาด/สาย |
| ขาด (คะแนน) | 1 | หักเมื่อสถานะขาด |
| สาย (คะแนน) | 1 | หักเมื่อสถานะสาย |

### 6.2 ระเบียบและพฤติกรรม

| การตั้งค่า | ค่าเริ่มต้น |
|------------|-------------|
| เปิดระบบระเบียบ | เปิด |
| เริ่มหักคะแนนระเบียบ | 2026-06-05 |
| ชุด / ทรงผม / เล็บ / เครื่องประดับ | 5 แต่ละรายการ |
| กระทำความดี (+) | 5 |
| กระทำความผิด (−) | 5 |
| คะแนนเริ่มต้น | 100 |

### 6.3 ตารางตรวจระเบียบ

| รูปแบบ | การทำงาน |
|--------|----------|
| **รายเดือน** | วันแรกที่มีเรียน (จ–ศ) ของเดือน หรือวันที่ 1–31 |
| **รายสัปดาห์** | วันในสัปดาห์ (จ–ศ) |
| **กำหนดวันที่เอง** | ใส่รายการวันที่ `YYYY-MM-DD` ทีละบรรทัด |

### 6.4 แจ้งเตือน

| การตั้งค่า | ค่าเริ่มต้น |
|------------|-------------|
| เกณฑ์เฝ้าระวังการมาเรียน | 60% |

---

## 7. ปีการศึกษาและภาคเรียน

### สิ่งที่ระบบมีจริง

- **ไม่มี** หน้าตั้งค่า "ปีการศึกษา" แยกต่างหาก
- แท็บ **รายงานภาคเรียน** (admin) ใช้ช่วงวันที่ **คำนวณอัตโนมัติ** จากโค้ด:

| ช่วงเดือน | ภาคเรียน (ตามโค้ด) |
|-----------|---------------------|
| พ.ค. – ต.ค. | พ.ค. 1 – ต.ค. 31 ของปีนั้น |
| พ.ย. – ธ.ค. | พ.ย. 1 – เม.ย. 30 ปีถัดไป |
| ม.ค. – เม.ย. | พ.ย. 1 ปีก่อน – เม.ย. 30 ปีนั้น |

หากโรงเรียนต้องการช่วงภาคเรียนอื่น ต้องแก้โค้ดใน `src/pages/reports.js` (ฟังก์ชัน `semesterRange`) หรือใช้รายงานรายเดือน/กำหนดช่วงวันที่แทน

---

## 8. หน้าตรวจระเบียบประจำเดือน

**จัดการ** → **ตรวจระเบียบประจำเดือน**

1. เลือก **วันที่**, **LEVEL**, **ROOM**
2. โหลดรายชื่อ — ใช้ได้เมื่อวันนั้นเป็นวันตรวจ **และ** เปิดระบบระเบียบ
3. ติ๊กรายการระเบียบต่อนักเรียน (นักเรียนที่ **ขาด** จะติ๊กครบทุกข้ออัตโนมัติ)
4. **บันทึก** — ซิงค์คะแนนและบันทึกเช็คชื่อ

---

## 9. การจัดการคะแนนพฤติกรรม

### กติกา (ค่าเริ่มต้น — ปรับได้ใน Settings Admin)

| เหตุการณ์ | คะแนน |
|-----------|-------|
| คะแนนเริ่มต้น | 100 |
| ขาด | −1 |
| สาย | −1 |
| ชุด / ทรงผม / เล็บ / เครื่องประดับ | −5 ต่อรายการ |
| กระทำความดี | +5 |
| กระทำความผิด | −5 |

### ที่เก็บข้อมูล

Collection **`student_points`** ใน Firestore — สร้างอัตโนมัติเมื่อบันทึกเช็คชื่อ/ตรวจระเบียบ

### การแก้ไขด้วยมือ (Admin)

โปรไฟล์นักเรียน → ไทม์ไลน์ → **แก้ไข** / **ลบ** รายการ  
หรือ **คืนคะแนน** (เพิ่มคะแนนแบบ manual)

---

## 10. รายงานทั้งโรงเรียน

Admin ใช้หน้า **รายงาน** พร้อมสิทธิ์เพิ่ม:

- เลือกวันที่ย้อนหลัง (ไม่ล็อกแค่วันนี้)
- แท็บ **ภาคเรียน**
- กรอง **ชื่อครู**
- ดูทุก LEVEL/ROOM
- ช่วงวันที่ยาวโดยไม่เลือกห้อง — จำกัด **35 วัน** (ถ้าเกินต้องเลือกห้องก่อน)

---

## 11. Backup และ Restore ข้อมูล

### สถานะในโค้ดปัจจุบัน

มีโมดูล `src/services/backupExport.js` รองรับ:

- Export JSON / CSV รายการ attendance
- Restore จาก JSON

**แต่ยังไม่มีปุ่มใน UI** — ต้องใช้วิธีด้านล่าง

### Backup ผ่าน Firebase Console

1. [Firebase Console](https://console.firebase.google.com/) → โปรเจกต์ `famous-augury-495905-c3`
2. **Firestore Database**
3. Collection **`attendance`** — Export (หรือใช้ Google Cloud export ตามแผน Firebase)
4. Collection **`student_points`**, **`app_settings`** — ทำเช่นเดียวกัน

### Backup Google Sheets

- File → Download → หรือใช้ Google Drive version history
- แท็บสำคัญ: **Students**, **TEACHERS**

### Restore

- **Firestore:** นำเข้าผ่าน Console / script (ระวังทับ document id)
- **Sheets:** คืนจากไฟล์ backup หรือ version history
- โมดูล `restoreAttendanceRecords` ในโค้ด — ใช้เมื่อพัฒนาหน้า restore หรือเรียกจาก script ภายนอก

---

## 12. การตรวจสอบ Firestore

### Collections ที่ใช้งานจริง

| Collection | เอกสาร | ใช้สำหรับ |
|------------|--------|-----------|
| `attendance` | 1 รายการต่อ นักเรียน+วัน+ห้อง | เช็คชื่อ |
| `student_points` | 1 transaction ต่อเหตุการณ์ | คะแนนพฤติกรรม |
| `app_settings` | `school` | ตั้งค่าโรงเรียน |

### ตัวอย่าง Document ID (attendance)

```
M2-1__26737__2026-05-30
```

รูปแบบ: `{LEVEL-ROOM}__{STUDENT_ID}__{YYYY-MM-DD}`

### Firestore Rules (ปัจจุบัน)

ไฟล์ `firestore.rules` เปิด read/write ทั้งหมด (`allow read, write: if true`) — เหมาะสำหรับพัฒนา

ไฟล์ **`firestore.rules.secure`** มี rules แบบจำกัดสิทธิ — ยังไม่ได้ deploy เป็นค่าเริ่มต้น

### Index

Deploy index จาก `firestore.indexes.json`:

```powershell
firebase deploy --only firestore:indexes
```

ถ้า query ล้มเหลว ข้อความจะแนะนำให้สร้าง index ใน Console

---

## 13. การ Deploy ระบบ

### 13.1 ตัวแปรสภาพแวดล้อม (`.env`)

คัดลอกจาก `.env.example`:

```env
VITE_GAS_WEB_APP_URL=https://script.google.com/macros/s/.../exec
VITE_GAS_SECRET=                    # ถ้า GAS ตรวจ secret
VITE_ENABLE_PIN_LOGIN=true          # เปิดเมื่อพร้อมใช้ PIN (ไม่ใส่ = login ชื่อครู)
```

**Firebase config** ฝังใน `src/services/firebaseClient.js` (ไม่ได้อ่านจาก `.env`)

### 13.2 Google Apps Script

1. วางโค้ดจาก `gas-sample/Code.gs`
2. ตั้ง Script Property `SHEET_ID` (หรือแก้ constant ในไฟล์)
3. Deploy → Web App → Execute as Me → Anyone
4. คัดลอก URL ลง `.env`

### 13.3 Build และ Deploy Hosting

```powershell
npm install
npm run build
npx firebase deploy --only hosting:app
```

Deploy ทั้งหมด (rules, indexes, functions):

```powershell
npx firebase deploy
```

### 13.4 เปิด/ปิดระบบ PIN

| สถานะ | `.env` | ผลลัพธ์ |
|-------|--------|---------|
| ใช้งานจริง (ปัจจุบัน) | ไม่ใส่ หรือ `false` | Login ชื่อครู |
| เปิด PIN | `VITE_ENABLE_PIN_LOGIN=true` | Login ชื่อผู้ใช้ + PIN |

หลังแก้ `.env` ต้อง **build + deploy ใหม่**

### 13.5 Rollback เวอร์ชันเก่า

Firebase Console → Hosting → site `student-check-th` → **Release history** → Rollback

หรือ checkout commit เก่าจาก Git → build → deploy ทับ

---

## 14. การแก้ปัญหาเบื้องต้น

| อาการ | ตรวจสอบ |
|-------|---------|
| Login ไม่ได้ | TEACHERS sheet, GAS URL, Web App deploy Anyone |
| ไม่มีรายชื่อนักเรียน | แท็บ Students, `SHEET_ID`, header คอลัมน์ |
| บันทึกเช็คชื่อไม่ได้ | Firestore rules, การเชื่อม Firebase |
| Firestore index error | `firebase deploy --only firestore:indexes` |
| แอปยังเป็น PIN หลัง rollback | ล้าง cache PWA, ลบแอปจากหน้าจอหลัก |
| ครูไม่เห็นห้อง | `ASSIGNED_CLASSES` รูปแบบ `M2/1` |
| GAS Unknown action | Deploy GAS ชุดล่าสุดจาก `gas-sample/Code.gs` |
| รายงานช่วงยาว error | เลือก LEVEL+ROOM หรือลดช่วงไม่เกิน 35 วัน |

---

## 15. Git (แนะนำหลังตั้งค่าแล้ว)

```powershell
git add .
git commit -m "คำอธิบายการเปลี่ยนแปลง"
git tag -a v2.0.1 -m "ก่อน deploy production"
npx firebase deploy --only hosting:app
```

---

*เอกสารนี้อ้างอิงจากโค้ดและการตั้งค่าในโปรเจกต Student Check — ไม่รวมฟีเจอร์ที่ยังไม่ได้เชื่อม UI*
