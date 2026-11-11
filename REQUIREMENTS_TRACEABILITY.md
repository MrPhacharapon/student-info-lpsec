# REQUIREMENTS TRACEABILITY MATRIX — STUDENT INFO LPSEC

**โครงการ:** เว็บแอปพลิเคชันระบบสารสนเทศนักเรียน ศูนย์การศึกษาพิเศษประจำจังหวัดลำปาง  
**Repository:** `MrPhacharapon/student-info-lpsec` (Public)  
**PR:** [#1 (feature/set-integration-admin-controls)](https://github.com/MrPhacharapon/student-info-lpsec/pull/1)  
**Base Commit (main):** `499c99741b6df634901f71a7eff9313847367f9a`  
**Feature HEAD SHA:** `c39569c82d15ffd1ad8401e8655010c9b9108edb`  
**สถานะการส่งมอบ:** FINAL CONSISTENCY FIX (ChatGPT Revision 3 Audit Resolution)  
**วันที่ปรับปรุง:** ๑๑ พฤศจิกายน ๒๕๖๙  

---

## ๑. นิยามสถานะและเกณฑ์การประเมินเชิงประจักษ์ (Strict Evidence-Based Status Rules)

เพื่อความถูกต้องตามหลักวิศวกรรมซอฟต์แวร์และผลตรวจของ ChatGPT มีการกำหนดนิยามสถานะอย่างเคร่งครัดดังนี้:

- `ACCEPTED`: ข้อกำหนดที่ได้รับการพัฒนา ติดตั้งบน **Live Production** (Base `main` SHA `499c997`) และผ่านการตรวจรับความถูกต้องจากผู้ใช้/UAT อย่างเป็นทางการแล้วเท่านั้น (ห้ามใช้กับฟีเจอร์ใน PR #1 ที่ยังไม่ได้ขึ้น Production)
- `TESTED`: ข้อกำหนดที่ได้รับการพัฒนาแล้วใน PR #1 (`c39569c`) และผ่านการทดสอบ Unit Tests, Regression Tests หรือ UAT บน Staging/Preview แล้วอย่างเป็นทางการ มีหลักฐานและ Log รองรับ พร้อมสำหรับขึ้น Production ใน Batch B.2
- `IMPLEMENTED`: พัฒนาโค้ดแล้วเสร็จ แต่ยังขาดการทดสอบอย่างเป็นทางการ
- `NOT_STARTED`: ข้อกำหนดที่ยังไม่ได้เริ่มพัฒนา หรือขั้นตอนปฏิบัติการจริงที่ยังไม่ได้ดำเนินการ (เช่น การคัดลอกชีตสำรองก่อน Cutover, งานระยะที่ ๒ Phase 2)
- `UNVERIFIED`: ข้อกำหนดที่ยังขาดหลักฐานยืนยัน หรือข้อกำหนดที่เอกสารต้นฉบับระบุไม่ชัดเจน (`MISSING_SOURCE`)
- `IN_PROGRESS`: กำลังอยู่ระหว่างการพัฒนาหรือแก้ไข
- `BLOCKED`: ติดอุปสรรคที่ไม่สามารถดำเนินการต่อได้

---

## ๒. ตารางติดตามข้อกำหนด (Traceability Matrix — ๖๒ ข้อกำหนด)

### หมวดที่ ๑: Public Viewer (สืบค้นและแสดงผลข้อมูลทั่วไป) — รวม ๙ ข้อกำหนด

| Req ID | Requirement Description | Source | Approval Evidence | Related Files | Related Test / Evidence | Status | Remaining Work | Risk | Acceptance Criteria |
| :--- | :--- | :--- | :--- | :--- | :--- | :---: | :--- | :---: | :--- |
| **REQ-PUB-01** | แสดงข้อมูลสถิติภาพรวมนักเรียน (จำนวนรวม 246 คน, แยกตามประเภทบริการ, แยกตามประเภทความพิการ 9 ประเภท) | Initial Project Scope | User UAT Aug 2026 | `index.html`, `app.js` | Live Prod GET API / Browser UAT | `ACCEPTED` | ไม่มี | Low | ตัวเลขสถิติตรงกับ Google Sheets จริงแท็บ `ต.ค.69` รวม 246 ราย |
| **REQ-PUB-02** | แสดงกราฟสถิติด้วย Chart.js และ DataLabels พร้อมฟอนต์ Sarabun และระยะขอบตัวอักษร | Commit `499c997`, `aec0cb8` | User Review Aug 2026 | `index.html`, `app.js` | Visual Inspection on Prod | `ACCEPTED` | ไม่มี | Low | กราฟแสดงตัวเลขชัดเจน ตัวอักษร Sarabun ไม่ตกขอบ รองรับการแสดงผลทุกขนาดหน้าจอ |
| **REQ-PUB-03** | ตารางรายชื่อนักเรียนพร้อมข้อมูลพื้นฐาน และการจัดเรียงคอลัมน์แบบไดนามิก | `Code.gs`, `app.js` | User Review Aug 2026 | `index.html`, `app.js` | Browser UAT on Prod | `ACCEPTED` | ไม่มี | Low | แสดงคอลัมน์ถูกต้องตามลำดับที่ตั้งค่าไว้ใน Google Sheets |
| **REQ-PUB-04** | ระบบตัวกรองข้อมูลหลายระดับ (ห้องเรียน, ครูผู้รับผิดชอบ, ความพิการบัตร/คัดกรอง, ช่วงอายุ, อายุรายปี) | Commit `d960d77`, `37a0946` | User Review Aug 2026 | `index.html`, `app.js` | Filter Integration Test | `ACCEPTED` | ไม่มี | Low | กรองข้อมูลถูกต้อง ผลลัพธ์สัมพันธ์กันทุกมิติ และมีปุ่มล้างตัวกรอง |
| **REQ-PUB-05** | ตารางวิเคราะห์ข้อมูลความสัมพันธ์แบบหลายมิติ (Cross-tabulation / Pivot Table Generator) | Commit `d960d77` | User Review Aug 2026 | `index.html`, `app.js` | Pivot Generation Test | `ACCEPTED` | ไม่มี | Low | สรุปผลข้ามมิติได้ถูกต้องตามแถวและคอลัมน์ที่ผู้ใช้เลือก |
| **REQ-PUB-06** | ป้องกันไม่ให้ Public API (`doGet`) ส่งข้อมูลความลับ เลขประจำตัวประชาชน หรือรหัสผ่านสู่สาธารณะ | Security Policy / OWASP | User Review Nov 2026 | `Code.gs` | Code Audit & Endpoint Verification | `TESTED` | Deploy Version 5 ขึ้น Production ใน Batch B.2 | Medium | API `doGet` ไม่ส่ง `citizenId`, `password` หรือข้อมูลส่วนบุคคลอ่อนไหวออกสู่สาธารณะ |
| **REQ-PUB-07** | แถบเลื่อนคู่บน-ล่างสำหรับตารางรายชื่อนักเรียน (Dual Scrollbar Synchronization) | Phase 1 UI Enhancement | User Review Aug 2026 | `index.html`, `app.js` | UI Scrollbar Sync Test | `ACCEPTED` | ไม่มี | Low | แถบเลื่อนด้านบนและด้านล่างเลื่อนสัมพันธ์กันอย่างราบรื่น |
| **REQ-PUB-08** | การแสดงผลวันที่ข้อมูลรายงานเป็น พ.ศ. ภาษาไทยบนส่วนหัวของเว็บไซต์ ("ข้อมูล ณ วันที่ ... พ.ศ. ...") | Initial Scope | User Review Aug 2026 | `app.js`, `Code.gs` | Live Web App Display Test | `ACCEPTED` | ไม่มี | Low | แสดงรูปแบบ "ข้อมูล ณ วันที่ DD/MM/YYYY" หรือเดือนภาษาไทยตรงตามที่กำหนด |
| **REQ-PUB-09** | การควบคุมเปิด–ปิดการแสดงผล 12 หัวข้อและเมนูหลัก (Dashboard, Students, Pivot, Filters) | `MISSING_SOURCE` (รายการ 12 หัวข้อไม่มีเอกสารนิยาม) | User Review Aug 2026 (เฉพาะเมนูหลัก) | `index.html`, `app.js` | UI Navigation Toggle Test | `UNVERIFIED` | โค้ดมีปุ่มเปิด-ปิด 4 จุด (`toggleNavStudents`, `toggleNavPivot`, `btnToggleAdvancedSearch`, `btnTogglePiiMask`) แต่รายการชื่อ 12 หัวข้อไม่มีเอกสารต้นฉบับรองรับ | Medium | สลับเปิด-ปิดเมนูหลักได้จริง ส่วนรายการ 12 หัวข้อต้องรอคำชี้แจงจากผู้ใช้ |

---

### หมวดที่ ๒: Admin Workspace & Authentication (ระบบผู้ดูแลระบบ) — รวม ๑๐ ข้อกำหนด

| Req ID | Requirement Description | Source | Approval Evidence | Related Files | Related Test / Evidence | Status | Remaining Work | Risk | Acceptance Criteria |
| :--- | :--- | :--- | :--- | :--- | :--- | :---: | :--- | :---: | :--- |
| **REQ-ADM-01** | เข้าสู่ระบบ Admin ผ่านการตรวจสอบรหัสผ่านด้วย API แบบไดนามิก (`action=adminLogin`) | Commit `7dc7cd6`, `143c592` | PR #1 Directive | `app.js`, `Code.gs` | `test_phase2_sheets.js` Case 13 | `TESTED` | Deploy Version 5 ขึ้น Production | High | ตรวจรหัสผ่านผ่าน API คืน Session Token และไม่เปิดเผยรหัสผ่าน |
| **REQ-ADM-02** | เข้ารหัสรหัสผ่านด้วย Salted PBKDF2-HMAC-SHA256 (600,000 รอบ) บน GAS V8 | Security Hardening (OWASP) | PR #1 Comment #6744937445 | `Code.gs` | RFC 7914 Known Test Vectors (Case 13) | `TESTED` | บันทึก Property ใน Script จริง `10JFFSdKAM...` | High | ตรงตามเวกเตอร์ทดสอบ RFC 7914 100% (หมายเหตุ: เวลาทำงานจริงบน GAS ยังเป็น `UNVERIFIED`) |
| **REQ-ADM-03** | สร้างและตรวจสอบ Ephemeral Signed HMAC Session Token (อายุ 15 นาที) ป้องกันการปลอมแปลง | Security Hardening | PR #1 Approval | `Code.gs`, `app.js` | `test_phase2_sheets.js` Case 13 | `TESTED` | Deploy Version 5 ขึ้น Production | High | ปฏิเสธ Token ปลอมแปลง ลายเซ็นไม่ตรง หรือ Token หมดอายุ (>15 นาที) ด้วย 401 |
| **REQ-ADM-04** | ระบบเพิกถอนเซสชันทันทีเมื่อ Admin Logout ผ่าน `TOKEN_EPOCH` bump | Security Hardening | PR #1 Approval | `Code.gs`, `app.js` | `test_phase2_sheets.js` Case 13 | `TESTED` | Deploy Version 5 ขึ้น Production | Medium | Token เดิมใช้งานไม่ได้ทันทีเมื่อ Logout และค่า Epoch ถูกเพิ่มขึ้น |
| **REQ-ADM-05** | บังคับตรวจ Session Token ในทุกคำสั่งเขียน (`createStudent`, `updateStudent`, `deleteStudent`, `saveAppConfig`) | Security Hardening | PR #1 Approval | `Code.gs`, `app.js` | `test_phase2_sheets.js` Case 13 | `TESTED` | Deploy Version 5 ขึ้น Production | High | ปฏิเสธคำสั่งเขียนทุกชนิดที่ไม่มี Token หรือ Token ไม่ถูกต้อง ด้วยข้อผิดพลาด UNAUTHORIZED |
| **REQ-ADM-06** | สวิตช์นิรภัย `ENABLE_WRITES` ปฏิเสธการเขียนข้อมูลแบบ Fail-Closed เมื่อค่าไม่ใช่ `'true'` | Security Hardening | PR #1 Approval | `Code.gs` | `test_phase2_sheets.js` Case 13 | `TESTED` | ตั้ง `ENABLE_WRITES=false` ระหว่าง Cutover | High | ปฏิเสธการแก้ไขข้อมูลในชีตด้วย WRITES_DISABLED เมื่อปิดสวิตช์ |
| **REQ-ADM-07** | แผงควบคุมตั้งค่าระบบ (เลือกชีต, วันที่รายงาน, ลำดับคอลัมน์, สลับเปิด/ปิดเมนู) | Commit `37a0946` | User Review Aug 2026 | `index.html`, `app.js`, `Code.gs` | UI Settings Form Test | `TESTED` | เชื่อมต่อผ่าน Token ใหม่หลัง Deploy Version 5 | Medium | บันทึกการตั้งค่าระบบลง Script Properties สำเร็จโดยผู้ดูแลระบบที่ล็อกอิน |
| **REQ-ADM-08** | เพิ่ม แก้ไข และลบข้อมูลนักเรียนผ่านฟอร์ม Modal พร้อมการตรวจสอบความถูกต้อง | Initial Scope | User Review Aug 2026 | `index.html`, `app.js`, `Code.gs` | `test_phase2_sheets.js` Cases 4-8, 11 | `TESTED` | ทดสอบหลังเปิด `ENABLE_WRITES=true` | High | ข้อมูลใน Google Sheets เปลี่ยนแปลงถูกต้อง ไม่เขียนทับผิดแถว รักษาสูตร |
| **REQ-ADM-09** | ฟังก์ชันตั้งค่ารหัสผ่าน Admin เริ่มต้นโดยเจ้าของสคริปต์ (`setupAdminPassword`) ผ่าน Script Properties | Security Hardening | PR #1 Comment #6744937445 | `Code.gs` | `test_phase2_sheets.js` Case 13 | `TESTED` | สร้าง Hash/Salt ภายนอกด้วย CSPRNG ก่อนบันทึก | High | เจ้าของสคริปต์สามารถสร้าง PBKDF2 hash บันทึกเป็น Property ได้โดยตรง (แนะนำใช้ CSPRNG ภายนอก) |
| **REQ-ADM-10** | การกำหนดและบันทึกวันที่ข้อมูลรายงาน (Report Date Configuration) ผ่าน Admin Settings ไปยัง Script Properties | System Config Scope | User Review Aug 2026 | `app.js`, `Code.gs` | UI Settings Save Test | `TESTED` | ตรวจสอบร่วมกับ Version 5 | Medium | วันที่รายงานถูกบันทึกและแสดงผลตรงกันทั้งหน้าบ้านและระบบหลังบ้าน |

---

### หมวดที่ ๓: Security & Data Protection (ความมั่นคงปลอดภัยและ PDPA) — รวม ๙ ข้อกำหนด

| Req ID | Requirement Description | Source | Approval Evidence | Related Files | Related Test / Evidence | Status | Remaining Work | Risk | Acceptance Criteria |
| :--- | :--- | :--- | :--- | :--- | :--- | :---: | :--- | :---: | :--- |
| **REQ-SEC-01** | ยกเลิกการอ่านรหัสผ่าน Admin จากเซลล์ `security!B1` ใน Google Sheets อย่างเด็ดขาด | Security Hardening | User Directive Nov 2026 | `Code.gs` | Source Code Audit / Case 13 | `TESTED` | Deploy Version 5 ขึ้น Production | High | ไม่มีโค้ดเปิดสเปรดชีตอ่านเซลล์ `security!B1` หรือเก็บรหัสผ่าน Plaintext ในชีต |
| **REQ-SEC-02** | ป้องกัน Timing Attacks ด้วยฟังก์ชันเปรียบเทียบข้อความแบบ Constant-time (`constantTimeEquals`) | Security Hardening | PR #1 Approval | `Code.gs` | `test_phase2_sheets.js` Case 13 | `TESTED` | Deploy Version 5 ขึ้น Production | Medium | การตรวจสอบรหัสผ่านใช้เวลาคงที่ ไม่รั่วไหลข้อมูลผ่านเวลาประมวลผล |
| **REQ-SEC-03** | รองรับการแปลง UTF-8 แบบ pure-JS บน GAS V8 โดยไม่พึ่งพา `TextEncoder` ที่ไม่มีในระบบ | Bugfix Nov 9, 2026 | PR #1 Comment #6744937445 | `Code.gs` | `test_phase2_sheets.js` Case 13.2 | `TESTED` | Deploy Version 5 ขึ้น Production | High | แปลงภาษาไทยและอักขระพิเศษได้ 100% ไม่เกิด ReferenceError บน GAS V8 |
| **REQ-SEC-04** | ซ่อนเลขประจำตัวประชาชน (PII Masking) เป็นค่าเริ่มต้นในทุกตาราง โมดอล และการแจ้งเตือน | Commit `e5df2e0` | PR #1 Approval | `set-importer.js`, `app.js` | `test_set_importer.js` Test 19 | `TESTED` | Merge PR #1 ขึ้น Production | High | แสดงผลเป็น `x-xxxx-xxxxx-xx-x` เสมอ มีปุ่มเปิดดูชั่วคราวเฉพาะ Admin |
| **REQ-SEC-05** | ป้องกัน XSS และ HTML Injection ในการแสดงผลข้อมูลที่นำเข้าจาก Excel (`escapeHtml`) | Commit `8f084ec` | PR #1 Review | `set-importer.js`, `app.js` | `test_set_importer.js` Test 11 | `TESTED` | Merge PR #1 ขึ้น Production | High | Escape HTML entities อักขระพิเศษ (`& < > " '`) ทั้งหมดก่อนแทรกลง DOM |
| **REQ-SEC-06** | ลบสคริปต์สำรองข้อมูลและโค้ด Fallback ที่เปิดเผย Spreadsheet ID โดยพลการ | Security Hardening | PR #1 Approval | `Code.gs` | `test_phase2_sheets.js` Case 12 | `TESTED` | Deploy Version 5 ขึ้น Production | High | บล็อกการทำงานทันที (Fail-Closed) หากไม่มี `APP_SPREADSHEET_ID` ใน Script Properties |
| **REQ-SEC-07** | ปิดและลบเส้นทางทดสอบ HTTP ที่ไม่ยืนยันตัวตน (`action=stagingInitAndTest`) | Security Hardening | User Directive Nov 10, 2026 | `Code.gs` | Code Audit PR #1 & Prod V4 Backup | `TESTED` | ตรวจสอบซ้ำหลังขึ้น Version 5 | High | ตรวจสอบยืนยันว่าไม่มี Endpoint นี้ทั้งใน PR #1 และใน Production Version 4 |
| **REQ-SEC-08** | นโยบาย Zero-PII ในการบันทึก Logs, Git Commits, PR Reports และเอกสารโครงการ | Global Security Rule | User Global Rule | All Files | Automated Log & Repo Audit | `TESTED` | กำกับดูแลตลอดอายุโครงการและตรวจรับอย่างเป็นทางการใน Live UAT | High | ไม่มีเลขบัตร 13 หลัก รหัสผ่าน หรือโทเคนจริงปรากฏใน Repo หรือ Logs |
| **REQ-SEC-09** | การจำกัดการเดารหัสผ่าน (Brute-force Protection / Rate Limiting) | Security Policy / OWASP | User Risk Acceptance (11 พ.ย. 2569) | `Code.gs` | Formal User Directive | `ACCEPTED` | ไม่มี (ผู้ใช้ให้คำตัดสินยอมรับความเสี่ยงอย่างเป็นทางการ) | High | ผ่านการยอมรับความเสี่ยง (User Risk Acceptance) อย่างเป็นทางการจากผู้ใช้ ("ยอมรับความเสี่ยงนี้" 11 พ.ย. 2569) |

---

### หมวดที่ ๔: SET Import & Admin Preview (การนำเข้าและตรวจสอบข้อมูล SET) — รวม ๑๙ ข้อกำหนด

| Req ID | Requirement Description | Source | Approval Evidence | Related Files | Related Test / Evidence | Status | Remaining Work | Risk | Acceptance Criteria |
| :--- | :--- | :--- | :--- | :--- | :--- | :---: | :--- | :---: | :--- |
| **REQ-SET-01** | อ่านและวิเคราะห์ไฟล์ Excel `.xls` ที่เป็นโครงสร้าง HTML Table จากระบบ SET จริงผ่าน SheetJS 0.20.3 | PR #1 Directive | User UAT #6771410442 | `set-importer.js` | `test_set_importer.js` Test 27 | `TESTED` | Merge PR #1 ขึ้น Production | Medium | SheetJS อ่านโครงสร้าง HTML table ภายในไฟล์ `.xls` ได้ครบถ้วนทุกแถว |
| **REQ-SET-02** | ตรวจจับแถวหัวตารางอัตโนมัติ (Header Row Auto-detection) ข้ามแบนเนอร์ส่วนหัวหลายแถว | Commit `84d7ef6` | PR #1 Approval | `set-importer.js` | `test_set_importer.js` Test 20 | `TESTED` | Merge PR #1 ขึ้น Production | Medium | ระบุแถวหัวตารางได้ถูกต้องทุกกรณี (ทดสอบครอบคลุมแถวที่ 0, 1, 3, 5) |
| **REQ-SET-03** | รองรับ Alias `"เลข 13 หลัก"` สำหรับ Citizen ID โดยรักษาการแยกกับ Student ID เด็ดขาด | PR #1 Directive Nov 10 | User Directive Nov 10 | `set-importer.js` | `test_set_importer.js` Tests 16, 25 | `TESTED` | Merge PR #1 ขึ้น Production | High | ตรวจจับ `"เลข 13 หลัก"` เป็น Citizen ID และไม่นำไปปนกับ Student ID |
| **REQ-SET-04** | คงเลขศูนย์นำหน้า (Leading Zero) ของรหัสนักเรียนและเลขประจำตัวประชาชน | PR #1 Core Req | PR #1 Approval | `set-importer.js` | `test_set_importer.js` Tests 1, 27 | `TESTED` | Merge PR #1 ขึ้น Production | High | รหัสเช่น `069001` หรือเลขบัตรที่ขึ้นต้นด้วย `0` ไม่ถูกตัดเหลือตัวเลขสั้น |
| **REQ-SET-05** | รวมข้อมูล ๓ รายงาน (ทั่วไป 8 คอลัมน์, ที่อยู่ 6 คอลัมน์, น้ำหนัก-ส่วนสูง 10 คอลัมน์) ผ่านการจับคู่กุญแจ | PR #1 Core Req | User UAT #6771410442 | `set-importer.js` | `test_set_importer.js` Tests 26, 27 | `TESTED` | Merge PR #1 ขึ้น Production | High | รวมข้อมูล 3 ไฟล์ได้ 259 รายการไม่ซ้ำ และจับคู่ข้อมูลครบถ้วน |
| **REQ-SET-06** | จัดหมวดหมู่ผลลัพธ์การเปรียบเทียบ ๖ กลุ่ม (`new`, `updated`, `matched`, `sheets_only`, `unmatched`, `invalid`) | PR #1 Core Req | User UAT #6771410442 | `set-importer.js`, `app.js` | `test_set_importer.js` Tests 6-10 | `TESTED` | Merge PR #1 ขึ้น Production | Medium | แสดงการ์ดสรุป 6 กลุ่มและจำแนกข้อมูลตามเงื่อนไขอย่างถูกต้อง |
| **REQ-SET-07** | แยกความเชื่อมั่น: `Verified Match` (รหัสตรงกัน) vs `Predicted Match` (ชื่อ+วันเกิดตรงกัน) | PR #1 Core Req | PR #1 Approval | `set-importer.js`, `app.js` | `test_set_importer.js` Test 7 | `TESTED` | Merge PR #1 ขึ้น Production | Medium | แสดงป้ายกำกับสถานะและความน่าเชื่อถือต่างกันอย่างชัดเจนบน UI |
| **REQ-SET-08** | ป้องกันการชนกันของข้อมูล (Collision): ชื่อ-วันเกิดซ้ำในชีต, ซ้ำใน SET, หรือวันเกิดขัดแย้ง | Commit `a3285a8` | PR #1 Approval | `set-importer.js` | `test_set_importer.js` Tests 8-10, 17 | `TESTED` | Merge PR #1 ขึ้น Production | High | ปฏิเสธการจับคู่อัตโนมัติเมื่อพบความขัดแย้งและจัดเป็น `unmatched` |
| **REQ-SET-09** | ปฏิเสธความสัมพันธ์ขัดแย้งในตารางเชื่อมโยงแบบสองทิศทาง (Bidirectional Link Table Conflict Rejection) | Commit `a3285a8` | PR #1 Approval | `set-importer.js` | `test_set_importer.js` Test 18 | `TESTED` | Merge PR #1 ขึ้น Production | High | ล้างความสัมพันธ์ที่ขัดแย้งออกจากผลลัพธ์ทั้งสองทิศทางเพื่อป้องกันข้อมูลไขว้ |
| **REQ-SET-10** | แยกประเภทความพิการ ๓ แหล่งอิสระ (SET vs บัตรคนพิการ vs แบบคัดกรอง) ไม่ตีเป็นข้อมูลขัดแย้ง | Commit `8f084ec` | PR #1 Review | `set-importer.js`, `app.js` | `test_set_importer.js` Test 14 | `TESTED` | Merge PR #1 ขึ้น Production | Medium | แสดงข้อมูลแยกเป็น 3 คอลัมน์อิสระ ไม่แจ้งเตือนว่าเป็นข้อผิดพลาด |
| **REQ-SET-11** | หน้าต่างเปรียบเทียบข้อมูลแบบเคียงข้าง (Side-by-Side Diff Modal) แสดงความแตกต่างชัดเจน | PR #1 Core Req | PR #1 Approval | `index.html`, `app.js` | UI Diff Modal Inspection | `TESTED` | Merge PR #1 ขึ้น Production | Low | แสดงข้อมูล SET เทียบกับ Google Sheets พร้อมไฮไลต์จุดที่แตกต่าง |
| **REQ-SET-12** | ชี้แจงข้อความกลุ่ม `sheets_only` เป็น "รอตรวจสอบ" ไม่ใช่ "(ซ่อน)" ใน Phase 1 Preview | Review Comment Nov 10 | Commit `c39569c` | `index.html` | Review Verification on Preview | `TESTED` | Merge PR #1 ขึ้น Production | Low | ข้อความระบุชัดเจนว่ายังไม่มีการซ่อนหรือลบข้อมูลบนเว็บไซต์จริง |
| **REQ-SET-13** | ประมวลผลในหน่วยความจำ 100% (In-Memory Preview) ไม่ส่งคำสั่งเขียนข้อมูลกลับ Google Sheets | Safety Policy | PR #1 Review | `set-importer.js`, `app.js` | Network Traffic Audit | `TESTED` | Merge PR #1 ขึ้น Production | High | จำนวนการเรียก Write API (`doPost`) ระหว่างการพรีวิวต้องเป็นศูนย์ (0 calls) |
| **REQ-SET-14** | ปุ่มโหลดชุดข้อมูลจำลอง (Mock Data) สำหรับทดสอบระบบโดยไม่ใช้ข้อมูลส่วนบุคคลจริง | Testing Requirement | PR #1 Approval | `set-importer.js`, `app.js` | UI Mock Data Test | `TESTED` | Merge PR #1 ขึ้น Production | Low | โหลดชุดข้อมูลจำลองแสดงผลลัพธ์ครบ 6 กลุ่มสำหรับการทดสอบและสาธิต |
| **REQ-SET-15** | กฎจัดการข้อมูลที่ไม่ทับซ้อน (Non-overlapping Records Rule): คงสถานะนักเรียน SET-only (13 ราย) และ Sheets-only (13 ราย) รอให้ Admin ตรวจสอบรายบุคคล ห้ามเพิ่ม ลบ หรือซ่อนอัตโนมัติใน Phase 1 | PR #1 Comment #6771410442 | User Directive Nov 10 | `set-importer.js`, `app.js` | UAT Checkpoint Nov 10 | `TESTED` | ยืนยันบน Production UAT | High | แสดงในกลุ่มรอตรวจสอบ ห้ามแก้ไขชีตหรือซ่อนการแสดงผลบนหน้าบ้านอัตโนมัติ |
| **REQ-SET-16** | การตรวจสอบเลขประจำตัวประชาชนตามหลักการ Modulo 11 Checksum และรองรับรหัส G-Code (`isValidCitizenId`) | PR #1 Security Req | PR #1 Approval | `set-importer.js` | `test_set_importer.js` Test 1 | `TESTED` | Merge PR #1 ขึ้น Production | High | ตรวจความถูกต้องของเลข 13 หลักด้วย Modulo 11 และยอมรับรูปแบบ G-Code สำหรับนักเรียนไร้สัญชาติ |
| **REQ-SET-17** | การแปลงรูปแบบวันที่นำเข้าจากไฟล์ SET (Serial, DD/MM/YYYY, YYYY-MM-DD, ชื่อเดือนไทย, แปลง ค.ศ. เป็น พ.ศ.) และคำนวณอายุสัมพัทธ์ (`parseDateBE`, `calculateAgeExact`) | PR #1 Engine Req | PR #1 Approval | `set-importer.js` | `test_set_importer.js` Tests 3, 4 | `TESTED` | Merge PR #1 ขึ้น Production | Medium | แปลงวันที่ทุกรูปแบบจาก Excel ให้เป็น พ.ศ. มาตรฐาน และคำนวณอายุ (ปี/เดือน) ตรงกับวันรายงาน |
| **REQ-SET-18** | การตรวจสอบรหัสนักเรียน SET และการคงเลขศูนย์นำหน้า (`cleanStudentId`) | PR #1 Engine Req | PR #1 Approval | `set-importer.js` | `test_set_importer.js` Tests 1, 21 | `TESTED` | Merge PR #1 ขึ้น Production | High | ตัดช่องว่าง คงค่าสตริง และคงเลขศูนย์นำหน้าของรหัสนักเรียนไว้อย่างสมบูรณ์ |
| **REQ-SET-19** | รองรับกระบวนการนำเข้าทั้งแบบ ๒ รายงาน (ทั่วไป + ที่อยู่) และ ๓ รายงาน (ทั่วไป + ที่อยู่ + ลิงก์) อย่างยืดหยุ่นผ่าน `canEnablePreview` | PR #1 Feature Req | PR #1 Approval | `set-importer.js` | `test_set_importer.js` Test 12 | `TESTED` | Merge PR #1 ขึ้น Production | Medium | เปิดให้กดปุ่มแสดงตัวอย่างได้เมื่อมีข้อมูลครบถ้วนตามเงื่อนไขของชุดไฟล์ที่เลือก |

---

### หมวดที่ ๕: Google Sheets Compatibility & Backend Engine — รวม ๙ ข้อกำหนด

| Req ID | Requirement Description | Source | Approval Evidence | Related Files | Related Test / Evidence | Status | Remaining Work | Risk | Acceptance Criteria |
| :--- | :--- | :--- | :--- | :--- | :--- | :---: | :--- | :---: | :--- |
| **REQ-SHT-01** | ตรวจจับและรองรับผังชีตเดิม 16 คอลัมน์ (`A–P`) โดยไม่เกิด Out-of-bounds Exception | Commit `259347d` | PR #1 Approval | `Code.gs` | `test_phase2_sheets.js` Case 1 | `TESTED` | Deploy Version 5 ขึ้น Production | High | อ่านและจัดการชีต 16 คอลัมน์เดิมได้สมบูรณ์ ไม่เกิด Index out of bounds |
| **REQ-SHT-02** | ตรวจจับและรองรับผังชีตใหม่ 17 คอลัมน์ (`A–Q` มีรหัสนักเรียน SET ในคอลัมน์ A) | Commit `86c3e30` | PR #1 Approval | `Code.gs` | `test_phase2_sheets.js` Case 2 | `TESTED` | Deploy Version 5 ขึ้น Production | High | อ่านและบันทึกรหัสนักเรียนใน Col A ได้อย่างถูกต้องเมื่อชีตมี 17 คอลัมน์ |
| **REQ-SHT-03** | ตรวจจับหัวตารางและแถวเริ่มต้นข้อมูลอัตโนมัติ (Header & DataStartRow Auto-detection) ข้ามแบนเนอร์ชื่อรายงาน | Commit `259347d` | PR #1 Approval | `Code.gs` | `test_phase2_sheets.js` Case 3 | `TESTED` | Deploy Version 5 ขึ้น Production | Medium | เริ่มอ่านข้อมูลที่แถว 3 หรือแถวถัดจากหัวตารางโดยอัตโนมัติ |
| **REQ-SHT-04** | ตรวจจับหัวตารางย่อยจริง ไม่สับสนกับห้องเรียนที่มีคำว่า "หน่วยบริการ" | Commit `259347d` | PR #1 Approval | `Code.gs` | `test_phase2_sheets.js` Case 9 | `TESTED` | Deploy Version 5 ขึ้น Production | Medium | ไม่เลื่อนแถวเริ่มต้นข้อมูลผิดพลาดเมื่อห้องเรียนมีคำว่าหน่วยบริการ |
| **REQ-SHT-05** | รักษาสูตรคำนวณอายุและปรับเลขอ้างอิงแถวอัตโนมัติเมื่อเพิ่มนักเรียนใหม่ (`createStudent`) | Commit `259347d` | PR #1 Approval | `Code.gs` | `test_phase2_sheets.js` Cases 7, 8 | `TESTED` | Deploy Version 5 ขึ้น Production | High | ปรับเลขอ้างอิงแถวในสูตรอัตโนมัติ (เช่น `=DATEDIF(M5,...)` -> `M6`) เมื่อแทรกแถว |
| **REQ-SHT-06** | กลไกค้นหาแถวตามตัวตน (`findTargetStudentRow`) ป้องกันการแก้ไข/ลบผิดคนเมื่อพบชื่อ-สกุลซ้ำ | Commit `259347d` | PR #1 Approval | `Code.gs` | `test_phase2_sheets.js` Cases 5, 6, 11 | `TESTED` | Deploy Version 5 ขึ้น Production | High | ใช้รหัสนักเรียนจำแนกชื่อซ้ำ หรือปฏิเสธการแก้ไขหากระบุตัวตนไม่ชัดเจน |
| **REQ-SHT-07** | ป้องกันการเขียนทับรหัสนักเรียนเดิมในชีตด้วยค่าว่างโดยไม่เจตนาใน `updateStudent` | Commit `259347d` | PR #1 Approval | `Code.gs` | `test_phase2_sheets.js` Case 4 | `TESTED` | Deploy Version 5 ขึ้น Production | High | รักษารหัสนักเรียนเดิมใน Col A ไว้เสมอหากผู้ใช้ไม่ได้ส่งรหัสใหม่มาแทนที่ |
| **REQ-SHT-08** | ปฏิเสธผังคอลัมน์ที่ไม่รู้จัก (`UNKNOWN`) ทันที เพื่อป้องกันข้อมูลเลื่อนคอลัมน์ | Commit `259347d` | PR #1 Approval | `Code.gs` | `test_phase2_sheets.js` Case 10 | `TESTED` | Deploy Version 5 ขึ้น Production | High | Throw Error ปฏิเสธการอ่าน/เขียนชีตที่มีโครงสร้างคอลัมน์ผิดมาตรฐาน |
| **REQ-SHT-09** | มาตรการสำรองข้อมูลชีตก่อนการปรับเปลี่ยนโครงสร้างหรือก่อนการ Cutover (แท็บสำรอง 'พย69 ก่อนใส่รหัส+ซ่อมชื่อ') | Operational Safety Rule | PR #1 Handoff Plan | Google Sheets UI | Tab Inspection (id: 663126415) | `ACCEPTED` | ดำเนินการสำรองข้อมูลเรียบร้อยแล้วบนชีตจริง | High | มีแท็บสำรองข้อมูลที่แยกต่างหาก ตรวจสอบความถูกต้องและขออนุมัติก่อนกู้คืน |

---

### หมวดที่ ๖: Phase 2 Data Mutation & Synchronization (แผนงานระยะถัดไป) — รวม ๖ ข้อกำหนด

| Req ID | Requirement Description | Source | Approval Evidence | Related Files | Related Test / Evidence | Status | Remaining Work | Risk | Acceptance Criteria |
| :--- | :--- | :--- | :--- | :--- | :--- | :---: | :--- | :---: | :--- |
| **REQ-MUT-01** | แผงตรวจสอบตัวตนนักเรียน ๒๖ รายการ (13 ใหม่ใน SET, 13 มีเฉพาะบนเว็บ) รายบุคคล | PR #1 Directive | User Directive Nov 10, 2026 | Backlog Phase 2 | ยังไม่เริ่มพัฒนา | `NOT_STARTED` | ออกแบบและสร้าง UI ตรวจสอบตัวบุคคล | High | ผู้ดูแลระบบสามารถตรวจสอบและยืนยันตัวตนทีละคนก่อนส่งคำสั่งเขียน |
| **REQ-MUT-02** | ระบบเลือกฟิลด์ข้อมูลที่ต้องการปรับปรุงลงชีตจริง (Selective Field Sync) | AGT Technical Proposal | `MISSING_SOURCE` (ข้อเสนอทางเทคนิคของ AGT รอการตัดสินใจ APPROVED/DEFERRED/REJECTED) | Backlog Phase 2 | ยังไม่เริ่มพัฒนา | `NOT_STARTED` | นำเสนอผู้ใช้เพื่อขอคำตัดสิน APPROVED / DEFERRED / REJECTED ใน Phase 2 Planning | High | [เกณฑ์ตรวจรับเชิงฟังก์ชัน] อัปเดตเฉพาะฟิลด์ที่ได้รับอนุมัติ ไม่เขียนทับฟิลด์อื่น (เงื่อนไขก่อนพัฒนา: ต้องได้รับคำตัดสิน APPROVED จากผู้ใช้) |
| **REQ-MUT-03** | ระบบนำเข้านักเรียนใหม่จาก SET เข้า Google Sheets จริงพร้อมตรวจสอบความถูกต้อง (Batch Insert) | AGT Technical Proposal | `MISSING_SOURCE` (ข้อเสนอทางเทคนิคของ AGT รอการตัดสินใจ APPROVED/DEFERRED/REJECTED) | Backlog Phase 2 | ยังไม่เริ่มพัฒนา | `NOT_STARTED` | นำเสนอผู้ใช้เพื่อขอคำตัดสิน APPROVED / DEFERRED / REJECTED ใน Phase 2 Planning | High | [เกณฑ์ตรวจรับเชิงฟังก์ชัน] เพิ่มแถวใหม่สมบูรณ์พร้อมสูตรคำนวณอายุ โดยไม่ทำให้ข้อมูลเดิมเสียหาย (เงื่อนไขก่อนพัฒนา: ต้องได้รับคำตัดสิน APPROVED จากผู้ใช้) |
| **REQ-MUT-04** | ระบบจัดการสถานะนักเรียนที่มีเฉพาะในชีต (ย้ายออก, สำเร็จการศึกษา, พักการเรียน) โดยไม่ลบประวัติ | AGT Technical Proposal | `MISSING_SOURCE` (ข้อเสนอทางเทคนิคของ AGT รอการตัดสินใจ APPROVED/DEFERRED/REJECTED) | Backlog Phase 2 | ยังไม่เริ่มพัฒนา | `NOT_STARTED` | นำเสนอผู้ใช้เพื่อขอคำตัดสิน APPROVED / DEFERRED / REJECTED ใน Phase 2 Planning | Medium | [เกณฑ์ตรวจรับเชิงฟังก์ชัน] ไม่ลบประวัตินักเรียน มี Audit Trail บันทึกสถานะชัดเจน (เงื่อนไขก่อนพัฒนา: ต้องได้รับคำตัดสิน APPROVED จากผู้ใช้) |
| **REQ-MUT-05** | ระบบสำรองข้อมูลชีตอัตโนมัติ (Automated Pre-Sync Snapshot) ก่อนการเขียนข้อมูลก้อนใหญ่ | AGT Technical Proposal | `MISSING_SOURCE` (ข้อเสนอทางเทคนิคของ AGT รอการตัดสินใจ APPROVED/DEFERRED/REJECTED) | Backlog Phase 2 | ยังไม่เริ่มพัฒนา | `NOT_STARTED` | นำเสนอผู้ใช้เพื่อขอคำตัดสิน APPROVED / DEFERRED / REJECTED ใน Phase 2 Planning | High | [เกณฑ์ตรวจรับเชิงฟังก์ชัน] มีแท็บ Backup เกิดขึ้นอัตโนมัติก่อนการแก้ไขข้อมูลแบบกลุ่ม (เงื่อนไขก่อนพัฒนา: ต้องได้รับคำตัดสิน APPROVED จากผู้ใช้) |
| **REQ-MUT-06** | บันทึกประวัติการนำเข้าและแก้ไขข้อมูล (Audit Trail / Activity Log) สำหรับผู้ดูแลระบบ | AGT Technical Proposal | `MISSING_SOURCE` (ข้อเสนอทางเทคนิคของ AGT รอการตัดสินใจ APPROVED/DEFERRED/REJECTED) | Backlog Phase 2 | ยังไม่เริ่มพัฒนา | `NOT_STARTED` | นำเสนอผู้ใช้เพื่อขอคำตัดสิน APPROVED / DEFERRED / REJECTED ใน Phase 2 Planning | Medium | [เกณฑ์ตรวจรับเชิงฟังก์ชัน] ตรวจสอบย้อนหลังได้ว่าใครแก้ไขอะไรเมื่อใดผ่านหน้าจอ Admin (เงื่อนไขก่อนพัฒนา: ต้องได้รับคำตัดสิน APPROVED จากผู้ใช้) |

---

## ๓. สรุปภาพรวมและสัดส่วนสถานะข้อกำหนด (Requirements Status Summary)

```
======================================================================
                 REQUIREMENTS STATUS AUDIT REPORT (REV 4)
======================================================================
ยอดรวมข้อกำหนดทั้งหมด (Total Requirements):          62 ข้อ (100.0%)

จำแนกตามสถานะเชิงประจักษ์:
- ACCEPTED:      9 ข้อ  ( 14.5%)  [บน Live Production 7 ข้อ + REQ-SEC-09 User Risk Acceptance + REQ-SHT-09 Backup Completed]
- TESTED:       46 ข้อ  ( 74.2%)  [ผ่าน Unit/Regression/UAT ใน PR #1 พร้อม Cutover]
- NOT_STARTED:   6 ข้อ  (  9.7%)  [Phase 2 REQ-MUT-01..06]
- UNVERIFIED:    1 ข้อ  (  1.6%)  [REQ-PUB-09: 12 display sections (MISSING_SOURCE)]
- IMPLEMENTED:   0 ข้อ  (  0.0%)
- IN_PROGRESS:   0 ข้อ  (  0.0%)
- BLOCKED:       0 ข้อ  (  0.0%)
----------------------------------------------------------------------
จำแนกตามหมวดหมู่:
1. หมวด Public Viewer:                           9 ข้อ
2. หมวด Admin Workspace & Authentication:       10 ข้อ
3. หมวด Security & Data Protection:              9 ข้อ
4. หมวด SET Import & Admin Preview:             19 ข้อ
5. หมวด Google Sheets Compatibility:             9 ข้อ
6. หมวด Phase 2 Data Mutation:                   6 ข้อ
======================================================================
```

*(หมายเหตุสำคัญ: การตรวจรับขั้นสุดท้ายของ Phase 1 [Milestone M6] กำหนดให้ข้อกำหนดที่ผ่านการทดสอบ 46 ข้อ และ REQ-SHT-09 เมื่อทำ Backup แล้ว ได้รับการประเมินเป็น ACCEPTED ส่วนข้อกำหนด REQ-SEC-09 ผ่าน Open Security Gate แล้วด้วยคำตัดสิน User Risk Acceptance จากผู้ใช้เป็นลายลักษณ์อักษร (๑๑ พ.ย. ๒๕๖๙) และข้อเสนอใน Phase 2 [REQ-MUT-02..06] ต้องได้รับการตัดสินใจสถานะ APPROVED, DEFERRED หรือ REJECTED ก่อนการปิดโครงการ)*
