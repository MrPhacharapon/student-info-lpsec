// scratch/update_app_security.js
const fs = require('fs');

const path = 'app.js';
let content = fs.readFileSync(path, 'utf8');
const isCRLF = content.includes('\r\n');
content = content.replace(/\r\n/g, '\n');

// 1. Replace _callApi
const targetCallApi = `      _callApi: function(action, payload = null, getMethod = false) {
        const url = getMethod ? \`\${CONFIG.API_URL}?action=\${action}\` + (payload ? \`&url=\${encodeURIComponent(payload)}\` : '') : CONFIG.API_URL;
        
        let requestPayload = payload;
        if (!getMethod && typeof state !== 'undefined' && state && state.adminToken) {
          if (typeof requestPayload === 'object' && requestPayload !== null) {
            requestPayload = Object.assign({ token: state.adminToken }, requestPayload);
          } else if (!requestPayload) {
            requestPayload = { token: state.adminToken };
          }
        }

        const adminToken = (typeof state !== 'undefined' && state && state.adminToken) ? state.adminToken : undefined;
        const options = getMethod ? { method: 'GET' } : {
          method: 'POST',
          body: JSON.stringify({ action, payload: requestPayload, token: adminToken })
        };`;

const newCallApi = `      _callApi: function(action, payload = null, getMethod = false) {
        let url = CONFIG.API_URL;
        const adminToken = (typeof state !== 'undefined' && state && state.adminToken) ? state.adminToken : undefined;

        if (getMethod) {
          url = \`\${CONFIG.API_URL}?action=\${encodeURIComponent(action)}\` + (payload ? \`&url=\${encodeURIComponent(payload)}\` : '');
          if (adminToken) {
            url += \`&token=\${encodeURIComponent(adminToken)}\`;
          }
        }
        
        let requestPayload = payload;
        if (!getMethod && adminToken) {
          if (typeof requestPayload === 'object' && requestPayload !== null) {
            requestPayload = Object.assign({ token: adminToken }, requestPayload);
          } else if (!requestPayload) {
            requestPayload = { token: adminToken };
          }
        }

        const headers = { 'Content-Type': 'application/json' };
        if (adminToken) {
          headers['X-Admin-Token'] = adminToken;
        }

        const options = getMethod ? { method: 'GET', headers } : {
          method: 'POST',
          headers,
          body: JSON.stringify({ action, payload: requestPayload, token: adminToken })
        };`;

if (!content.includes(targetCallApi)) {
  throw new Error('targetCallApi not found');
}
content = content.replace(targetCallApi, newCallApi);

// 2. Replace tryRestoreStudentCache and TTL
const targetRestore = `  const STUDENT_CACHE_KEY = 'LPSEC_STUDENT_DATA_CACHE';
  let isDataLoadedFromCache = false;

  // Try to restore student data instantly from browser localStorage (< 0.1s)
  function tryRestoreStudentCache() {
    try {
      if (typeof localStorage === 'undefined') return false;
      const cachedStr = localStorage.getItem(STUDENT_CACHE_KEY);
      if (!cachedStr) return false;

      const cached = JSON.parse(cachedStr);
      if (cached && Array.isArray(cached.students) && cached.students.length > 0) {
        isDataLoadedFromCache = true;
        // Instantly populate and render from cache!
        onDataLoadSuccess(cached, true);
        
        // Show subtle background sync badge
        $('#badgeBackgroundSync').removeClass('hidden').show();
        $('#badgeBackgroundSyncText').text('กำลังซิงค์ข้อมูลล่าสุด...');
        $('#badgeBackgroundSync i').addClass('animate-spin').attr('data-lucide', 'refresh-cw');
        if (typeof lucide !== 'undefined') lucide.createIcons();
        return true;
      }
    } catch (e) {
      console.warn('Error restoring student cache:', e);
    }
    return false;
  }`;

const newRestore = `  const STUDENT_CACHE_KEY = 'LPSEC_STUDENT_DATA_CACHE';
  const STUDENT_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes TTL for client storage
  let isDataLoadedFromCache = false;

  // Try to restore student data instantly from browser localStorage (< 0.1s)
  function tryRestoreStudentCache() {
    try {
      if (typeof localStorage === 'undefined') return false;
      const cachedStr = localStorage.getItem(STUDENT_CACHE_KEY);
      if (!cachedStr) return false;

      const cachedObj = JSON.parse(cachedStr);
      // Support envelope format { timestamp, data } or legacy raw format { students, config }
      const cached = (cachedObj && cachedObj.data) ? cachedObj.data : cachedObj;
      const cachedTimestamp = (cachedObj && cachedObj.timestamp) ? cachedObj.timestamp : null;
      const isExpired = cachedTimestamp ? (Date.now() - cachedTimestamp > STUDENT_CACHE_TTL_MS) : false;

      if (cached && Array.isArray(cached.students) && cached.students.length > 0) {
        isDataLoadedFromCache = true;
        // Instantly populate and render from cache!
        onDataLoadSuccess(cached, true);
        
        // Show subtle background sync badge
        $('#badgeBackgroundSync').removeClass('hidden').show();
        $('#badgeBackgroundSyncText').text(isExpired ? 'แคชเกิน 15 นาที กำลังอัปเดต...' : 'กำลังซิงค์ข้อมูลล่าสุด...');
        $('#badgeBackgroundSync i').addClass('animate-spin').attr('data-lucide', 'refresh-cw');
        if (typeof lucide !== 'undefined') lucide.createIcons();
        return true;
      }
    } catch (e) {
      console.warn('Error restoring student cache:', e);
    }
    return false;
  }`;

if (!content.includes(targetRestore)) {
  throw new Error('targetRestore not found');
}
content = content.replace(targetRestore, newRestore);

// 3. Replace onDataLoadSuccess caching logic with envelope
const targetCacheSave = `    // Save to browser cache for future instant loads
    if (!fromCache) {
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(STUDENT_CACHE_KEY, JSON.stringify(response));
        }
      } catch (e) {
        console.warn('Error saving student cache:', e);
      }
    }`;

const newCacheSave = `    // Save to browser cache with envelope and timestamp for future instant loads
    if (!fromCache) {
      try {
        if (typeof localStorage !== 'undefined') {
          const envelope = {
            timestamp: Date.now(),
            version: 1,
            data: response
          };
          localStorage.setItem(STUDENT_CACHE_KEY, JSON.stringify(envelope));
        }
      } catch (e) {
        console.warn('Error saving student cache:', e);
      }
    }`;

if (!content.includes(targetCacheSave)) {
  throw new Error('targetCacheSave not found');
}
content = content.replace(targetCacheSave, newCacheSave);

// 4. Update finishLogout
const targetFinishLogout = `  function finishLogout() {
    state.adminToken = null;
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem('ADMIN_SESSION_TOKEN');
    }
    renderStudentTable();
    $('.nav-link[data-section="dashboard"]').trigger('click');
    Swal.fire({
      icon: 'success',
      title: 'ออกจากระบบสำเร็จ',
      text: 'ยกเลิกสิทธิ์ Admin เรียบร้อยแล้ว',
      timer: 1500,
      showConfirmButton: false
    });
  }`;

const newFinishLogout = `  function finishLogout() {
    state.adminToken = null;
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem('ADMIN_SESSION_TOKEN');
    }
    // Clean up sensitive SET files from IndexedDB upon logout to protect PII
    if (typeof clearAllSetFilesFromLocalDB === 'function') {
      clearAllSetFilesFromLocalDB();
    }
    // Reload public sanitized data from gateway
    loadData();
    renderStudentTable();
    $('.nav-link[data-section="dashboard"]').trigger('click');
    Swal.fire({
      icon: 'success',
      title: 'ออกจากระบบสำเร็จ',
      text: 'ยกเลิกสิทธิ์ Admin และล้างแคชข้อมูลลับเรียบร้อยแล้ว',
      timer: 1500,
      showConfirmButton: false
    });
  }`;

if (!content.includes(targetFinishLogout)) {
  throw new Error('targetFinishLogout not found');
}
content = content.replace(targetFinishLogout, newFinishLogout);

if (isCRLF) {
  content = content.replace(/\n/g, '\r\n');
}
fs.writeFileSync(path, content, 'utf8');
console.log('Successfully updated app.js security containment features!');
