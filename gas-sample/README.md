# Google Apps Script — Student Check Backend

ไฟล์ `Code.gs` ในโฟลเดอร์นี้เป็น **ต้นฉบับอ้างอิง** ที่ต้อง copy ไปวางใน Google Apps Script ที่ผูกกับ Spreadsheet ของโรงเรียน

แอปเว็บเรียกผ่าน `VITE_GAS_WEB_APP_URL` (ดู `.env.example`)

---

## แท็บใน Spreadsheet

| แท็บ | ใช้สำหรับ |
|------|-----------|
| `Students` | รายชื่อนักเรียน |
| `TEACHERS` | ครู, username, PIN, ห้องที่รับผิดชอบ |
| `Attendance` | (ทางเลือก) API เก่า — แอปหลักใช้ Firestore |

---

## Script properties (ตั้งใน Apps Script → Project settings)

| Property | ความหมาย |
|----------|----------|
| `SHEET_ID` | ID ของ Google Spreadsheet |
| `gasSecret` | (ถ้าใช้) ต้องตรงกับ `VITE_GAS_SECRET` ใน `.env` |

---

## Deploy (ทุกครั้งที่แก้ Code.gs)

1. เปิด https://script.google.com → โปรเจกต์ที่เชื่อมกับชีต
2. วาง `Code.gs` ทั้งไฟล์ (หรือ merge ส่วนที่แก้)
3. **Deploy → Manage deployments**
4. เลือก Web App เดิม → **Edit** (ไอคอนดินสอ)
5. **New version** → Deploy
6. URL `/exec` ต้อง**เหมือนเดิม** — ถ้าสร้าง deployment ใหม่ต้องอัปเดต `.env` และ deploy เว็บใหม่

### ตรวจว่า deploy สำเร็จ

```
https://script.google.com/macros/s/XXXX/exec?action=ping
```

ต้องได้ JSON มี `gas_version` (ค่าจาก `GAS_CODE_VERSION` ใน Code.gs)

---

## Actions สำคัญ (สำหรับ admin)

| action | หน้าที่ |
|--------|--------|
| `getStudents` | โหลดรายชื่อ |
| `adminCreateStudent` / `adminUpdateStudent` / `adminDeleteStudent` | จัดการนักเรียน |
| `adminCreateTeacher` / `adminUpdateTeacher` | จัดการครู |
| `verifyTeacherLogin` | Login PIN |

รายการเต็ม: เรียก `action=ping`

---

## หมายเหตุการเขียนชีต (นักพัฒนา)

- ชีตใหญ่ (~2,000+ แถว): ใช้ **เขียนทีละแถว** (`writeSheetRowAt_`) ไม่ rewrite ทั้งชีต
- `getRange(row, col, numRows, numCols)` — พารามิเตอร์ที่ 3 คือ **จำนวนแถว** ไม่ใช่เลขแถวสุดท้าย
- Helper กลาง: `writeSheetBodyRows_`, `writeStudentRowsInClass_` ใน Code.gs

---

## ไฟล์ใน repo vs production

| ที่ | บทบาท |
|-----|--------|
| `gas-sample/Code.gs` | ต้นฉบับใน git |
| Apps Script บน Google | สิ่งที่รันจริง — **ต้อง sync มือทุกครั้ง** |

Git commit อย่างเดียวไม่เปลี่ยน production GAS
