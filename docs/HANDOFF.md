# Handoff & Security Audit Document
**Project:** Student Information Web App (ระบบสารสนเทศนักเรียน ศูนย์การศึกษาพิเศษ ประจำจังหวัดลำปาง — LPSEC)  
**Target URL:** [https://student-info-lpsec.vercel.app/](https://student-info-lpsec.vercel.app/)  
**Current Production Commit:** `dd99453` (Branch `main`)  
**Document Date:** 12 พฤศจิกายน 2569  
**Target Audience:** ChatGPT (Product Architect & Security Auditor) / Tech Lead

---

## ๑. ภาพรวมระบบและสถาปัตยกรรม (System Architecture)
- **Frontend:** Single Page Application (SPA) โฮสต์บน Vercel CDN  
  - Stack: Pure JavaScript (ES6+), jQuery, TailwindCSS (CDN), Lucide Icons, Chart.js, SheetJS (xlsx 0.20.3)
- **Backend / Database:** Google Apps Script (GAS) Web App ทำหน้าที่เป็น REST/JSON API เชื่อมต่อกับ Google Sheets ฐานข้อมูลจริง
- **การนำเข้าข้อมูลภายนอก (SET Importer):** ประมวลผลบน Client-Side 100% (In-Browser Memory) จากไฟล์ Excel (.xls / .xlsx) 3 รายงานจากระบบ SET สพฐ. โดยไม่ส่งไฟล์ขึ้นเซิร์ฟเวอร์ภายนอก

---

## ๒. มาตรการความปลอดภัยที่มีอยู่ในปัจจุบัน (Current Security & Safety Guardrails)

### ๒.๑ มาตรการปกป้องฐานข้อมูลจริง (Fail-Closed Live Data Gate)
- ฟังก์ชันระดับ Backend (`Code.gs`) ที่มีการเขียน/แก้ไข (`createStudent`, `updateStudent`, `deleteStudent`, `saveAppConfig`) ถูกครอบด้วย `checkWritesEnabled(props)`
- หาก `ENABLE_WRITES !== 'true'` ระบบจะตัดการทำงานทันที (Fail-Closed) เพื่อป้องกันไม่ให้ข้อมูลนักเรียนใน Google Sheets จริงถูกแก้ไขหรือเขียนทับโดยไม่ได้รับอนุญาต
- **ผลลัพธ์:** ปัจจุบันระบบทำงานในโหมด **Read-Only Analytics & Verification** 100% ปลอดภัยต่อฐานข้อมูลจริง

### ๒.๒ ระบบยืนยันตัวตนผู้ดูแลระบบ (Admin Authentication & Session Token)
- ใช้การเข้ารหัสผ่านทางเดียว PBKDF2/SHA-256 พร้อม Salt
- ออก Session Token แบบ Signed HMAC-SHA256 อายุ 15 นาที (TTL)
- มีฟังก์ชัน `constantTimeEquals` เพื่อป้องกัน Timing Attack
- การตั้งค่าแสดงผลหัวข้อ (Field Visibility) จำกัดสิทธิ์ให้เฉพาะ Admin ที่ผ่านการยืนยันรหัสผ่านเท่านั้น

### ๒.๓ นโยบาย Zero-PII และการปกป้องข้อมูลส่วนบุคคล (PDPA)
- เลขบัตรประชาชน 13 หลัก (`citizenId`) ถูกเซ็นเซอร์ (`XXX-XXXX-XXXX-XX`) ในทุกมุมมอง ทั้งตาราง การ์ดรายละเอียด และ Excel Preview
- เฉพาะ Admin ที่ยืนยันตัวตนเท่านั้นที่สามารถกดปุ่มสลับเพื่อดูเลขเต็มสำหรับการตรวจสอบรายคน
- ไฟล์ Excel ระบบ SET ถูกอ่านและวิเคราะห์ในหน่วยความจำเบราว์เซอร์ของผู้ใช้เท่านั้น ไม่มีการส่งออกนอกเครื่อง

---

## ๓. ประเด็นที่ส่งมอบให้ ChatGPT ช่วยตรวจสอบ (Audit Checkpoints for ChatGPT)

เพื่อให้ระบบมีความปลอดภัย รัดกุม และตอบโจทย์การใช้งานจริงในสถานศึกษา ขอส่งมอบ ๔ ประเด็นสำคัญให้ ChatGPT ช่วยพิจารณาและวางแนวทาง:

### 📌 ประเด็นที่ ๑: นโยบายการจัดเก็บการตั้งค่าการแสดงผล (Field Visibility: Local vs Cloud)
- **สถานะปัจจุบัน:** การเปิด/ปิดหัวข้อข้อมูลนักเรียน (เช่น ซ่อนความพิการตามทะเบียน SET ไว้ก่อน) ถูกจัดเก็บลง `localStorage` ของเบราว์เซอร์ Admin เพื่อความรวดเร็วและไม่กระทบ Google Sheets
- **คำถามสำหรับ ChatGPT:** 
  - ควรเปิดให้ Admin บันทึกค่านี้ขึ้น Google Script Properties (Cloud) ด้วยหรือไม่ เพื่อให้การตั้งค่าการแสดงผลมีผลเหมือนกันทั่วทั้งองค์กรในทุกเครื่องของครู?
  - หรือควรคงไว้แบบ Hybrid (อ่านค่ามาตรฐานจากระบบ และอนุญาตให้ Admin แต่ละเครื่องปรับตามความเหมาะสม)?

### 📌 ประเด็นที่ ๒: สถาปัตยกรรมสิทธิ์การแก้ไขข้อมูล (Read-Only vs Future Write Operations)
- **สถานะปัจจุบัน:** ระบบล็อก `ENABLE_WRITES != true` ไว้ ทำให้ผู้ใช้ทั่วไปและ Admin ปรับแก้ข้อมูลผ่านหน้าเว็บไม่ได้ ต้องแก้ใน Google Sheets ต้นทางโดยตรง
- **คำถามสำหรับ ChatGPT:**
  - ควรคงนโยบาย **"เว็บแอปนี้เป็นระบบรายงานและตรวจสอบข้อมูล (Read-Only Portal)"** ถาวรเพื่อความปลอดภัยสูงสุดของข้อมูลนักเรียนหรือไม่?
  - หากในอนาคตต้องการให้ Admin เพิ่ม/แก้ไขข้อมูลนักเรียนผ่านหน้าเว็บได้ ควรมีขั้นตอน Audit Log, Two-Factor Confirmation, หรือ Approval Workflow อย่างไร?

### 📌 ประเด็นที่ ๓: ลำดับความสำคัญของข้อมูลเมื่อเกิดความขัดแย้ง (Data Conflict Resolution)
- **สถานะปัจจุบัน:** ในการ์ดรายละเอียดนักเรียน ระบบดึงข้อมูลจาก Excel SET เป็นหลัก หากไม่มีจึงใช้ Google Sheets (เช่น รหัสนักเรียน, อายุ, วันเกิด)
- **คำถามสำหรับ ChatGPT:**
  - เกณฑ์การจับคู่ (Identifier Conflict): หากชื่อและวันเกิดตรงกัน แต่รหัสนักเรียนหรือประเภทความพิการระหว่าง Google Sheets กับ SET ไม่ตรงกัน ควรกำหนดระดับความน่าเชื่อถือ (Source of Truth) ของข้อมูลส่วนใดเป็นหลัก?
  - ควรมีกล่องไฮไลต์เตือนความขัดแย้ง (Discrepancy Warning Flag) แสดงให้ครูเห็นชัดเจนในกรณีที่ข้อมูลสองแหล่งไม่ตรงกันหรือไม่?

### 📌 ประเด็นที่ ๔: นโยบายความอ่อนไหวของข้อมูลนักเรียนเฉพาะทาง (Sensitive Student Data Policy)
- **สถานะปัจจุบัน:** การ์ดรายละเอียดมีการแสดงข้อมูล:
  1. ประเภทความพิการ (บัตรคนพิการ, แบบคัดกรอง, ทะเบียน SET)
  2. สถานะพิเศษ: "ไม่ใช่สัญชาติไทย" และ "พิการภายหลัง"
  3. ที่อยู่ตามทะเบียนบ้าน
- **คำถามสำหรับ ChatGPT:**
  - ข้อมูลกลุ่มใดควรจัดเป็นข้อมูลอ่อนไหวระดับสูงที่ควรซ่อนไว้เป็นค่าเริ่มต้น (Default Hidden) เพิ่มเติมอีกหรือไม่ เพื่อให้สอดคล้องกับ พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล (PDPA) และสิทธิเด็ก?

---

## ๔. ข้อมูลสถานะทางเทคนิค (Technical Status)
- **Unit Tests:** ผ่านครบ 27/27 Suites (`test_set_importer.js`)
- **Automated Validation:** ผ่านทุกเกณฑ์ทดสอบ (`test_visibility.js`)
- **Git State:** สะอาด (Working tree clean) บน branch `main` (SHA: `dd99453`)
- **Vercel Deployment:** Production Ready ([https://student-info-lpsec.vercel.app/](https://student-info-lpsec.vercel.app/))


---

## ๕. ผลการวิเคราะห์จาก ChatGPT และผลการตรวจสอบจริง (Live Audit by Antigravity)

### ๕.๑ มติและข้อกำหนดจาก ChatGPT (Architectural Directives)
1. **Field Visibility:** ใช้นโยบายแบบ Cloud (Script Properties) สำหรับส่วนกลาง และ LocalStorage สำหรับความสะดวกเฉพาะเครื่อง แต่ให้ความสำคัญสูงสุดกับการป้องกันข้อมูลหลุดที่ API ก่อน
2. **Write Policy:** ยืนยันคง **Read-Only Portal 100% ใน Phase 1** เพื่อความปลอดภัยสูงสุด หากจะเปิดให้แก้ไขในอนาคต ต้องมีระบบ Audit Log และการอนุมัติ 2 ขั้นตอน
3. **Source of Truth:** ใช้ **Field-Level Source of Truth** ตามหลักฐานทางการ ห้ามเขียนทับข้อมูลอัตโนมัติ และแสดงสถานะ "รอการตรวจสอบ (Pending Verification)" สำหรับรายการที่ขัดแย้ง
4. **PDPA (Default Hidden):** ข้อมูลความพิการ สุขภาพ วันเกิด และที่อยู่ เป็นข้อมูลอ่อนไหว ต้องแบ่งการเข้าถึงเป็น ๓ ระดับ (Level 1: Public Dashboard, Level 2: Authorized Staff, Level 3: Admin) และต้องจำกัดการส่งข้อมูลที่ฝั่ง Backend API ไม่ใช่เพียงซ่อนที่หน้าจอ

### ๕.๒ ผลการทดสอบสดบน Production API (Live Read-Only Audit Findings)
- **ช่องทางเขียน (Write Mutations):** 
  - ทดสอบส่งคำสั่ง `createStudent` ➔ ผลลัพธ์: ถูกตัดการทำงานทันที (`status: error`, `code: WRITES_DISABLED`, `Fail-Closed: ENABLE_WRITES != true`)
  - **สรุป:** ฐานข้อมูล Google Sheets ได้รับการปกป้องสมบูรณ์แบบ ไม่สามารถแก้ไขหรือลบผ่าน API ได้
- **ช่องทางอ่าน (Excessive Data Exposure):** 
  - ทดสอบเรียกดูข้อมูลแบบ Anonymous GET ➔ ผลลัพธ์: API ส่งข้อมูลนักเรียนทั้ง 249 รายการพร้อมฟิลด์ละเอียดอ่อน (`disabilityByCard`, `disabilityByScreening`, `dateOfBirth`, `disabledLater`, `nonThai`) ออกมาใน JSON
  - **สรุป:** ยืนยันตรงตามที่ ChatGPT เตือน ข้อมูลถูกส่งออกมาใน Network Level แม้ Frontend จะมีปุ่มซ่อนก็ตาม จึงต้องดำเนินการควบคุมการเปิดเผยข้อมูลที่ Backend API ในลำดับถัดไป


---

## ๖. สรุปผลการปฏิบัติการ Batch 1: Security Containment & Cache Hardening
- **มติและคำสั่งจากผู้ใช้ (Product Owner Directive):** 
  - **Batch 3 (Staff SSO):** ชะลอไว้ก่อน ยังไม่ใช้งาน โดยคงระบบรหัสผ่านเดิมไว้
  - **Batch 1 & 2:** อนุมัติให้ดำเนินการปรับปรุงระบบความปลอดภัยและการจัดการแคชทันที
- **ผลการพัฒนา (Implemented Changes on branch `feature/security-containment-pdpa`):**
  1. **Edge Gateway & Mutation Firewall (`api/students.js`):**
     - กำหนด Action Whitelist: รับเฉพาะคำขอที่อนุญาต (GET: `getStudentDataAndConfig`, `getTabs` / POST: `verifyAdminPassword`, `adminLogout`, `saveAppConfig`, `createStudent`, `updateStudent`, `deleteStudent`) ปฏิเสธคำขออื่นด้วย HTTP 400
     - สกัดกั้นคำขอเขียนข้อมูลที่ไม่ยืนยันตัวตนด้วย HTTP 401 ที่ชั้น Vercel โดยไม่ส่งต่อภาระไปยัง Google Apps Script
     - Public Allowlist: กรองข้อมูลตอบกลับสำหรับผู้ใช้ทั่วไป ไม่ส่งเลขบัตรประชาชน, ที่อยู่, เบอร์โทรศัพท์, ข้อมูลประเมินเชิงลึก และตัด `spreadsheetId` ออกจาก Config
     - Masking วันเกิด: แสดงเฉพาะปี พ.ศ. พร้อมคำนวณอายุอัตโนมัติ ทำให้กราฟสถิติและตัวกรองทำงานได้ครบ 100%
  2. **ป้องกัน Direct GAS Bypass (`config.js`):**
     - ปิดบัง Direct Google Apps Script URL บน Production โดยบังคับเรียกผ่าน `/api/students` เท่านั้น
  3. **การจัดการแคชในเบราว์เซอร์ (`app.js`):**
     - กำหนด TTL 15 นาที ให้กับ `LPSEC_STUDENT_DATA_CACHE` ใน LocalStorage เพื่อป้องกันข้อมูลค้างเก่าถาวร
     - ล้างไฟล์ SET Excel ออกจาก IndexedDB ทันทีเมื่อผู้ดูแลระบบกดออกจากระบบ (Logout)
- **ผลการตรวจสอบ (Verification Evidence):**
  - Unit Tests: 27/27 Suites PASS (`test_set_importer.js`)
  - Batch 1 Containment Tests: 4/4 Suites PASS (`scratch/test_batch1_containment.js`)
