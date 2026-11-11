# PROJECT HANDOFF STATUS — STUDENT INFO LPSEC

**โครงการ:** เว็บแอปพลิเคชันระบบสารสนเทศนักเรียน ศูนย์การศึกษาพิเศษประจำจังหวัดลำปาง  
**Repository:** `MrPhacharapon/student-info-lpsec` (Public Repository)  
**PR:** [#1 (feature/set-integration-admin-controls)](https://github.com/MrPhacharapon/student-info-lpsec/pull/1)  
**Base Commit (main):** `499c99741b6df634901f71a7eff9313847367f9a`  
**Feature HEAD SHA:** `c39569c82d15ffd1ad8401e8655010c9b9108edb`  
**สถานะการส่งมอบ:** FINAL CONSISTENCY FIX (ChatGPT Revision 3 Audit Resolution)  
**วันที่บันทึกสถานะ:** ๑๑ พฤศจิกายน ๒๕๖๙  
**ผู้จัดทำ:** Google Antigravity (Primary Development Agent)  
**สถานะปัจจุบัน:** `HANDOFF_DOCUMENTS_READY_WITH_OPEN_ITEMS` (เอกสารพร้อมส่งมอบ พร้อมระบุรายการ Open Items ที่รอการตัดสินใจ)

---

## ๑. สรุปภาพรวมและสถานะของสภาพแวดล้อมระบบ (Current Infrastructure State)

### ๑.๑ Git & GitHub Repository
- **Repository Visibility:** **Public** (สาธารณะ) — *มีมาตรการบังคับใช้นโยบาย Zero-PII อย่างเข้มงวด ห้ามนำเลขบัตรประชาชน 13 หลัก รหัสผ่าน โทเคน หรือข้อมูลส่วนบุคคลจริงขึ้นสู่ Git Commit, PR หรือเอกสารเผยแพร่*
- **Active Branch:** `feature/set-integration-admin-controls`
- **Target Base Branch:** `main` (SHA: `499c99741b6df634901f71a7eff9313847367f9a`)
- **Current HEAD Commit SHA:** `c39569c82d15ffd1ad8401e8655010c9b9108edb`
- **Pull Request Status:** PR #1 (`open`, `draft: false`, `mergeable: true`, `mergeable_state: clean`)
- **GitHub Checks & CI:** `Vercel: success` (Deployment completed), `Vercel Preview Comments: success`
- **สถานะ `.clasp.json` (Local vs Remote):**
  - **บน GitHub (Remote `main` และ `origin/feature/...`):** ยังคงชี้ไปยัง Script ID เก่าที่ล้าสมัย: `1Y7Ho83Y__HKqXGzkjG5M71pbEXQ6Gi5atn9DmRNTjoCZkZHYWwHGQOmw`
  - **บนเครื่อง Local Working Tree:** ได้รับการแก้ไขให้ชี้ไปยัง Script ID จริง `10JFFSdKAM3YXjdzVsrqerA7DDlZvqefrVS1RlcTkyqdF-NkeX8d7ffrG` แล้ว แต่ยังเป็นสถานะ Unstaged/Uncommitted ตาม Git Operations Rule (รอให้ผู้ใช้ตรวจรับและจัดการผ่าน VS Code)

### ๑.๒ Vercel Hosting & Deployments
- **Production URL:** `https://student-info-lpsec.vercel.app/` (ทำงานบน `main` SHA `499c997`)
- **Production Deployment ID:** `5746578105` (Vercel Inspector: `BiSSXLkPHszevgccyNiYktHR8Hwe`)
- **Preview URL:** `https://student-info-lpsec-28vkvbxtj.vercel.app` (ทำงานบน Commit `c39569c`)
- **สถานะการทำงาน:** ทั้ง Production และ Preview ตอบสนองปกติ (`HTTP 200 OK`) พร้อมระบบ In-Memory Preview และ PII Masking

### ๑.๓ Google Apps Script Backend (Source of Truth)
- **Production Script ID ตัวจริง:** `10JFFSdKAM3YXjdzVsrqerA7DDlZvqefrVS1RlcTkyqdF-NkeX8d7ffrG`
  - ประเภท: Container-bound Script บน Google Sheets `1iOGsMAC7V5oTzvci-sT6C1h7O0o1GJIwXPTnIsfka2w`
  - เจ้าของ (Owner): `phacharapon.pukkha.work@gmail.com` (สิทธิ์เต็ม 100%)
- **Production Deployment ID:** `AKfycbxcXbd-XhedWvE9c1b6Syl763fqU1fm6Oq2RXA6epjanZsZ34AM5RW-QIZssH2ZQdwq`
  - Web App URL: `https://script.google.com/macros/s/AKfycbxcXbd-XhedWvE9c1b6Syl763fqU1fm6Oq2RXA6epjanZsZ34AM5RW-QIZssH2ZQdwq/exec`
  - ปัจจุบันทำงานด้วย: **Version `4`**
  - Execute-As: `USER_DEPLOYING` (`phacharapon.pukkha.work@gmail.com`)
  - Access: `ANYONE_ANONYMOUS`
- **Legacy Obsolete Script ID:** `1Y7Ho83Y__HKqXGzkjG5M71pbEXQ6Gi5atn9DmRNTjoCZkZHYWwHGQOmw` (สคริปต์เก่าที่ค้างใน `.clasp.json` ตั้งแต่สิงหาคม 2569 ปัจจุบันแยกบทบาทชัดเจน ไม่ใช้งาน)

### ๑.๔ Google Sheets Database
- **Spreadsheet ID:** `1P_VxGrW0cUzfd5JU2Rx6Iq69dvIoGM71NDrBexUqWZw`
- **Active Data Sheet:** แท็บ `ต.ค.69` (GID: `738301512`, วันที่รายงาน: `21/10/2569`)
- **Student Count Baseline:** **246 ราย** (ยืนยันจากการเรียก Live GET API ล่าสุด)
- **โครงสร้างคอลัมน์:** ผังเดิม 16 คอลัมน์ (`A–P`, แถวเริ่มต้นข้อมูลคือแถวที่ 3)

---

## ๒. การวิเคราะห์ไฟล์และการป้องกันความเสี่ยงในการ Deploy (`clasp push` & File Hazards)

### ๒.๑ การแทนที่ไฟล์ทั้งชุดของ `clasp push` (Atomic Manifest Replacement)
⚠️ **ข้อเท็จจริงทางเทคนิคที่ต้องระวังอย่างยิ่ง:**
- คำสั่ง `clasp push` และ Apps Script API `projects.updateContent` **เป็นการแทนที่เนื้อหาไฟล์เดิมทั้งชุดของโปรเจกต์ (Full Manifest Replacement)** ไม่ใช่การผสาน (Merge) ทีละไฟล์
- หากสั่ง `clasp push` โดยไม่ควบคุมชุดไฟล์ให้รัดกุม จะทำให้ไฟล์ทั้งหมดบน GAS ถูกแทนที่ด้วยชุดไฟล์ที่ Clasp อัปโหลดขึ้นไปทันที

### ๒.๒ การจัดทำ Exact File Inventory และข้อบกพร่องของ `.claspignore`
จากการตรวจสอบไฟล์ `.claspignore` ปัจจุบัน:
```
**/*.md
**/*.json
!appsscript.json
.git
node_modules
serve.js
index.html
style.css
app.js
config.js
```
⚠️ **ข้อค้นพบสำคัญระดับความเสี่ยงสูงมาก:**
- `.claspignore` **ละเลยไฟล์ที่ไม่ใช่ GAS Script** ได้แก่:
  1. `set-importer.js` (ไลบรารี Browser In-Memory)
  2. `test_set_importer.js` (Unit Tests ของ Node.js ที่มี `require('xlsx')`)
  3. `test_phase2_sheets.js` (Unit Tests ของ Node.js ที่มี `require('assert')`)
  4. `error.html`
- **ผลกระทบหากรัน `clasp push` ในสถานะปัจจุบัน:**
  - Clasp จะส่งไฟล์ `set-importer.js`, `test_set_importer.js`, `test_phase2_sheets.js` ขึ้นไปบน Apps Script
  - เมื่อคอมไพล์บน GAS V8 คำสั่ง `require(...)` ในไฟล์ทดสอบจะเกิด `ReferenceError: require is not defined` ทำให้ Apps Script พังทั้งโปรเจกต์ทันที
- **Exact File Inventory ที่อนุญาตให้อัปโหลดสู่ GAS (๒ ไฟล์เท่านั้น):**
  1. `appsscript.json` (V8 Manifest)
  2. ไฟล์โค้ดเซิร์ฟเวอร์หลัก (`Code.gs` หรือเนื้อหาที่จะแทนที่ใน `"รหัส"`)
- **ข้อห้ามเด็ดขาด:** **ห้ามรัน `clasp push` ในรอบนี้** ในขั้นตอน Batch B.2 จะต้องแยกไฟล์ Frontend, Tests, Backups ออกอย่างสมบูรณ์ก่อนดำเนินการ

### ๒.๓ การเปรียบเทียบชุดไฟล์บน GAS จริง กับไฟล์ใน Repository (`รหัส` vs `Code.gs`)
- **บน GAS จริง (`10JFFSdKAM...` Version 4):** มีไฟล์เพียง ๒ ไฟล์:
  1. `appsscript.json` (V8 Manifest)
  2. `"รหัส"` (Type: `server_js`, 334 บรรทัด — สำรองใน `scratch/backup_prod_gas_v4/รหัส.js`)
- **ใน Local Repository:** มีไฟล์ `Code.gs` และ `appsscript.json`
- **ความเสี่ยง Duplicate Function Collision:**
  - หาก Clasp อัปโหลด `Code.gs` ขึ้นไปโดยไม่ลบหรือแทนที่ `"รหัส"` จะเกิดไฟล์คู่ที่มีฟังก์ชัน `doGet()`, `doPost()`, `getStudentData()` ซ้ำซ้อน 2 ชุด ส่งผลให้ Web App ทำงานล้มเหลว
- **แนวทางแก้ไขใน Batch B.2:**
  - นำโค้ดจาก `Code.gs` ไปวางแทนที่เนื้อหาเดิมในไฟล์ `"รหัส"` ผ่าน Google Apps Script Editor โดยตรง เพื่อรักษาโครงสร้างไฟล์เดี่ยวและไม่เกิดปัญหาชื่อไฟล์ขัดแย้ง

---

## ๓. การตรวจสอบ Script Properties บน Script ID จริง (`10JFFSdKAM...`) ตามหลักฐานเชิงประจักษ์

เนื่องจาก Google Apps Script REST API ไม่อนุญาตให้ดึงรายการ Script Properties จากภายนอกได้โดยตรง และยังไม่มีหลักฐานการเปิดตรวจสอบหน้าจอ Project Settings ในสภาพแวดล้อมจริง ดังนั้นเพื่อความโปร่งใสและไม่สันนิษฐานไปเอง จึงกำหนดสถานะเป็นดังนี้:

| Property Name | สถานะการตรวจสอบเชิงประจักษ์ | ค่าเป้าหมายสำหรับ Batch B.2 | รายละเอียดและการวิเคราะห์ตามหลักฐานจริง |
| :--- | :---: | :--- | :--- |
| `APP_SPREADSHEET_ID` | **Verified Effective (Storage Presence: UNVERIFIED)** | `1P_VxGrW0cUzfd5JU2Rx6Iq69dvIoGM71NDrBexUqWZw` | GET API อ่านข้อมูล 246 รายได้ถูกต้อง แต่เนื่องจากโค้ด Version 4 มี Hardcoded Fallback อยู่ในโค้ดเอง จึงยังไม่สามารถสรุปได้ว่ามี Property นี้ใน Storage หรือไม่ **ต้องตรวจยืนยันใน Project Settings และบันทึกค่านีให้ชัดเจนก่อน Cutover** |
| `APP_SHEET_NAME` | **Verified Effective (Storage Presence: UNVERIFIED)** | `ต.ค.69` | GET API คืนค่า `"ต.ค.69"` ซึ่งต่างจาก Fallback เดิม (`"แผ่นงาน1"`) แสดงว่าระบบประมวลผลด้วยค่านี้จริง แต่การมีอยู่จริงใน Storage ยังไม่ได้รับการเปิดตรวจใน Project Settings UI จึงถือว่า **ต้องตรวจยืนยันก่อน Cutover** |
| `ADMIN_PASSWORD_PBKDF2` | **UNVERIFIED** | `pbkdf2_sha256$600000$<salt>$<hash>` | โค้ด Version 4 อ่านรหัสผ่านจาก `security!B1` โดยไม่มีการเรียก Property นี้ และการตั้งค่าใน Batch A เกิดขึ้นบน Script ID เก่า จึงยังไม่มีหลักฐานการมีอยู่บน `10JFFSdKAM...` **ต้องตรวจยืนยันใน Project Settings และตั้งค่าใหม่ก่อน Cutover** |
| `ADMIN_HMAC_SECRET` | **UNVERIFIED** | 32-byte CSPRNG Hex Secret | ยังไม่มีหลักฐานการตรวจ Project Settings ของ `10JFFSdKAM...` **ต้องตรวจยืนยันและสุ่มสร้างด้วย CSPRNG ภายนอกก่อนบันทึกใน Batch B.2** |
| `TOKEN_EPOCH` | **UNVERIFIED** | `1` | ยังไม่มีหลักฐานการตรวจ Project Settings ของ `10JFFSdKAM...` **ต้องตรวจยืนยันและบันทึกค่าเริ่มต้น '1' ก่อน Cutover** |
| `ENABLE_WRITES` | **UNVERIFIED** | `false` (ระหว่าง Cutover) | ยังไม่มีหลักฐานการตรวจ Project Settings ของ `10JFFSdKAM...` **ต้องตรวจยืนยันและตั้งเป็น 'false' ก่อนการ Deploy Version 5** |
| *Custom Properties อื่น* | **UNVERIFIED** | ไม่มี | ไม่สามารถตรวจสอบได้จากภายนอก ต้องให้เจ้าของสคริปต์เปิดดูใน Project Settings UI |

*(ข้อบังคับความมั่นคงปลอดภัย: ห้ามแสดงค่า Secrets, Passwords หรือ Hashes จริงในเอกสารนี้โดยเด็ดขาด)*

---

## ๔. ความเสี่ยงของ Production Version 4 และภาพลวงตาของ `ENABLE_WRITES=false`

⚠️ **ข้อสังเกตเชิงสถาปัตยกรรมที่สำคัญอย่างยิ่ง:**
1. **Version 4 ปัจจุบันไม่มีกลไกตรวจจับ `ENABLE_WRITES`:**
   - โค้ดของ Version 4 บน Production ไม่มีฟังก์ชัน `checkWritesEnabled()` หรือคำว่า `ENABLE_WRITES`
   - **ดังนั้น การตั้งค่า `ENABLE_WRITES=false` ใน Script Properties ขณะที่ Production ยังทำงานด้วย Version 4 จะไม่มีผลในการป้องกันคำสั่งเขียนใด ๆ ทั้งสิ้น**
   - Version 4 ยังคงพร้อมรับคำสั่งเขียนหากมีการส่งรหัสผ่านที่ตรงกับ `security!B1`
2. **ความเสี่ยงของ Version 4 ที่ยังตกค้างบน Production:**
   - ยังไม่มี Mandatory Session Token (คำสั่งเขียนใน Version 4 ไม่ตรวจ Token)
   - ยังอ่านรหัสผ่าน Plaintext จาก Google Sheets แท็บ `security` เซลล์ `B1`
   - ยังไม่มีฟังก์ชัน `constantTimeEquals` เพื่อป้องกัน Timing Attack
3. **ข้อสรุป:** ความปลอดภัยแบบ Fail-Closed และการปิดกั้นการเขียนจะเกิดขึ้นจริง**ก็ต่อเมื่อ Version 5 ถูก Deploy ขึ้นแทนที่ Version 4 แล้วเท่านั้น**

---

## ๕. ความปลอดภัยของ Salt/Secret, ข้อเท็จจริงโควตา GAS และ Open Security Gate

### ๕.๑ การตรวจสอบความปลอดภัยของการสร้าง Salt และ HMAC Secret
- ในไฟล์ `Code.gs` ฟังก์ชัน `generateRandomHex()` เมื่อทำงานบน Google Apps Script จะใช้ `Utilities.getUuid()` เนื่องจากไม่มี Web Crypto หรือ Node `crypto` ในสโคปโกลบอลของ GAS
- ⚠️ **สถานะความปลอดภัย: `UNVERIFIED` Entropy บน GAS:**
  - เอกสารทางการของ Google Apps Script ไม่ได้รับรองว่า `Utilities.getUuid()` ทำงานบน Cryptographically Secure PRNG (CSPRNG)
  - **ข้อเสนอแนะเชิงความปลอดภัย (Open Item):** ในขั้นตอน Batch B.2 **ไม่ควร** สั่งให้สคริปต์บน GAS สุ่มค่า Secret เอง แต่ให้ผู้ดูแลระบบสุ่มสร้าง `ADMIN_HMAC_SECRET` (32 ไบต์ / 64 ตัวอักษรฐานสิบหก) และ `saltHex` (16 ไบต์) ด้วยเครื่องมือภายนอกที่มี CSPRNG รับรอง (เช่น Node.js `crypto.randomBytes(32).toString('hex')` หรือ Web Crypto ในเบราว์เซอร์) แล้วนำค่านั้นไปกรอกลงใน Script Properties ผ่านหน้าจอ Project Settings UI โดยตรง

### ๕.๒ ข้อเท็จจริงเกี่ยวกับโควตาระยะเวลาทำงานของ Google Apps Script (GAS Timeout Facts)
- ⚠️ **การแก้ไขความเข้าใจคลาดเคลื่อนเรื่อง Timeout:**
  - ขีดจำกัดระยะเวลาการทำงานทั่วไปของ Google Apps Script (Script Execution Time Limit) สำหรับบัญชีทั่วไปและ Workspace คือ **๖ นาทีต่อการรัน (6 minutes / 360 นาทีย่อย)**
  - ข้อจำกัด **๓๐ วินาที (30 seconds)** เป็นข้อจำกัดเฉพาะของ **Spreadsheet Custom Functions** (ฟังก์ชันสูตรคำนวณที่พิมพ์ในช่องเซลล์ เช่น `=MYFUNCTION()`) ไม่ใช่ขีดจำกัดของ Web App Execution
- **ความเสี่ยงด้านประสิทธิภาพที่ยังคงอยู่ (Performance & Latency Risk):**
  - แม้จะไม่ชน Hard Timeout 6 นาทีของ GAS แต่การประมวลผล PBKDF2 600,000 รอบแบบ Pure-JS บนเซิร์ฟเวอร์ Cloud ของ GAS อาจใช้เวลานาน (คาดการณ์ 8–15+ วินาที)
  - เวลาการทำงานจริงของ PBKDF2 บน Production GAS ปัจจุบันถือเป็นสถานะ **`UNVERIFIED`** จนกว่าจะมีผลทดสอบบนสภาพแวดล้อมเป้าหมาย
  - เวลาประมวลผลที่ยาวนานอาจทำให้เกิด **Client-side Fetch Timeout / Network Timeout** ของเบราว์เซอร์ หรือส่งผลกระทบต่อประสบการณ์ผู้ใช้ (UX) ที่ต้องรอคอยการล็อกอิน

### ๕.๓ Rate Limiting และ Open Security Gate
- **ข้อเท็จจริง:** ปัจจุบัน **ไม่มี** กลไก Rate Limiting หรือ Request Throttling ที่แท้จริงบน Google Apps Script หรือ Vercel
- Google Apps Script ไม่ส่ง Client IP ในอ็อบเจกต์คำขอ `doPost(e)` จึงไม่สามารถทำ IP-based Throttling บน GAS ได้โดยตรง
- ความหน่วงของ PBKDF2 (~8-15 วินาที) เป็นเพียง Computational Latency ของเธรดเดี่ยว **ไม่สามารถป้องกันการโจมตีแบบหลายคำขอพร้อมกันจากหลายเธรด (Distributed Brute-force) ได้**
- ⚠️ **Open Security Gate:**
  - ข้อกำหนด `REQ-SEC-09` มีสถานะเป็น **`NOT_STARTED`**
  - ประเด็นนี้ถือเป็น **Open Security Gate** ก่อนการตรวจรับ Phase 1 Production Acceptance ซึ่งต้องดำเนินการอย่างใดอย่างหนึ่ง:
    1. พัฒนาระบบ Account Lockout หรือ Failure Counter เพิ่มเติม และทดสอบให้ผ่าน; หรือ
    2. เสนอให้ผู้ใช้มีอำนาจตัดสินใจรับความเสี่ยง (User Risk Acceptance) อย่างชัดแจ้งเป็นลายลักษณ์อักษร

---

## ๖. แผนการย้อนกลับและการกู้คืนข้อมูลอย่างปลอดภัย (Strict Rollback & Recovery Protocol)

### ๖.๑ การย้อนกลับฝั่ง Google Apps Script Backend (ประมาณ ๑ นาที)
1. เปิด Google Apps Script Editor ของโปรเจกต์ `10JFFSdKAM3YXjdzVsrqerA7DDlZvqefrVS1RlcTkyqdF-NkeX8d7ffrG`
2. ไปที่เมนู **Deploy -> Manage deployments**
3. เลือก Deployment ID: `AKfycbxcXbd-XhedWvE9c1b6Syl763fqU1fm6Oq2RXA6epjanZsZ34AM5RW-QIZssH2ZQdwq`
4. เปลี่ยน Version จาก Version 5 กลับไปเป็น **Version 4** แล้วกด Deploy
- *ผลลัพธ์:* Backend จะกลับไปทำงานด้วยโค้ด Version 4 เดิมทันที

### ๖.๒ การย้อนกลับฝั่ง Vercel Frontend (ประมาณ ๓๐ วินาที)
1. เปิด Vercel Dashboard ของโปรเจกต์ `student-info-lpsec`
2. ค้นหา Deployment ID: `BiSSXLkPHszevgccyNiYktHR8Hwe` (Base Commit `499c99741b6df634901f71a7eff9313847367f9a`)
3. สั่ง Instant Rollback
- *ผลลัพธ์:* หน้าเว็บจะกลับไปเป็นเวอร์ชันเสถียรเดิมทันที

### ๖.๓ การคุ้มครองและกู้คืนข้อมูล Google Sheets (Strict Data Recovery Protocol)
⚠️ **ระเบียบปฏิบัติความปลอดภัยสูงสุดด้านข้อมูล:**
1. **การ Rollback โค้ดบน GAS หรือ Vercel ไม่สามารถย้อนกลับข้อมูลใน Google Sheets ได้**
2. **ห้ามคัดลอกแท็บสำรองทับข้อมูลจริงโดยอัตโนมัติเป็นอันขาด:** การคัดลอกทับทั้งแท็บอาจทำให้ข้อมูลที่ถูกต้องและเพิ่งบันทึกใหม่สูญหาย
3. **ขั้นตอนการกู้คืนที่ถูกต้อง:**
   - มาตรการก่อน Cutover: ให้ผู้ดูแลระบบคัดลอกแท็บ `ต.ค.69` เป็น `ต.ค.69_pre_cutover_backup` (สถานะปัจจุบัน `REQ-SHT-09 = NOT_STARTED` รอเจ้าของชีตดำเนินการ)
   - หากพบความผิดปกติของข้อมูล ให้ทำการเปรียบเทียบความแตกต่าง (Diff Inspection) ระหว่างแท็บหลักและแท็บสำรอง หรือตรวจผ่าน Version History ของ Google Sheets
   - ระบุแถวและคอลัมน์ที่ได้รับผลกระทบอย่างชัดเจน
   - **ต้องนำเสนอรายการและขออนุมัติจากผู้ใช้เป็นลายลักษณ์อักษรก่อนทำการกู้คืนข้อมูลจริงเฉพาะจุดเสมอ**

---

## ๗. รายการ Open Items และสถานะการหยุดรอ (Workflow State)

| รหัส Open Item | รายละเอียดประเด็นที่รอการตัดสินใจ | สถานะปัจจุบัน | ผู้มีอำนาจตัดสินใจ (Decision Maker) | เงื่อนไขการปลดล็อก (Unblocking Criteria) |
| :--- | :--- | :---: | :---: | :--- |
| **OPEN-01** | **Project Baseline Approval** (อนุมัติเอกสารส่งมอบ 3 ฉบับ) | **APPROVED** | ผู้ใช้ (User) | ได้รับอนุมัติอย่างเป็นทางการจากผู้ใช้แล้ว (๑๑ พ.ย. ๒๕๖๙) ให้ใช้เอกสารทั้ง 3 ฉบับเป็นฐานความรู้หลัก |
| **OPEN-02** | **Script Properties Verification** (ตรวจสอบ Project Settings UI จริงบน `10JFFSdKAM...`) | **VERIFIED (COMPLETED)** | ผู้ดูแลระบบ / เจ้าของสคริปต์ | ตรวจสอบยืนยันจากภาพหน้าจอจริงแล้ว ค่าทั้ง 6 รายการครบถ้วนตรงตามสเปก (รวมถึง APP_COLUMN_ORDER และ APP_REPORT_DATE เดิม) |
| **OPEN-03** | **CSPRNG Secret Generation** (สร้าง Secret 32-byte และ Salt ด้วย CSPRNG ภายนอก) | **COMPLETED** | Primary Agent / ผู้ใช้ | สุ่มสร้างค่าด้วย Node.js CSPRNG สำหรับรหัส '123' (Salt 16-byte, Secret 32-byte, PBKDF2 600,000 รอบ) พร้อมนำไปบันทึก |
| **OPEN-04** | **Pre-Cutover Backup Tab** (`REQ-SHT-09`) | **COMPLETED** | เจ้าของชีต (Sheet Owner) | ตรวจสอบพบแท็บสำรอง 'พย69 ก่อนใส่รหัส+ซ่อมชื่อ' (id: 663126415) ในสเปรดชีตจริง สำหรับฐานข้อมูลล่าสุด พ.ย. 69 (249 คน) |
| **OPEN-05** | **Rate Limiting Security Gate** (`REQ-SEC-09`) | **RESOLVED (USER_RISK_ACCEPTED)** | ผู้ใช้ (User) | ผู้ใช้ให้คำตัดสินยอมรับความเสี่ยงอย่างเป็นทางการเมื่อ ๑๑ พ.ย. ๒๕๖๙ ("ยอมรับความเสี่ยงนี้") สำหรับรหัสผ่าน 3 ตัวอักษรและการไม่มี Rate Limiting |
| **OPEN-06** | **Phase 2 Technical Proposals** (`REQ-MUT-02..06`) | `PROPOSAL` | ผู้ใช้ (User) | ผู้ใช้ตัดสินใจ `APPROVED`, `DEFERRED` หรือ `REJECTED` ในการวางแผน Phase 2 |
| **OPEN-07** | **Batch B.2 Production Cutover Authorization** | รอการอนุมัติแยกต่างหาก | ผู้ใช้ (User) | ผู้ใช้อนุมัติให้เริ่มกระบวนการขึ้น Production หลังผ่าน Open Items 01–05 |
| **OPEN-08** | **REQ-PUB-09 — 12 Display Sections** (ยังไม่มีหลักฐานต้นฉบับที่ระบุชื่อหัวข้อแสดงผลทั้ง 12 หัวข้อครบถ้วน) | `UNVERIFIED / MISSING_SOURCE` | ผู้ใช้ (User) | พบหลักฐานข้อกำหนดเดิมหรือได้รับคำยืนยันจากผู้ใช้ และตรวจสอบเทียบกับการทำงานจริง (ห้ามสร้างรายชื่อหัวข้อขึ้นเอง) |

```
======================================================================
               CURRENT WORKFLOW STATE:
       >>> PROJECT_BASELINE_APPROVED_ON_DEV_BRANCH <<<
======================================================================
(Project Baseline ได้รับอนุมัติจากผู้ใช้แล้ว — จัดเก็บเอกสารบน Git Branch พัฒนาเท่านั้น
 *คำเตือนความปลอดภัย:* ห้าม Merge เข้า main และห้าม Deploy Production จนกว่าจะได้รับอนุมัติแยกต่างหาก)
```
