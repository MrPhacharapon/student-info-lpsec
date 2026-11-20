// scratch/update_app_password_toggle.js
const fs = require('fs');

const path = 'app.js';
let content = fs.readFileSync(path, 'utf8');
const isCRLF = content.includes('\r\n');
content = content.replace(/\r\n/g, '\n');

const targetSwal = `        Swal.fire({
          title: 'เข้าสู่แผงควบคุมระบบ (Admin)',
          text: 'กรุณากรอกรหัสผ่านเพื่อเข้าใช้งานตั้งค่าระบบ',
          input: 'password',
          inputValue: '',
          inputAttributes: {
            autocomplete: 'new-password',
            autocorrect: 'off',
            autocapitalize: 'off',
            spellcheck: 'false'
          },
          didOpen: () => {
            const input = Swal.getInput();
            if (input) {
              input.value = '';
              input.setAttribute('autocomplete', 'new-password');
              input.setAttribute('readonly', 'readonly');
              setTimeout(() => {
                input.removeAttribute('readonly');
                input.value = '';
                input.focus();
              }, 60);
            }
          },
          inputPlaceholder: 'กรอกรหัสผ่านผู้ดูแลระบบ...',
          showCancelButton: true,
          confirmButtonText: 'เข้าสู่ระบบ',
          cancelButtonText: 'ยกเลิก',
          confirmButtonColor: '#2E7D32',
          inputValidator: (value) => {
            return new Promise((resolve) => {
              if (!value) {
                resolve('กรุณากรอกรหัสผ่าน!');
                return;
              }
              
              // Verify password dynamically via API
              Swal.showLoading();
              fetch(CONFIG.API_URL, {
                method: 'POST',
                body: JSON.stringify({
                  action: 'verifyAdminPassword',
                  payload: { password: value }
                })
              })
              .then(res => res.json())
              .then(data => {
                if (data.status === 'success' && data.data && data.data.valid) {
                  state.adminToken = data.data.token || null;
                  if (typeof sessionStorage !== 'undefined' && data.data.token) {
                    sessionStorage.setItem('ADMIN_SESSION_TOKEN', data.data.token);
                  }
                  renderStudentTable();
                  resolve(); // Password is correct
                } else {
                  resolve((data && data.message) ? data.message : 'รหัสผ่านไม่ถูกต้อง!'); // Incorrect
                }
              })
              .catch(err => {
                console.error(err);
                resolve('เชื่อมต่อฐานข้อมูลล้มเหลว กรุณาลองใหม่');
              });
            });
          }
        })`;

const eyeClosedSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><line x1="2" x2="22" y1="2" y2="22"/></svg>';
const eyeOpenSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1 19.876 0"/><circle cx="12" cy="12" r="3"/></svg>';

const newSwal = `        Swal.fire({
          title: 'เข้าสู่แผงควบคุมระบบ (Admin)',
          html: \`
            <p class="text-sm text-gray-600 mb-3 font-normal">กรุณากรอกรหัสผ่านเพื่อเข้าใช้งานตั้งค่าระบบ</p>
            <div class="relative w-full max-w-sm mx-auto">
              <input type="password" id="adminPasswordInput" class="swal2-input !m-0 !w-full pr-11 text-center tracking-wider text-base" placeholder="กรอกรหัสผ่านผู้ดูแลระบบ..." autocomplete="new-password">
              <button type="button" id="btnToggleAdminPassword" class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 focus:outline-none p-1.5 cursor-pointer rounded-full hover:bg-gray-100 transition-colors" title="แสดง/ซ่อนรหัสผ่าน">
                ${eyeClosedSvg}
              </button>
            </div>
          \`,
          showCancelButton: true,
          confirmButtonText: 'เข้าสู่ระบบ',
          cancelButtonText: 'ยกเลิก',
          confirmButtonColor: '#2E7D32',
          focusConfirm: false,
          didOpen: () => {
            const input = document.getElementById('adminPasswordInput');
            const toggleBtn = document.getElementById('btnToggleAdminPassword');
            const eyeOpen = '${eyeOpenSvg}';
            const eyeClosed = '${eyeClosedSvg}';

            if (input) {
              input.value = '';
              input.focus();
              input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  Swal.clickConfirm();
                }
              });
            }

            if (toggleBtn && input) {
              toggleBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const isPassword = input.type === 'password';
                input.type = isPassword ? 'text' : 'password';
                toggleBtn.innerHTML = isPassword ? eyeOpen : eyeClosed;
                toggleBtn.classList.toggle('text-emerald-600', isPassword);
                toggleBtn.classList.toggle('text-gray-400', !isPassword);
                input.focus();
              });
            }
          },
          preConfirm: () => {
            const input = document.getElementById('adminPasswordInput');
            const value = input ? input.value.trim() : '';
            if (!value) {
              Swal.showValidationMessage('กรุณากรอกรหัสผ่าน!');
              return false;
            }

            return fetch(CONFIG.API_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'verifyAdminPassword',
                payload: { password: value }
              })
            })
            .then(res => {
              if (!res.ok) {
                return res.json().then(errData => {
                  throw new Error((errData && errData.message) ? errData.message : 'รหัสผ่านไม่ถูกต้อง!');
                });
              }
              return res.json();
            })
            .then(data => {
              if (data.status === 'success' && data.data && data.data.valid) {
                state.adminToken = data.data.token || null;
                if (typeof sessionStorage !== 'undefined' && data.data.token) {
                  sessionStorage.setItem('ADMIN_SESSION_TOKEN', data.data.token);
                }
                renderStudentTable();
                return true;
              } else {
                throw new Error((data && data.message) ? data.message : 'รหัสผ่านไม่ถูกต้อง!');
              }
            })
            .catch(err => {
              Swal.showValidationMessage(err.message || 'เชื่อมต่อฐานข้อมูลล้มเหลว กรุณาลองใหม่');
              return false;
            });
          }
        })`;

if (!content.includes(targetSwal)) {
  throw new Error('targetSwal not found in app.js');
}

content = content.replace(targetSwal, newSwal);

if (isCRLF) {
  content = content.replace(/\n/g, '\r\n');
}

fs.writeFileSync(path, content, 'utf8');
console.log('Successfully updated app.js with password toggle and headers!');
