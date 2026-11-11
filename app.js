
// --- Mocking google.script.run for REST API ---
const google = {
  script: {
    run: {
      withSuccessHandler: function(onSuccess) {
        this._onSuccess = onSuccess;
        return this;
      },
      withFailureHandler: function(onFailure) {
        this._onFailure = onFailure;
        return this;
      },
      _callApi: function(action, payload = null, getMethod = false) {
        const url = getMethod ? `${CONFIG.API_URL}?action=${action}` + (payload ? `&url=${encodeURIComponent(payload)}` : '') : CONFIG.API_URL;
        
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
        };
        
        fetch(url, options)
          .then(res => {
            if (!res.ok) throw new Error('Network response was not ok');
            return res.json();
          })
          .then(result => {
            if (result.status === 'success') {
              if (this._onSuccess) this._onSuccess(result.data);
            } else {
              if (result.code === 'UNAUTHORIZED' || result.code === 'SESSION_EXPIRED' || result.code === 'SESSION_REVOKED') {
                if (typeof state !== 'undefined' && state) {
                  state.adminToken = null;
                }
                if (typeof sessionStorage !== 'undefined') {
                  sessionStorage.removeItem('ADMIN_SESSION_TOKEN');
                }
                if (typeof renderStudentTable === 'function') {
                  renderStudentTable();
                }
                if (typeof Swal !== 'undefined') {
                  Swal.fire({
                    icon: 'warning',
                    title: 'เซสชันหมดอายุหรือถูกยกเลิก',
                    text: 'กรุณาเข้าสู่ระบบ Admin ใหม่อีกครั้งเพื่อดำเนินการ',
                    confirmButtonColor: '#2E7D32'
                  });
                }
              }
              if (this._onFailure) this._onFailure(new Error(result.message || 'การดำเนินการล้มเหลว'));
            }
          })
          .catch(err => {
            if (this._onFailure) this._onFailure(err);
            // Visible Debug Logging Fallback
            const errDiv = document.createElement('div');
            errDiv.style.position = 'fixed';
            errDiv.style.bottom = '20px';
            errDiv.style.right = '20px';
            errDiv.style.background = '#dc2626';
            errDiv.style.color = 'white';
            errDiv.style.padding = '15px';
            errDiv.style.borderRadius = '8px';
            errDiv.style.zIndex = '9999';
            errDiv.innerHTML = `<b>🚨 [Fetch Error]</b><br/>${err.message}`;
            document.body.appendChild(errDiv);
            setTimeout(() => errDiv.remove(), 10000);
          });
      },
      getStudentDataAndConfig: function() {
        this._callApi('getStudentDataAndConfig', null, true);
      },
      getSheetTabsFromUrl: function(url) {
        this._callApi('getTabs', url, true);
      },
      saveAppConfig: function(spreadsheetIdOrSheetName, sheetNameOrReportDate, reportDateOrColOrder, maybeColOrder) {
        let sheetName, reportDate, columnOrder;
        if (maybeColOrder !== undefined) {
          // Signature: (spreadsheetId, sheetName, reportDate, columnOrder)
          sheetName = sheetNameOrReportDate;
          reportDate = reportDateOrColOrder;
          columnOrder = maybeColOrder;
        } else {
          // Signature: (sheetName, reportDate, columnOrder)
          sheetName = spreadsheetIdOrSheetName;
          reportDate = sheetNameOrReportDate;
          columnOrder = reportDateOrColOrder;
        }
        this._callApi('saveAppConfig', { sheetName, reportDate, columnOrder });
      },
      createStudent: function(payload) {
        this._callApi('createStudent', payload);
      },
      updateStudent: function(payload) {
        this._callApi('updateStudent', payload);
      },
      deleteStudent: function(rowNumber, studentName, studentId) {
        this._callApi('deleteStudent', { rowNumber, studentName, studentId });
      },
      adminLogout: function() {
        this._callApi('adminLogout', {});
      }
    }
  }
};

// App Global State
  const state = {
    adminToken: (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('ADMIN_SESSION_TOKEN') : null),
    allStudents: [],
    currentProfileStudents: [],
    currentProfileIndex: -1,
    filteredStudents: [],
    classrooms: [],
    teachers: [],
    disabilitiesCard: [],
    disabilitiesScreening: [],
    currentEditingStudent: null,
    pivotRows: [], // selected row fields
    pivotCols: [], // selected col fields
    dashboardCharts: {},
    pivotChart: null,
    columnOrder: ['name', 'classroom', 'teacher', 'serviceType', 'disabilityType', 'documents', 'birthday'],
    setImport: {
      generalRows: [],
      addressRows: [],
      linkRows: [],
      generalHeaders: [],
      addressHeaders: [],
      linkHeaders: [],
      generalMapping: {},
      addressMapping: {},
      linkMapping: {},
      joinedRecords: [],
      diffResult: null,
      activeCategoryFilter: 'all',
      maskPii: true,
      currentDiffRecord: null
    }
  };

  // Thai Short Month Names for Display
  const THAI_MONTHS_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

  // Initialize Application
  $(document).ready(function() {
    initApp();
  });

  function initApp() {
    showLoading(true);
    
    // Register the Chart.js DataLabels plugin globally
    Chart.register(ChartDataLabels);

    // Set Chart.js Defaults for larger readable text
    Chart.defaults.font.size = 15;
    Chart.defaults.font.family = "'Sarabun', sans-serif";
    
    // Bind General Event Listeners
    setupEventListeners();
    
    // Setup Drag & Drop Handlers
    setupDragAndDrop();
    
    // Setup Top Scrollbar Sync
    setupScrollbarSync();
    
    // Load data from Google Apps Script
    loadData();
  }

  // Synchronize top and bottom scrollbars for roster table
  function setupScrollbarSync() {
    const topWrapper = $('#studentTopScrollbarWrapper');
    const tableContainer = $('#studentTableContainer');
    
    topWrapper.on('scroll', function() {
      tableContainer.scrollLeft(topWrapper.scrollLeft());
    });

    tableContainer.on('scroll', function() {
      topWrapper.scrollLeft(tableContainer.scrollLeft());
    });
    
    $(window).on('resize', function() {
      syncScrollbarWidths();
    });
  }

  function syncScrollbarWidths() {
    const tableContainer = $('#studentTableContainer');
    if (tableContainer.length === 0) return;
    const scrollWidth = tableContainer[0].scrollWidth;
    const clientWidth = tableContainer[0].clientWidth;
    
    const topWrapper = $('#studentTopScrollbarWrapper');
    if (scrollWidth > clientWidth) {
      topWrapper.removeClass('hidden');
      $('#studentTopScrollbarDummy').css('width', scrollWidth + 'px');
      // Sync positions
      topWrapper.scrollLeft(tableContainer.scrollLeft());
    } else {
      topWrapper.addClass('hidden');
    }
  }

  // Show or Hide Loader Overlay
  function showLoading(show) {
    const loader = $('#loadingOverlay');
    if (show) {
      loader.addClass('active');
    } else {
      loader.removeClass('active');
    }
  }

  // Load raw data from Apps Script backend
  function loadData() {
    google.script.run
      .withSuccessHandler(onDataLoadSuccess)
      .withFailureHandler(onDataLoadFailure)
      .getStudentDataAndConfig();
  }

  function onDataLoadFailure(error) {
    showLoading(false);
    Swal.fire({
      icon: 'error',
      title: 'การเชื่อมต่อผิดพลาด',
      text: error.message || 'ไม่สามารถโหลดข้อมูลจาก Google Sheets ได้',
      confirmButtonColor: '#2E7D32'
    });
  }

  function onDataLoadSuccess(response) {
    state.allStudents = response.students || [];
    state.appConfig = response.config || {};
    
    // Parse Dynamic Column Order
    if (state.appConfig.columnOrder) {
      state.columnOrder = state.appConfig.columnOrder.split(',')
        .map(s => s.trim())
        .filter(s => s !== 'conditions'); // Remove 'conditions' column
      // Self-healing: make sure all standard columns are included if some were omitted
      const defaultCols = ['name', 'classroom', 'teacher', 'serviceType', 'disabilityType', 'documents', 'birthday'];
      defaultCols.forEach(col => {
        if (!state.columnOrder.includes(col)) {
          state.columnOrder.push(col);
        }
      });
    }

    // Update Header Date Display
    updateHeaderDate();

    // Extract Unique values for Dropdowns
    extractUniqueValues();
    
    // Populate Dropdowns
    populateFilterDropdowns();
    populateFormDropdowns();
    
    // Initialize Select2 Elements
    initSelect2();
    
    // Apply filters and render
    applyFilters();
    
    showLoading(false);
  }

  function updateHeaderDate() {
    if (state.appConfig && state.appConfig.reportDate) {
      const dateParts = state.appConfig.reportDate.split('/');
      if (dateParts.length === 3) {
        const d = parseInt(dateParts[0], 10);
        const m = parseInt(dateParts[1], 10);
        const y = parseInt(dateParts[2], 10);
        const monthName = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"][m - 1];
        $('#textReportDate').text(`ข้อมูล ณ วันที่ ${d} ${monthName} พ.ศ. ${y}`);
        return;
      }
    }
    $('#textReportDate').text(`ข้อมูล ณ วันที่ ${state.appConfig ? state.appConfig.reportDate : '-'}`);
  }

  // Extract unique values from data to fill dropdown select options
  function extractUniqueValues() {
    const clsSet = new Set();
    const tchSet = new Set();
    const cardDisSet = new Set();
    const scrDisSet = new Set();

    state.allStudents.forEach(s => {
      if (s.classroom) clsSet.add(s.classroom);
      if (s.teacher) tchSet.add(s.teacher);
      if (s.disabilityByCard) cardDisSet.add(getNormalizedDisability(s.disabilityByCard, true));
      if (s.disabilityByScreening) scrDisSet.add(getNormalizedDisability(s.disabilityByScreening, false));
    });

    state.classrooms = Array.from(clsSet); // Keep order of appearance in sheet
    state.teachers = Array.from(tchSet).sort();
    state.disabilitiesCard = Array.from(cardDisSet).sort();
    state.disabilitiesScreening = Array.from(scrDisSet).sort();
    state.disabilitiesCard = state.disabilitiesCard.filter(d => d !== 'ยังไม่มีบัตรคนพิการ');
    state.disabilitiesScreening = state.disabilitiesScreening.filter(d => d !== 'ไม่ระบุ');

  }

  // Populate Filter Sidebar dropdowns
  function populateFilterDropdowns() {
    // Classroom
    const filterCls = $('#filterClassroom').empty().append('<option value="">ทั้งหมด</option>');
    state.classrooms.forEach(c => filterCls.append(new Option(c, c)));
    
    // Teacher
    const filterTch = $('#filterTeacher').empty().append('<option value="">ทั้งหมด</option>');
    state.teachers.forEach(t => filterTch.append(new Option(t, t)));
    
    // Disability (Card)
    const filterCardDis = $('#filterDisabilityCard').empty().append('<option value="">ทั้งหมด</option>');
    state.disabilitiesCard.forEach(d => {
      if (d && d !== "-") filterCardDis.append(new Option(d, d));
    });

    // Disability (Screening)
    const filterScrDis = $('#filterDisabilityScreen').empty().append('<option value="">ทั้งหมด</option>');
    state.disabilitiesScreening.forEach(d => {
      if (d && d !== "-") filterScrDis.append(new Option(d, d));
    });

    // Age Range (grouped)
    const filterAgeRange = $('#filterAgeRange').empty().append('<option value="">ทั้งหมด</option>');
    filterAgeRange.append(new Option('อายุน้อยกว่า 3 ปี', 'range:<3'));
    filterAgeRange.append(new Option('อายุ 3 - 6 ปี', 'range:3-6'));
    filterAgeRange.append(new Option('อายุ 7 ปีขึ้นไป', 'range:>=7'));
    
    const hasUnknownDob = state.allStudents.some(s => calculateAge(s.dateOfBirth, s) === null);
    if (hasUnknownDob) {
      filterAgeRange.append(new Option('ไม่ระบุวันเกิด', 'range:unknown'));
    }

    // Age Specific Year
    const filterAgeYear = $('#filterAgeYear').empty().append('<option value="">ทั้งหมด</option>');
    const uniqueAges = new Set();
    state.allStudents.forEach(s => {
      const age = calculateAge(s.dateOfBirth, s);
      if (age !== null) uniqueAges.add(age);
    });
    const sortedAges = Array.from(uniqueAges).sort((a, b) => a - b);

    if (sortedAges.length > 0) {
      sortedAges.forEach(age => {
        filterAgeYear.append(new Option(`${age} ปี`, `age:${age}`));
      });
    }
  }

  // Populate Form dropdowns
  function populateFormDropdowns() {
    // Classrooms
    const formCls = $('#studentClassroom').empty().append('<option value="">-- เลือกห้องเรียน --</option>');
    state.classrooms.forEach(c => formCls.append(new Option(c, c)));
    
    // Teachers
    const formTch = $('#studentTeacher').empty().append('<option value="">-- เลือกครูผู้รับผิดชอบ --</option>');
    state.teachers.forEach(t => formTch.append(new Option(t, t)));
  }

  // Initialize Select2 styled elements
  function initSelect2() {
    $('.select2-enable').select2({
      width: '100%',
      dropdownAutoWidth: true
    });

    // Re-bind change events for Select2 because they don't trigger standard jQuery change directly
    $('#filterClassroom, #filterTeacher, #filterDisabilityCard, #filterDisabilityScreen, #filterAgeRange, #filterAgeYear').on('change', function() {
      applyFilters();
    });
  }

  // Event Listeners setup
  function setupEventListeners() {
    // Sidebar Navigation
    $('.nav-link').click(function(e) {
      e.preventDefault();
      const $this = $(this);
      const targetSection = $this.data('section');
      
      if (targetSection === 'admin') {
        if (state.adminToken) {
          switchSection($this, targetSection);
          initAdminSettingsPanel();
          return;
        }
        Swal.fire({
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
        }).then((result) => {
          if (result.isConfirmed) {
            switchSection($this, targetSection);
            initAdminSettingsPanel();
          }
        });
      } else {
        switchSection($this, targetSection);
      }
    });

    // Toggle Advanced Search filter panel
    $('#btnToggleAdvancedSearch').click(function() {
      const panel = $('#filterPanel');
      const icon = $('#iconAdvancedSearch');
      panel.toggleClass('hidden');
      icon.toggleClass('rotate-180');
    });


    // Text Search
    $('#searchName').on('input', function() {
      applyFilters();
    });

    // Checkboxes in Filter Sidebar
    $('.filter-checkbox').on('change', function() {
      applyFilters();
    });

    // Reset Filters button
    $('#btnResetFilters').click(function() {
      $('#searchName').val('');
      $('#filterClassroom').val('').trigger('change');
      $('#filterTeacher').val('').trigger('change');
      $('#filterDisabilityCard').val('').trigger('change');
      $('#filterDisabilityScreen').val('').trigger('change');
      $('#filterAgeRange').val('').trigger('change');
      $('#filterAgeYear').val('').trigger('change');
      $('.filter-checkbox').prop('checked', false);
      applyFilters();
      
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: 'ล้างตัวกรองเรียบร้อย',
        showConfirmButton: false,
        timer: 1500
      });
    });

    // Add Student Button handler removed as requested (Add student action is removed)

    // Close Modal Button
    $('#btnCancelForm, #btnCloseModal').click(function() {
      closeStudentModal();
    });

    // Submit Student Form
    $('#studentForm').submit(function(e) {
      e.preventDefault();
      submitStudentForm();
    });

    // Enable/Disable new fields custom entry (Select2 dynamic addition mock-up)
    // Classroom Add Custom
    $('#btnAddCustomClassroom').click(function() {
      Swal.fire({
        title: 'เพิ่มห้องเรียนใหม่',
        input: 'text',
        inputPlaceholder: 'กรอกชื่อห้องเรียนใหม่...',
        showCancelButton: true,
        confirmButtonText: 'เพิ่ม',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#2E7D32',
        inputValidator: (value) => {
          if (!value) return 'กรุณากรอกชื่อห้องเรียน!';
        }
      }).then((result) => {
        if (result.isConfirmed) {
          const newCls = result.value.trim();
          if (state.classrooms.indexOf(newCls) === -1) {
            state.classrooms.push(newCls);
            populateFormDropdowns();
          }
          $('#studentClassroom').val(newCls).trigger('change');
        }
      });
    });

    // Teacher Add Custom
    $('#btnAddCustomTeacher').click(function() {
      Swal.fire({
        title: 'เพิ่มครูผู้รับผิดชอบใหม่',
        input: 'text',
        inputPlaceholder: 'กรอกชื่อ-สกุล ครู...',
        showCancelButton: true,
        confirmButtonText: 'เพิ่ม',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#2E7D32',
        inputValidator: (value) => {
          if (!value) return 'กรุณากรอกชื่อครู!';
        }
      }).then((result) => {
        if (result.isConfirmed) {
          const newTch = result.value.trim();
          if (state.teachers.indexOf(newTch) === -1) {
            state.teachers.push(newTch);
            state.teachers.sort();
            populateFormDropdowns();
          }
          $('#studentTeacher').val(newTch).trigger('change');
        }
      });
    });

    // Admin Fetch Tabs Helper moved to outer scope

    // Admin Fetch Tabs Button
    $('#btnAdminFetchTabs').click(function() {
      fetchAdminSheetTabs(false);
    });

    // Admin Save Settings Button
    $('#btnAdminSaveSettings').click(function() {
      const url = $('#adminSpreadsheetUrl').val();
      const sheetName = $('#adminSheetTabSelect').val();
      const day = $('#adminReportDay').val();
      const month = $('#adminReportMonth').val();
      const year = $('#adminReportYear').val();
      
      if (!url) {
        Swal.fire('คำเตือน', 'กรุณากรอกลิงก์ Google Sheet', 'warning');
        return;
      }
      if (!sheetName) {
        Swal.fire('คำเตือน', 'กรุณาเลือกแผ่นงาน', 'warning');
        return;
      }
      
      let spreadsheetId = url.trim();
      if (url.includes("docs.google.com/spreadsheets")) {
        const matches = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
        if (matches && matches[1]) {
          spreadsheetId = matches[1];
        }
      }
      
      const reportDateStr = `${day}/${month}/${year}`;
      
      const colOrderStr = state.columnOrder.join(',');
      showLoading(true);
      google.script.run
        .withSuccessHandler(function(res) {
          showLoading(false);
          if (res.success) {
            Swal.fire({
              icon: 'success',
              title: 'บันทึกสำเร็จ',
              text: res.message,
              confirmButtonColor: '#2E7D32'
            }).then(() => {
              showLoading(true);
              loadData();
              $('.nav-link[data-section="dashboard"]').trigger('click');
            });
          } else {
            Swal.fire('ข้อผิดพลาด', 'ไม่สามารถบันทึกค่าได้: ' + res.message, 'error');
          }
        })
        .withFailureHandler(function(err) {
          showLoading(false);
          Swal.fire('ข้อผิดพลาด', 'ระบบหลังบ้านผิดพลาด: ' + err.message, 'error');
        })
        .saveAppConfig(spreadsheetId, sheetName, reportDateStr, colOrderStr);
    });

    // Admin Logout Button
    $('#btnAdminLogout').click(function() {
      handleAdminLogout();
    });

    // Close Drill Down Container
    $(document).on('click', '#btnCloseDrillDown', function() {
      $('#chartDrillDownContainer').addClass('hidden');
    });

    // Initialize SET Excel Importer Events
    initSetImportEvents();
  }

  function handleAdminLogout() {
    Swal.fire({
      title: 'ออกจากระบบ Admin?',
      text: 'คุณต้องการออกจากระบบและยกเลิกเซสชันปัจจุบันใช่หรือไม่?',
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#2E7D32',
      cancelButtonColor: '#757575',
      confirmButtonText: 'ใช่, ออกจากระบบ',
      cancelButtonText: 'ยกเลิก'
    }).then((result) => {
      if (result.isConfirmed) {
        if (state.adminToken) {
          google.script.run
            .withSuccessHandler(() => {
              finishLogout();
            })
            .withFailureHandler(() => {
              finishLogout();
            })
            .adminLogout();
        } else {
          finishLogout();
        }
      }
    });
  }

  function finishLogout() {
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
  }

  // Section toggle helper
  function switchSection(navLinkElement, targetSection) {
    $('.nav-link').removeClass('bg-emerald-500/20 text-emerald-800 border-l-4 border-emerald-700 font-semibold');
    navLinkElement.addClass('bg-emerald-500/20 text-emerald-800 border-l-4 border-emerald-700 font-semibold');
    
    $('.app-section').addClass('hidden');
    $('#' + targetSection + 'Section').removeClass('hidden');

    // Update top bar text dynamically
    const titleEl = $('#topBarTitle');
    if (targetSection === 'dashboard') {
      titleEl.text('สารสนเทศนักเรียน ศูนย์การศึกษาพิเศษ ประจำจังหวัดลำปาง');
      // ภาพ 2: หน้าภาพรวม -> ไม่ต้องแสดง ตัวกรองหลายชั้น
      $('#btnToggleAdvancedSearch, #filterPanel').addClass('hidden');
      renderDashboard();
    } else if (targetSection === 'students') {
      // ภาพ 3: แฟ้มรายชื่อนักเรียน -> ข้อมูลนักเรียนรายบุคคล
      titleEl.text('ข้อมูลนักเรียนรายบุคคล');
      // แสดงตัวกรองหลายชั้นในหน้าข้อมูลนักเรียนรายบุคคล
      $('#btnToggleAdvancedSearch, #filterPanel').removeClass('hidden');
      renderStudentTable();
    } else if (targetSection === 'pivot') {
      titleEl.text('ตารางวิเคราะห์ความสัมพันธ์ของข้อมูล');
      $('#btnToggleAdvancedSearch, #filterPanel').addClass('hidden');
      renderPivotTable();
    } else if (targetSection === 'admin') {
      titleEl.text('ตั้งค่าระบบสำหรับผู้ดูแล (Admin)');
      $('#btnToggleAdvancedSearch, #filterPanel').addClass('hidden');
    }
  }

  // Admin Fetch Tabs Helper (Supports both automatic background fetch and manual button click)
  function fetchAdminSheetTabs(isAuto = false) {
    const url = $('#adminSpreadsheetUrl').val();
    if (!url) {
      if (!isAuto) Swal.fire('คำเตือน', 'กรุณากรอกลิงก์ Google Sheet', 'warning');
      return;
    }
    
    const currentSelectedSheet = (state.appConfig && state.appConfig.sheetName) || $('#adminSheetTabSelect').val();
    
    if (!isAuto) showLoading(true);
    google.script.run
      .withSuccessHandler(function(res) {
        if (!isAuto) showLoading(false);
        const isSuccess = res && (res.success || res.status === 'success');
        const tabs = res && (res.tabs || (res.data && res.data.tabs));
        if (isSuccess && tabs && tabs.length > 0) {
          const select = $('#adminSheetTabSelect').empty();
          tabs.forEach(tab => {
            const isSelected = (tab.name === currentSelectedSheet) ? 'selected' : '';
            select.append(`<option value="${tab.name}" ${isSelected}>${tab.name} (${tab.id})</option>`);
          });
          if (currentSelectedSheet) {
            select.val(currentSelectedSheet);
          }
          if (!isAuto) {
            Swal.fire('สำเร็จ', 'ดึงข้อมูลแผ่นงานเรียบร้อยแล้ว กรุณาเลือกแผ่นงานที่ต้องการด้านล่าง', 'success');
          }
        } else {
          if (!isAuto) {
            Swal.fire('ข้อผิดพลาด', 'ไม่สามารถเชื่อมต่อชีตได้: ' + ((res && res.message) || 'ไม่พบรายชื่อแผ่นงาน'), 'error');
          }
        }
      })
      .withFailureHandler(function(err) {
        if (!isAuto) {
          showLoading(false);
          Swal.fire('ข้อผิดพลาด', 'ระบบหลังบ้านผิดพลาด: ' + err.message, 'error');
        }
      })
      .getSheetTabsFromUrl(url);
  }

  // Admin settings panel initialization
  function initAdminSettingsPanel() {
    // Populate Day select
    const daySelect = $('#adminReportDay').empty();
    for (let d = 1; d <= 31; d++) {
      daySelect.append(`<option value="${d}">${d}</option>`);
    }
    
    // Populate Year select (B.E. 2560 to 2580)
    const yearSelect = $('#adminReportYear').empty();
    const currentYearBE = new Date().getFullYear() + 543;
    for (let y = currentYearBE - 10; y <= currentYearBE + 10; y++) {
      yearSelect.append(`<option value="${y}">พ.ศ. ${y}</option>`);
    }

    // Set settings values
    if (state.appConfig) {
      $('#adminSpreadsheetUrl').val(state.appConfig.spreadsheetId ? 'https://docs.google.com/spreadsheets/d/' + state.appConfig.spreadsheetId : '');
      
      const tabSelect = $('#adminSheetTabSelect').empty();
      tabSelect.append(`<option value="${state.appConfig.sheetName}">${state.appConfig.sheetName}</option>`);
      // Auto-fetch all sheet tabs in the background upon opening admin panel
      fetchAdminSheetTabs(true);
      
      if (state.appConfig.rawReportDate) {
        const parts = state.appConfig.rawReportDate.split('/');
        if (parts.length === 3) {
          $('#adminReportDay').val(parseInt(parts[0], 10));
          $('#adminReportMonth').val(parseInt(parts[1], 10));
          $('#adminReportYear').val(parseInt(parts[2], 10));
        }
      } else {
        const today = new Date();
        $('#adminReportDay').val(today.getDate());
        $('#adminReportMonth').val(today.getMonth() + 1);
        $('#adminReportYear').val(today.getFullYear() + 543);
      }
    }
    // Render dynamic column order list
    initAdminColumnOrderList();
  }

  const COLUMN_LABELS = {
    name: 'ชื่อ-สกุล',
    classroom: 'ห้องเรียน/หน่วยบริการ',
    teacher: 'ครูผู้รับผิดชอบ',
    serviceType: 'ประเภทการบริการ',
    disabilityType: 'ประเภทความพิการ ตามแบบคัดกรองฯ',
    documents: 'เอกสาร',
    birthday: 'วันเกิด (พ.ศ.)'
  };

  function initAdminColumnOrderList() {
    const container = $('#adminColumnOrderContainer').empty();
    state.columnOrder.forEach((colId, index) => {
      const label = COLUMN_LABELS[colId] || colId;
      const upDisabled = index === 0 ? 'disabled opacity-30 cursor-not-allowed' : '';
      const downDisabled = index === state.columnOrder.length - 1 ? 'disabled opacity-30 cursor-not-allowed' : '';
      
      container.append(`
        <div class="flex flex-col justify-between p-3 bg-white/70 border border-emerald-100 rounded-xl shadow-sm text-sm gap-2">
          <span class="font-medium text-emerald-955 flex items-center gap-1.5">
            <span class="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-[10px] font-bold">${index + 1}</span>
            ${label}
          </span>
          <div class="flex items-center justify-end gap-1.5 border-t border-dashed border-emerald-100/30 pt-1.5">
            <button type="button" onclick="moveColumnOrder(${index}, -1)" ${upDisabled} class="p-1 hover:bg-emerald-500/10 rounded text-emerald-850 transition">
              <i data-lucide="chevron-up" class="w-4 h-4"></i>
            </button>
            <button type="button" onclick="moveColumnOrder(${index}, 1)" ${downDisabled} class="p-1 hover:bg-emerald-500/10 rounded text-emerald-850 transition">
              <i data-lucide="chevron-down" class="w-4 h-4"></i>
            </button>
          </div>
        </div>
      `);
    });
    lucide.createIcons();
  }

  window.moveColumnOrder = function(index, direction) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= state.columnOrder.length) return;
    
    // Swap columns in array
    const temp = state.columnOrder[index];
    state.columnOrder[index] = state.columnOrder[targetIndex];
    state.columnOrder[targetIndex] = temp;
    
    // Re-render
    initAdminColumnOrderList();
  };

  // Filter Engine
  function applyFilters() {
    const searchVal = $('#searchName').val().toLowerCase().trim();
    const classroomVal = $('#filterClassroom').val();
    const teacherVal = $('#filterTeacher').val();
    const disCardVal = $('#filterDisabilityCard').val();
    const disScrVal = $('#filterDisabilityScreen').val();
    const ageRangeVal = $('#filterAgeRange').val();
    const ageYearVal = $('#filterAgeYear').val();
    
    // Service Types
    const svcInCenter = $('#filterSvcCenter').is(':checked');
    const svcSvcUnit = $('#filterSvcUnit').is(':checked');
    const svcHome = $('#filterSvcHome').is(':checked');
    
    // Document Checklists
    const docCard = $('#filterDocCard').is(':checked');
    const docCert = $('#filterDocCert').is(':checked');
    const docScreen = $('#filterDocScreen').is(':checked');

    // Special status
    const statusNonThai = $('#filterStatusNonThai').is(':checked');
    const statusLater = $('#filterStatusLater').is(':checked');

    state.filteredStudents = state.allStudents.filter(s => {
      // 1. Search Name (supports partial words, multi-word matching, vowels & accents)
      if (searchVal) {
        const terms = searchVal.split(/\s+/).filter(Boolean);
        const nameLower = (s.name || '').toLowerCase();
        const allTermsMatch = terms.every(term => nameLower.indexOf(term) !== -1);
        if (!allTermsMatch) return false;
      }
      // 2. Classroom dropdown
      if (classroomVal && s.classroom !== classroomVal) {
        return false;
      }
      // 3. Teacher dropdown
      if (teacherVal && s.teacher !== teacherVal) {
        return false;
      }
      // 4. Disability (Card) dropdown
      if (disCardVal && getNormalizedDisability(s.disabilityByCard, true) !== disCardVal) {
        return false;
      }
      // 5. Disability (Screening) dropdown
      if (disScrVal && getNormalizedDisability(s.disabilityByScreening, false) !== disScrVal) {
        return false;
      }
      
      // 5.1 Age Range filter
      if (ageRangeVal) {
        const age = calculateAge(s.dateOfBirth, s);
        if (ageRangeVal.startsWith('range:')) {
          const range = ageRangeVal.replace('range:', '');
          if (range === '<3') {
            if (age === null || age >= 3) return false;
          } else if (range === '3-6') {
            if (age === null || age < 3 || age > 6) return false;
          } else if (range === '>=7') {
            if (age === null || age < 7) return false;
          } else if (range === 'unknown') {
            if (age !== null) return false;
          }
        }
      }

      // 5.2 Age Specific Year filter
      if (ageYearVal) {
        const age = calculateAge(s.dateOfBirth, s);
        if (ageYearVal.startsWith('age:')) {
          const specificAge = parseInt(ageYearVal.replace('age:', ''), 10);
          if (age !== specificAge) return false;
        }
      }
      
      // 6. Service Type Checkboxes (Union if multiple checked, all if none checked)
      if (svcInCenter || svcSvcUnit || svcHome) {
        let matchSvc = false;
        if (svcInCenter && s.serviceInCenter === 1) matchSvc = true;
        if (svcSvcUnit && s.serviceUnit === 1) matchSvc = true;
        if (svcHome && s.serviceAdjustHome === 1) matchSvc = true;
        if (!matchSvc) return false;
      }

      // 7. Document Checkboxes (AND filter)
      if (docCard && s.hasDisabilityCard !== 1) return false;
      if (docCert && s.hasDisabilityCert !== 1) return false;
      if (docScreen && s.hasEducationScreening !== 1) return false;

      // 8. Special Status Checkboxes
      if (statusNonThai && s.nonThai !== 1) return false;
      if (statusLater && s.disabledLater !== 1) return false;

      return true;
    });

    // Update UI components
    renderStudentTable();
    renderDashboard();
    renderPivotTable();
    
    // Update Stats badge
    $('#filteredCountBadge').text(state.filteredStudents.length);
    $('#totalCountBadge').text(state.allStudents.length);

    // Multi-tier Live Filtering & Real-Time Search:
    // Auto-display matching students in lifted #chartDrillDownContainer right below counter cards
    const hasActiveFilter = Boolean(
      searchVal || classroomVal || teacherVal || disCardVal || disScrVal || 
      ageRangeVal || ageYearVal || svcInCenter || svcSvcUnit || svcHome || 
      docCard || docCert || docScreen || statusNonThai || statusLater
    );
    if (hasActiveFilter) {
      state.currentDrillDownType = 'total';
      showDrillDownDetails('total', '', false);
    } else if (state.currentDrillDownType === 'total') {
      $('#chartDrillDownContainer').addClass('hidden');
      state.currentDrillDownType = null;
    }
  }

  const COLUMN_DEFINITIONS = {
    name: { label: 'ชื่อ-สกุล', class: 'sticky-col whitespace-nowrap' },
    classroom: { label: 'ห้องเรียน/หน่วยบริการ', class: 'whitespace-nowrap' },
    teacher: { label: 'ครูผู้รับผิดชอบ', class: 'whitespace-nowrap' },
    serviceType: { label: 'ประเภทการบริการ', class: 'whitespace-nowrap' },
    disabilityType: { label: 'ประเภทความพิการ ตามแบบคัดกรองฯ', class: 'whitespace-nowrap' },
    documents: { label: 'เอกสาร', class: 'text-center whitespace-nowrap' },
    birthday: { label: 'วันเกิด (พ.ศ.)', class: 'whitespace-nowrap' }
  };

  function renderTableHeader() {
    const thead = $('#studentsSection table thead tr').empty();
    thead.append(`
      <th class="px-2.5 py-2 text-emerald-850 font-semibold text-xs">ชื่อ-สกุล</th>
      <th class="px-2.5 py-2 text-emerald-850 font-semibold text-xs">ประเภทความพิการ</th>
      <th class="px-1.5 py-2 text-emerald-850 font-semibold text-xs text-center">อายุ (ปี)</th>
      <th class="px-2.5 py-2 text-emerald-850 font-semibold text-xs">ห้องเรียน/หน่วยบริการ</th>
      <th class="px-2.5 py-2 text-emerald-850 font-semibold text-xs">ประเภทการบริการ</th>
      <th class="px-2.5 py-2 text-emerald-850 font-semibold text-xs">ครูผู้รับผิดชอบ</th>
      <th class="px-2.5 py-2 text-emerald-850 font-semibold text-xs text-center whitespace-nowrap">ดูรายละเอียด</th>
    `);
  }

  function getColumnCellHtml(colId, student, svcText, docBadges, dobText, statusLabels, displayDis) {
    switch (colId) {
      case 'name':
        return `<td class="px-6 py-4 font-semibold text-gray-800 text-sm whitespace-nowrap sticky-col">${student.name}</td>`;
      case 'classroom':
        return `<td class="px-6 py-4 text-sm text-gray-700">${student.classroom}</td>`;
      case 'teacher':
        return `<td class="px-6 py-4 text-sm text-gray-600">${student.teacher}</td>`;
      case 'serviceType':
        return `<td class="px-6 py-4 text-sm whitespace-nowrap">${svcText}</td>`;
      case 'disabilityType':
        return `<td class="px-6 py-4 text-sm whitespace-nowrap">${displayDis}</td>`;
      case 'documents':
        return `<td class="px-6 py-4 text-sm text-center whitespace-nowrap">${docBadges}</td>`;
      case 'birthday':
        return `<td class="px-6 py-4 text-sm whitespace-nowrap">${dobText}</td>`;
      default:
        return '';
    }
  }

  // Render Table of students (Matching Image 3 columns, compact text-xs, conflict warning, no edit/delete buttons)
  function renderStudentTable() {
    renderTableHeader();
    const tbody = $('#studentTableBody').empty();
    
    if (state.filteredStudents.length === 0) {
      const searchVal = ($('#searchName').val() || '').trim();
      const classroomVal = $('#filterClassroom').val();
      const teacherVal = $('#filterTeacher').val();
      const disCardVal = $('#filterDisabilityCard').val();
      const disScrVal = $('#filterDisabilityScreen').val();
      
      let conflictHtml = '';
      if (searchVal) {
        // Search if the student exists in allStudents without other conflicting filters
        const matchingKids = state.allStudents.filter(s => {
          const terms = searchVal.toLowerCase().split(/\s+/).filter(Boolean);
          const nameLower = (s.name || '').toLowerCase();
          return terms.every(t => nameLower.includes(t));
        });

        if (matchingKids.length > 0) {
          const kid = matchingKids[0];
          let conflictReasons = [];
          if (classroomVal && kid.classroom !== classroomVal) {
            conflictReasons.push(`ห้องเรียนจริงคือ <strong>"${kid.classroom || '-'}"</strong> (แต่เลือกตัวกรองเป็น "${classroomVal}")`);
          }
          if (teacherVal && kid.teacher !== teacherVal) {
            conflictReasons.push(`ครูผู้รับผิดชอบจริงคือ <strong>"${kid.teacher || '-'}"</strong> (แต่เลือกตัวกรองเป็น "${teacherVal}")`);
          }
          if (disCardVal && getNormalizedDisability(kid.disabilityByCard, true) !== disCardVal) {
            conflictReasons.push(`ความพิการตามบัตรจริงคือ <strong>"${getNormalizedDisability(kid.disabilityByCard, true)}"</strong>`);
          }
          if (disScrVal && getNormalizedDisability(kid.disabilityByScreening, false) !== disScrVal) {
            conflictReasons.push(`ความพิการตามคัดกรองจริงคือ <strong>"${getNormalizedDisability(kid.disabilityByScreening, false)}"</strong>`);
          }

          const reasonText = conflictReasons.length > 0 
            ? `<div class="mt-1 text-xs text-amber-800 leading-relaxed">${conflictReasons.join(' • ')}</div>` 
            : `<div class="mt-1 text-xs text-amber-800 leading-relaxed">พบ ${kid.name} อยู่ในห้องเรียน <strong>"${kid.classroom || '-'}"</strong> (ครู: ${kid.teacher || '-'})</div>`;

          conflictHtml = `
            <tr>
              <td colspan="7" class="p-4 sm:p-6 text-center bg-amber-50/80 border border-amber-200/80 rounded-2xl">
                <div class="flex flex-col items-center justify-center gap-2 text-amber-900 max-w-xl mx-auto">
                  <div class="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 shadow-xs">
                    <i data-lucide="alert-triangle" class="w-5 h-5"></i>
                  </div>
                  <div class="font-bold text-sm text-amber-950">
                    พบข้อมูลนักเรียนในระบบ แต่เงื่อนไขตัวกรองไม่สัมพันธ์กัน
                  </div>
                  <div class="text-xs text-slate-700">
                    พบชื่อ <strong>"${kid.name}"</strong> ในฐานข้อมูล
                  </div>
                  ${reasonText}
                  <button type="button" onclick="clearFiltersExceptSearch()" class="mt-2 px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold shadow-xs transition flex items-center gap-1.5">
                    <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i>
                    <span>คลิกเพื่อล้างตัวกรองอื่น และแสดงข้อมูลนักเรียนทันที</span>
                  </button>
                </div>
              </td>
            </tr>
          `;
        }
      }

      if (!conflictHtml) {
        conflictHtml = `
          <tr>
            <td colspan="7" class="px-4 py-8 text-center text-gray-500 font-medium bg-white/30">
              <div class="flex flex-col items-center justify-center gap-2">
                <i data-lucide="users" class="w-8 h-8 text-gray-400"></i>
                <span>ไม่พบข้อมูลนักเรียนที่ตรงตามเงื่อนไข</span>
                <span class="text-xs text-gray-400">ลองตรวจสอบตัวสะกดชื่อ หรือกดปุ่ม "ล้างตัวกรอง" ที่เมนูด้านซ้าย</span>
              </div>
            </td>
          </tr>
        `;
      }

      tbody.append(conflictHtml);
      lucide.createIcons();
      return;
    }

    state.filteredStudents.forEach((student) => {
      // 1. Service badges
      let svcText = '';
      if (student.serviceInCenter) svcText += '<span class="px-2 py-0.5 text-[10px] bg-emerald-100 text-emerald-800 rounded-full mr-1 whitespace-nowrap">รับบริการที่ศูนย์</span>';
      if (student.serviceUnit) svcText += '<span class="px-2 py-0.5 text-[10px] bg-cyan-100 text-cyan-800 rounded-full mr-1 whitespace-nowrap">รับบริการที่หน่วยบริการ</span>';
      if (student.serviceAdjustHome) svcText += '<span class="px-2 py-0.5 text-[10px] bg-teal-100 text-teal-800 rounded-full whitespace-nowrap">รับบริการที่บ้าน</span>';
      if (!svcText) svcText = '-';

      // 2. Normalized Disability (Matching Image 3)
      const displayDis = getNormalizedDisability(student.disabilityByCard, true) !== 'ยังไม่มีบัตรคนพิการ' 
        ? getNormalizedDisability(student.disabilityByCard, true) 
        : (getNormalizedDisability(student.disabilityByScreening, false) !== 'ไม่ระบุ' 
           ? getNormalizedDisability(student.disabilityByScreening, false) 
           : '-');

      // 3. Age in years
      const age = calculateAge(student.dateOfBirth, student);
      const ageText = student.age || (age !== null ? `${age} ปี` : '-');

      // 4. Action button: ONLY "รายละเอียด" (NO edit, NO delete buttons)
      const actionButtons = `
        <button type="button" onclick="toggleStudentAccordion(${student.rowNumber})" class="p-1 px-2.5 text-xs text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition font-semibold inline-flex items-center gap-1 shadow-xs" title="คลิกเพื่อคลี่ดูข้อมูล">
          <i data-lucide="chevron-down" id="studentAccordionChevron_${student.rowNumber}" class="w-3.5 h-3.5 text-emerald-700 transition-transform duration-200"></i>
          <span>รายละเอียด</span>
        </button>
      `;

      const cardHtml = buildStudentAccordionCardHtml(student);
      const rowHtml = `
        <tr id="studentRow_${student.rowNumber}" onclick="toggleStudentAccordion(${student.rowNumber})" class="hover:bg-emerald-50/40 border-b border-emerald-100/40 transition cursor-pointer select-none">
          <td class="px-2.5 py-2 text-xs font-medium text-emerald-950">${student.name}</td>
          <td class="px-2.5 py-2 text-xs text-gray-700">${displayDis}</td>
          <td class="px-1.5 py-2 text-xs text-center font-medium text-gray-700">${ageText}</td>
          <td class="px-2.5 py-2 text-xs text-gray-700">${student.classroom || '-'}</td>
          <td class="px-2.5 py-2 text-xs text-gray-700">${svcText}</td>
          <td class="px-2.5 py-2 text-xs text-gray-700">${student.teacher || '-'}</td>
          <td class="px-2.5 py-2 text-xs text-center whitespace-nowrap">
            <div class="flex items-center justify-center gap-1" onclick="event.stopPropagation()">
              ${actionButtons}
            </div>
          </td>
        </tr>
        <tr id="studentSubRow_${student.rowNumber}" class="student-accordion-subrow hidden bg-emerald-50/20 border-b border-emerald-100/40">
          <td colspan="7" class="p-2 sm:p-3">
            ${cardHtml}
          </td>
        </tr>
      `;
      tbody.append(rowHtml);
    });

    lucide.createIcons();
  }

  // Thai Date formatting helper
  function toThaiBuddhistDateString(dobStr) {
    if (!dobStr) return "-";
    const parts = dobStr.split("/");
    if (parts.length !== 3) return dobStr;
    const d = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const y = parseInt(parts[2], 10);
    if (isNaN(d) || isNaN(m) || isNaN(y)) return dobStr;
    return d + " " + (THAI_MONTHS_SHORT[m - 1] || "") + " " + y;
  }

  // Age Calculation Helper from B.E. dob string or Column M age
  function calculateAge(dobStr, student) {
    if (student && student.age) {
      const yearMatch = student.age.match(/(\d+)\s*ปี/);
      if (yearMatch) {
        return parseInt(yearMatch[1], 10);
      }
      if (student.age.includes('เดือน')) {
        return 0; // Under 1 year old
      }
      const numMatch = student.age.match(/^\d+$/);
      if (numMatch) {
        return parseInt(student.age, 10);
      }
    }
    if (!dobStr) return null;
    const parts = dobStr.split("/");
    if (parts.length !== 3) return null;
    const d = parseInt(parts[0].trim(), 10);
    const m = parseInt(parts[1].trim(), 10);
    const y = parseInt(parts[2].trim(), 10) - 543; // BE to AD
    if (isNaN(d) || isNaN(m) || isNaN(y)) return null;

    let today = new Date(2026, 5, 19); // Default fallback
    if (state.appConfig && state.appConfig.reportDate) {
      const rParts = state.appConfig.reportDate.split("/");
      if (rParts.length === 3) {
        const rd = parseInt(rParts[0], 10);
        const rm = parseInt(rParts[1], 10);
        const ry = parseInt(rParts[2], 10) - 543;
        if (!isNaN(rd) && !isNaN(rm) && !isNaN(ry)) {
          today = new Date(ry, rm - 1, rd);
        }
      }
    }

    const birthDate = new Date(y, m - 1, d);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age < 0 ? 0 : age;
  }

  // B.E. DD/MM/YYYY to Gregorian YYYY-MM-DD
  function toGregorianDateForInput(dobStr) {
    if (!dobStr) return "";
    const parts = dobStr.split("/");
    if (parts.length !== 3) return "";
    const d = String(parts[0]).padStart(2, '0');
    const m = String(parts[1]).padStart(2, '0');
    const y = parseInt(parts[2], 10) - 543; // convert to AD
    if (isNaN(y)) return "";
    return y + "-" + m + "-" + d;
  }

  // Gregorian YYYY-MM-DD to B.E. DD/MM/YYYY
  function toBuddhistDateForSheet(gregorianStr) {
    if (!gregorianStr) return "";
    const parts = gregorianStr.split("-");
    if (parts.length !== 3) return "";
    const y = parseInt(parts[0], 10) + 543; // convert to BE
    const m = parseInt(parts[1], 10);
    const d = parseInt(parts[2], 10);
    return d + "/" + m + "/" + y;
  }

  // CRUD Operations - Form Management
  function openStudentModal(student = null) {
    state.currentEditingStudent = student;
    const modalTitle = $('#modalTitle');
    const form = $('#studentForm')[0];
    form.reset();
    
    // Refresh Select2 fields
    $('#studentClassroom').val('').trigger('change');
    $('#studentTeacher').val('').trigger('change');

    if (student) {
      modalTitle.text('แก้ไขข้อมูลนักเรียน: ' + student.name);
      
      // Populate standard inputs
      $('#studentName').val(student.name).prop('readonly', true); // Name represents key, keep readonly on edit
      $('#studentClassroom').val(student.classroom).trigger('change');
      $('#studentTeacher').val(student.teacher).trigger('change');
      
      // Service Type checkboxes
      $('#svcCenter').prop('checked', student.serviceInCenter === 1);
      $('#svcUnit').prop('checked', student.serviceUnit === 1);
      $('#svcHome').prop('checked', student.serviceAdjustHome === 1);

      // Disabilities
      $('#disabilityCard').val(student.disabilityByCard);
      $('#disabilityScreen').val(student.disabilityByScreening);

      // Documents
      $('#docCard').prop('checked', student.hasDisabilityCard === 1);
      $('#docCert').prop('checked', student.hasDisabilityCert === 1);
      $('#docScreen').prop('checked', student.hasEducationScreening === 1);

      // Date of Birth
      const gregDate = toGregorianDateForInput(student.dateOfBirth);
      $('#studentDob').val(gregDate);

      // Special & Remarks
      $('#statusLater').prop('checked', student.disabledLater === 1);
      $('#statusNonThai').prop('checked', student.nonThai === 1);
      $('#studentRemarks').val(student.remarks);
    } else {
      modalTitle.text('เพิ่มข้อมูลนักเรียนใหม่');
      $('#studentName').prop('readonly', false);
    }

    // Show modal
    $('#studentModal').removeClass('hidden').addClass('flex');
    $('body').addClass('overflow-hidden');
  }

  function closeStudentModal() {
    $('#studentModal').addClass('hidden').removeClass('flex');
    $('body').removeClass('overflow-hidden');
    state.currentEditingStudent = null;
  }

  // Triggered by row edit button Click
  window.editStudentByRow = function(rowNumber) {
    if (!state.adminToken) {
      Swal.fire({
        icon: 'warning',
        title: 'ต้องเข้าสู่ระบบ Admin',
        text: 'กรุณาเข้าสู่ระบบผู้ดูแลระบบที่เมนู Admin ก่อนแก้ไขข้อมูล',
        confirmButtonColor: '#2E7D32'
      });
      return;
    }
    const student = state.allStudents.find(s => s.rowNumber === rowNumber);
    if (student) {
      openStudentModal(student);
    }
  };

  // Submit action for creating/updating student
  function submitStudentForm() {
    if (!state.adminToken) {
      Swal.fire({
        icon: 'warning',
        title: 'ต้องเข้าสู่ระบบ Admin',
        text: 'กรุณาเข้าสู่ระบบผู้ดูแลระบบที่เมนู Admin ก่อนบันทึกข้อมูล',
        confirmButtonColor: '#2E7D32'
      });
      return;
    }
    const name = $('#studentName').val().trim();
    const classroom = $('#studentClassroom').val();
    const teacher = $('#studentTeacher').val();
    const dobInput = $('#studentDob').val();

    // Client-side quick check
    if (!name) {
      Swal.fire('ข้อผิดพลาด', 'กรุณาระบุชื่อ-สกุล นักเรียน', 'warning');
      return;
    }
    if (!classroom) {
      Swal.fire('ข้อผิดพลาด', 'กรุณาเลือกห้องเรียน/หน่วยบริการ', 'warning');
      return;
    }
    if (!teacher) {
      Swal.fire('ข้อผิดพลาด', 'กรุณาเลือกครูผู้ดูแล', 'warning');
      return;
    }
    if (!dobInput) {
      Swal.fire('ข้อผิดพลาด', 'กรุณาระบุวันเดือนปีเกิด', 'warning');
      return;
    }

    const serviceInCenter = $('#svcCenter').is(':checked') ? 1 : 0;
    const serviceUnit = $('#svcUnit').is(':checked') ? 1 : 0;
    const serviceAdjustHome = $('#svcHome').is(':checked') ? 1 : 0;

    if (!serviceInCenter && !serviceUnit && !serviceAdjustHome) {
      Swal.fire('ข้อผิดพลาด', 'กรุณาเลือกประเภทการให้บริการอย่างน้อย 1 ประเภท', 'warning');
      return;
    }

    // Compile student object
    const studentObj = {
      name: name,
      classroom: classroom,
      teacher: teacher,
      serviceInCenter: serviceInCenter,
      serviceUnit: serviceUnit,
      serviceAdjustHome: serviceAdjustHome,
      disabilityByCard: $('#disabilityCard').val().trim() || '-',
      disabilityByScreening: $('#disabilityScreen').val().trim() || '-',
      hasDisabilityCard: $('#docCard').is(':checked') ? 1 : 0,
      hasDisabilityCert: $('#docCert').is(':checked') ? 1 : 0,
      hasEducationScreening: $('#docScreen').is(':checked') ? 1 : 0,
      dateOfBirth: toBuddhistDateForSheet(dobInput),
      disabledLater: $('#statusLater').is(':checked') ? 1 : 0,
      nonThai: $('#statusNonThai').is(':checked') ? 1 : 0,
      remarks: $('#studentRemarks').val().trim() || '-'
    };

    showLoading(true);
    
    // Disable submit buttons
    $('#btnSaveForm').prop('disabled', true);

    if (state.currentEditingStudent) {
      // UPDATE Operation
      studentObj.rowNumber = state.currentEditingStudent.rowNumber;
      if (state.currentEditingStudent.studentId) {
        studentObj.studentId = state.currentEditingStudent.studentId;
      }
      
      google.script.run
        .withSuccessHandler(response => {
          showLoading(false);
          $('#btnSaveForm').prop('disabled', false);
          if (response.success) {
            closeStudentModal();
            Swal.fire({
              icon: 'success',
              title: 'สำเร็จ',
              text: response.message,
              confirmButtonColor: '#2E7D32'
            });
            loadData(); // reload sheet values
          }
        })
        .withFailureHandler(error => {
          showLoading(false);
          $('#btnSaveForm').prop('disabled', false);
          Swal.fire({
            icon: 'error',
            title: 'เกิดข้อผิดพลาดในการบันทึก',
            text: error.message || 'กรุณาลองใหม่อีกครั้ง',
            confirmButtonColor: '#2E7D32'
          });
        })
        .updateStudent(studentObj);
    } else {
      // CREATE Operation
      google.script.run
        .withSuccessHandler(response => {
          showLoading(false);
          $('#btnSaveForm').prop('disabled', false);
          if (response.success) {
            closeStudentModal();
            Swal.fire({
              icon: 'success',
              title: 'สำเร็จ',
              text: response.message,
              confirmButtonColor: '#2E7D32'
            });
            loadData(); // reload sheet values
          }
        })
        .withFailureHandler(error => {
          showLoading(false);
          $('#btnSaveForm').prop('disabled', false);
          Swal.fire({
            icon: 'error',
            title: 'เกิดข้อผิดพลาดในการบันทึก',
            text: error.message || 'กรุณาลองใหม่อีกครั้ง',
            confirmButtonColor: '#2E7D32'
          });
        })
        .createStudent(studentObj);
    }
  }

  // Triggered by row delete button Click
  window.deleteStudentByRow = function(rowNumber, studentName, studentId) {
    if (!state.adminToken) {
      Swal.fire({
        icon: 'warning',
        title: 'ต้องเข้าสู่ระบบ Admin',
        text: 'กรุณาเข้าสู่ระบบผู้ดูแลระบบที่เมนู Admin ก่อนลบข้อมูล',
        confirmButtonColor: '#2E7D32'
      });
      return;
    }
    Swal.fire({
      title: 'ยืนยันการลบข้อมูล?',
      text: `คุณต้องการลบข้อมูลของ "${studentName}" ใช่หรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้!`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d32f2f',
      cancelButtonColor: '#757575',
      confirmButtonText: 'ใช่, ต้องการลบ!',
      cancelButtonText: 'ยกเลิก'
    }).then((result) => {
      if (result.isConfirmed) {
        showLoading(true);
        google.script.run
          .withSuccessHandler(response => {
            showLoading(false);
            if (response.success) {
              Swal.fire({
                icon: 'success',
                title: 'ลบสำเร็จ',
                text: response.message,
                confirmButtonColor: '#2E7D32'
              });
              loadData(); // reload
            }
          })
          .withFailureHandler(error => {
            showLoading(false);
            Swal.fire({
              icon: 'error',
              title: 'ไม่สามารถลบข้อมูลได้',
              text: error.message || 'กรุณาลองใหม่อีกครั้ง',
              confirmButtonColor: '#2E7D32'
            });
          })
          .deleteStudent(rowNumber, studentName, studentId);
      }
    });
  };

  // Helper to normalize and group disability types
  function getNormalizedDisability(text, isCard) {
    if (!text) return isCard ? 'ยังไม่มีบัตรคนพิการ' : 'ไม่ระบุ';
    let t = text.trim();
    if (t === '-' || t === '') return isCard ? 'ยังไม่มีบัตรคนพิการ' : 'ไม่ระบุ';
    
    // Remove parentheses and their content (both half-width and full-width brackets)
    t = t.replace(/\s*[\(（].*?[\)）]/g, '').trim();
    
    // Group and standardize main categories based on keywords
    if (t.includes('สติปัญญา')) return 'บกพร่องทางสติปัญญา';
    if (t.includes('พิการซ้อน')) return 'พิการซ้อน';
    if (t.includes('ออทิสติก')) return 'บุคคลออทิสติก';
    if (t.includes('ร่างกาย') || t.includes('การเคลื่อนไหว') || t.includes('สุขภาพ')) return 'บกพร่องทางร่างกายฯ';
    if (t.includes('ไม่มีบัตร')) return 'ยังไม่มีบัตรคนพิการ';
    if (t.includes('ได้ยิน')) return 'บกพร่องทางการได้ยิน';
    if (t.includes('การเห็น') || t.includes('สายตา')) return 'บกพร่องทางการเห็น';
    if (t.includes('พฤติกรรม') || t.includes('อารมณ์')) return 'บกพร่องทางพฤติกรรมหรืออารมณ์';
    if (t.includes('การเรียนรู้')) return 'บกพร่องทางการเรียนรู้';
    if (t.includes('การสื่อสาร') || t.includes('ภาษา')) return 'บกพร่องทางการสื่อสารและภาษา';
    
    return t;
  }

  // Globally persistent color map for disability types (ensures matching colors across charts)
  const disabilityColorMap = {};
  const barColorsGlobal = [
    '#FF3D00', // Neon Red-Orange
    '#00E676', // Vibrant Green
    '#29B6F6', // Vibrant Sky Blue
    '#FFD600', // Bright Yellow
    '#AA00FF', // Purple
    '#FF1744', // Hot Pink
    '#00E5FF', // Neon Cyan
    '#FF9100', // Deep Orange
    '#651FFF', // Indigo
    '#1DE9B6', // Teal
    '#EC407A', // Light Pink
    '#AB47BC', // Medium Purple
    '#26A69A', // Pale Teal
    '#D4E157', // Lime
    '#FFA726'  // Light Orange
  ];
  let colorIndexGlobal = 0;

  function getDisabilityColor(name) {
    if (!name || name === 'ยังไม่มีบัตรคนพิการ' || name === 'ไม่ระบุ') {
      return '#94A3B8'; // Slate Gray for none/unspecified
    }
    if (disabilityColorMap[name]) {
      return disabilityColorMap[name];
    }
    const color = barColorsGlobal[colorIndexGlobal % barColorsGlobal.length];
    disabilityColorMap[name] = color;
    colorIndexGlobal++;
    return color;
  }

  // Premium dual-tone gradients for disabilities (highly vibrant & modern)
  const disabilityGradientMap = {
    'บกพร่องทางสติปัญญา': ['#FF4B2B', '#FF416C'],
    'พิการซ้อน': ['#11998e', '#38ef7d'],
    'บุคคลออทิสติก': ['#00b4db', '#0083b0'],
    'บกพร่องทางร่างกายฯ': ['#F7971E', '#FFD200'],
    'บกพร่องทางการได้ยิน': ['#9C88FF', '#AA00FF'],
    'บกพร่องทางการเห็น': ['#FF512F', '#DD2476'],
    'บกพร่องทางพฤติกรรมหรืออารมณ์': ['#48DBFB', '#00b4db'],
    'ยังไม่มีบัตรคนพิการ': ['#94A3B8', '#64748B'],
    'ไม่ระบุ': ['#94A3B8', '#64748B']
  };

  const disabilityColorCache = {};
  let fallbackColorIdx = 0;
  const fallbackColors = [
    ['#FF9F43', '#FF5252'],
    ['#48DBFB', '#1DD1A1'],
    ['#9C88FF', '#3F3198'],
    ['#FF9FF3', '#F368E0'],
    ['#10AC84', '#01A3A4']
  ];

  function getDisabilityGradientColors(name) {
    if (disabilityGradientMap[name]) {
      return disabilityGradientMap[name];
    }
    if (disabilityColorCache[name]) {
      return disabilityColorCache[name];
    }
    const colors = fallbackColors[fallbackColorIdx % fallbackColors.length];
    disabilityColorCache[name] = colors;
    fallbackColorIdx++;
    return colors;
  }

  // Render Dashboard Analytics & Charts
  function renderDashboard() {
    const list = state.filteredStudents;
    
    // 1. Calculations for Counters
    let countInCenter = 0;
    let countSvcUnit = 0;
    let countHome = 0;
    let countNonThai = 0;
    let countLater = 0;
    let countHasCard = 0;
    let countHasCert = 0;
    let countHasScreen = 0;
    
    // District statistics
    const orderedDistricts = [
      'อ. เมือง',
      'อ. แม่เมาะ',
      'อ. งาว',
      'อ. ห้างฉัตร',
      'อ. สบปราบ',
      'อ. แม่ทะ',
      'อ. เกาะคา',
      'อ. เสริมงาม',
      'อ. เถิน',
      'อ. แม่พริก',
      'อ. เมืองปาน',
      'อ. วังเหนือ',
      'อ. แจ้ห่ม'
    ];
    const districtStats = {};
    orderedDistricts.forEach(d => {
      districtStats[d] = { unit: 0, home: 0, total: 0 };
    });

    // In-center classrooms statistics
    const centerClassrooms = [
      'แสงตะวันฉาย',
      'มุ่งสู่ดวงดาว',
      'บ้านจำลองทักษะชีวิต',
      'เด่นพัฒนาการ 1',
      'เด่นพัฒนาการ 2',
      'สะพานสายรุ้ง 1',
      'สะพานสายรุ้ง 2',
      'สะพานสายรุ้ง 3',
      'ประสานสายตา 1',
      'ประสานสายตา 2',
      'วาจาสื่อสาร'
    ];
    const centerStats = {};
    centerClassrooms.forEach(c => {
      centerStats[c] = 0;
    });
    
    // Age Groups Counters
    let countAgeUnder3 = 0;
    let countAge3to6 = 0;
    let countAgeOver7 = 0;
    let countAgeUnknown = 0;
    
    // Specific Age Counter
    const specificAgeCounts = {};

    // Disability Type Maps
    const disCardCounts = {};
    const disScreenCounts = {};

    list.forEach(s => {
      if (s.serviceInCenter) countInCenter++;
      if (s.serviceUnit) countSvcUnit++;
      if (s.serviceAdjustHome) countHome++;
      if (s.nonThai) countNonThai++;
      if (s.disabledLater) countLater++;
      
      if (s.hasDisabilityCard === 1) countHasCard++;
      if (s.hasDisabilityCert === 1) countHasCert++;
      if (s.hasEducationScreening === 1) countHasScreen++;

      if (centerStats[s.classroom] !== undefined) {
        centerStats[s.classroom]++;
      }

      // Determine district from classroom name using helper
      let dist = getDistrictFromClassroom(s.classroom);

      if (districtStats[dist]) {
        if (s.serviceUnit) districtStats[dist].unit++;
        if (s.serviceAdjustHome) districtStats[dist].home++;
        districtStats[dist].total = districtStats[dist].unit + districtStats[dist].home;
      }
      
      // Calculate age using helper
      const age = calculateAge(s.dateOfBirth, s);
      if (age !== null) {
        if (age < 3) {
          countAgeUnder3++;
        } else if (age <= 6) {
          countAge3to6++;
        } else {
          countAgeOver7++;
        }
        specificAgeCounts[age] = (specificAgeCounts[age] || 0) + 1;
      } else {
        countAgeUnknown++;
      }

      // Group & Normalize Disability (by Card)
      const normCard = getNormalizedDisability(s.disabilityByCard, true);
      disCardCounts[normCard] = (disCardCounts[normCard] || 0) + 1;

      // Group & Normalize Disability (by Screening)
      const normScreen = getNormalizedDisability(s.disabilityByScreening, false);
      disScreenCounts[normScreen] = (disScreenCounts[normScreen] || 0) + 1;
    });

    // Populate DOM values
    $('#statTotal').text(list.length);
    $('#statCenter').text(countInCenter);
    $('#statSvcUnit').text(countSvcUnit);
    $('#statHome').text(countHome);
    
    $('#statNonThai').text(countNonThai);
    $('#statLater').text(countLater);
    $('#statHasCard').text(countHasCard);
    $('#statHasCert').text(countHasCert);
    $('#statHasScreen').text(countHasScreen);
    
    // Populate Age stats
    $('#statAgeUnder3').text(countAgeUnder3);
    $('#statAge3to6').text(countAge3to6);
    $('#statAgeOver7').text(countAgeOver7);
    $('#statAgeUnknown').text(countAgeUnknown);
    $('#containerAgeUnknown').toggleClass('hidden', countAgeUnknown === 0);

    // Destroy existing chart instances to re-render fresh
    Object.keys(state.dashboardCharts).forEach(key => {
      if (state.dashboardCharts[key]) {
        state.dashboardCharts[key].destroy();
      }
    });

    // Build Chart 3: Disability Type - ID Card (Horizontal Bar Chart)
    const cardLabels = Object.keys(disCardCounts).sort((a,b) => disCardCounts[b] - disCardCounts[a]);
    const cardValues = cardLabels.map(l => disCardCounts[l]);

    const ctxDisCard = document.getElementById('chartDisabilityCard').getContext('2d');
    const cardBgGradients = cardLabels.map(label => {
      const colors = getDisabilityGradientColors(label);
      const gradient = ctxDisCard.createLinearGradient(0, 0, 400, 0); // horizontal gradient
      gradient.addColorStop(0, colors[1]);
      gradient.addColorStop(1, colors[0]);
      return gradient;
    });
    const cardBorderColors = cardLabels.map(label => getDisabilityGradientColors(label)[0]);

    state.dashboardCharts.disCard = new Chart(ctxDisCard, {
      type: 'bar',
      data: {
        labels: cardLabels,
        datasets: [{
          label: 'จำนวนนักเรียน (คน)',
          data: cardValues,
          backgroundColor: cardBgGradients,
          borderColor: cardBorderColors,
          borderWidth: 1.5,
          borderRadius: 6
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        layout: {
          padding: {
            left: 20
          }
        },
        onHover: (event, chartElement) => {
          event.native.target.style.cursor = chartElement.length ? 'pointer' : 'default';
        },
        onClick: (event, activeElements, chart) => {
          if (activeElements && activeElements.length > 0) {
            const activeElement = activeElements[0];
            const dataIndex = activeElement.index;
            const label = chart.data.labels[dataIndex];
            showDrillDownDetails('disabilityCard', label);
          }
        },
        plugins: {
          legend: { display: false },
          datalabels: {
            anchor: 'end',
            align: 'end',
            offset: 4,
            color: '#1A301E',
            font: { weight: 'bold', size: 13 },
            formatter: (val) => val > 0 ? val + ' คน' : ''
          }
        },
        scales: {
          x: { 
            beginAtZero: true, 
            ticks: { precision: 0 },
            grace: '15%'
          },
          y: {
            ticks: {
              padding: 5,
              font: {
                size: 11
              }
            }
          }
        }
      }
    });

    // Build Chart 4: Disability Type - Screening (Horizontal Bar Chart)
    const screenLabels = Object.keys(disScreenCounts).sort((a,b) => disScreenCounts[b] - disScreenCounts[a]);
    const screenValues = screenLabels.map(l => disScreenCounts[l]);

    const ctxDisScreen = document.getElementById('chartDisabilityScreen').getContext('2d');
    const screenBgGradients = screenLabels.map(label => {
      const colors = getDisabilityGradientColors(label);
      const gradient = ctxDisScreen.createLinearGradient(0, 0, 400, 0); // horizontal gradient
      gradient.addColorStop(0, colors[1]);
      gradient.addColorStop(1, colors[0]);
      return gradient;
    });
    const screenBorderColors = screenLabels.map(label => getDisabilityGradientColors(label)[0]);

    state.dashboardCharts.disScreen = new Chart(ctxDisScreen, {
      type: 'bar',
      data: {
        labels: screenLabels,
        datasets: [{
          label: 'จำนวนนักเรียน (คน)',
          data: screenValues,
          backgroundColor: screenBgGradients,
          borderColor: screenBorderColors,
          borderWidth: 1.5,
          borderRadius: 6
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        layout: {
          padding: {
            left: 20
          }
        },
        onHover: (event, chartElement) => {
          event.native.target.style.cursor = chartElement.length ? 'pointer' : 'default';
        },
        onClick: (event, activeElements, chart) => {
          if (activeElements && activeElements.length > 0) {
            const activeElement = activeElements[0];
            const dataIndex = activeElement.index;
            const label = chart.data.labels[dataIndex];
            showDrillDownDetails('disabilityScreening', label);
          }
        },
        plugins: {
          legend: { display: false },
          datalabels: {
            anchor: 'end',
            align: 'end',
            offset: 4,
            color: '#1A301E',
            font: { weight: 'bold', size: 13 },
            formatter: (val) => val > 0 ? val + ' คน' : ''
          }
        },
        scales: {
          x: { 
            beginAtZero: true, 
            ticks: { precision: 0 },
            grace: '15%'
          },
          y: {
            ticks: {
              padding: 5,
              font: {
                size: 11
              }
            }
          }
        }
      }
    });

    // Build Chart 5: Specific Age (Bar Chart)
    const ageLabels = Object.keys(specificAgeCounts).sort((a, b) => parseInt(a) - parseInt(b));
    const ageValues = ageLabels.map(l => specificAgeCounts[l]);
    const displayAgeLabels = ageLabels.map(a => `${a} ปี`);

    const ctxSpecAge = document.getElementById('chartSpecificAges').getContext('2d');
    const specAgeGradient = ctxSpecAge.createLinearGradient(0, 300, 0, 0); // vertical gradient
    specAgeGradient.addColorStop(0, '#00c6ff');
    specAgeGradient.addColorStop(1, '#0072ff');

    const barColors = ageLabels.map(() => specAgeGradient);

    if (countAgeUnknown > 0) {
      displayAgeLabels.push('ไม่ระบุ');
      ageValues.push(countAgeUnknown);
      
      const greyGradient = ctxSpecAge.createLinearGradient(0, 300, 0, 0);
      greyGradient.addColorStop(0, '#94A3B8');
      greyGradient.addColorStop(1, '#64748B');
      barColors.push(greyGradient);
    }

    state.dashboardCharts.specAge = new Chart(ctxSpecAge, {
      type: 'bar',
      data: {
        labels: displayAgeLabels,
        datasets: [{
          label: 'จำนวนนักเรียน (คน)',
          data: ageValues,
          backgroundColor: barColors,
          borderColor: barColors.map(() => '#0072ff'),
          borderWidth: 1.5,
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        onHover: (event, chartElement) => {
          event.native.target.style.cursor = chartElement.length ? 'pointer' : 'default';
        },
        onClick: (event, activeElements, chart) => {
          if (activeElements && activeElements.length > 0) {
            const activeElement = activeElements[0];
            const dataIndex = activeElement.index;
            const label = chart.data.labels[dataIndex];
            showDrillDownDetails('specificAge', label);
          }
        },
        plugins: {
          legend: { display: false },
          datalabels: {
            anchor: 'end',
            align: 'end',
            offset: 4,
            color: '#1A301E',
            font: { weight: 'bold', size: 13 },
            formatter: (val) => val > 0 ? val + ' คน' : ''
          }
        },
        scales: {
          y: { 
            beginAtZero: true, 
            ticks: { precision: 0 },
            grace: '15%'
          }
        }
      }
    });

    // Render District Table
    const tableBody = $('#districtStatsTableBody').empty();
    const pinColors = [
      'text-blue-500',      // อ. เมือง
      'text-sky-400',       // อ. แม่เมาะ
      'text-orange-500',    // อ. งาว
      'text-indigo-600',    // อ. ห้างฉัตร
      'text-emerald-500',   // อ. สบปราบ
      'text-green-500',     // อ. แม่ทะ
      'text-teal-500',      // อ. เกาะคา
      'text-red-500',       // อ. เสริมงาม
      'text-emerald-600',   // อ. เถิน
      'text-green-400',     // อ. แม่พริก
      'text-pink-500',      // อ. เมืองปาน
      'text-rose-500',      // อ. วังเหนือ
      'text-red-600'        // อ. แจ้ห่ม
    ];

    let districtsTotal = 0;
    let unitTotal = 0;
    let homeTotal = 0;

    orderedDistricts.forEach((d, idx) => {
      const stats = districtStats[d];
      districtsTotal += stats.total;
      unitTotal += stats.unit;
      homeTotal += stats.home;
      const pinColor = pinColors[idx] || 'text-gray-400';
      
      let unitHtml = '';
      if (stats.unit > 0) {
        unitHtml = `<span class="px-2 py-0.5 rounded bg-cyan-100/70 text-cyan-800 text-[10px] font-bold whitespace-nowrap cursor-pointer hover:bg-cyan-200 transition active:scale-95" onclick="showDrillDownDetails('districtService', '${d}|unit')">หน่วยบริการ ${stats.unit} คน</span>`;
      }
      
      let homeHtml = '';
      if (stats.home > 0) {
        homeHtml = `<span class="px-2 py-0.5 rounded bg-teal-100/70 text-teal-800 text-[10px] font-bold whitespace-nowrap cursor-pointer hover:bg-teal-200 transition active:scale-95" onclick="showDrillDownDetails('districtService', '${d}|home')">ปรับบ้าน ${stats.home} คน</span>`;
      }

      tableBody.append(`
        <tr class="hover:bg-emerald-50/30 border-b border-emerald-100/10 transition">
          <td class="px-3 py-2.5 font-semibold text-gray-800 text-xs whitespace-nowrap cursor-pointer hover:text-emerald-800 hover:underline transition" onclick="showDrillDownDetails('district', '${d}')">
            <div class="flex items-center gap-1.5">
              <i data-lucide="map-pin" class="w-3.5 h-3.5 ${pinColor} fill-current/10"></i>
              ${d}
            </div>
          </td>
          <td class="px-2 py-2.5 text-xs whitespace-nowrap">${unitHtml}</td>
          <td class="px-2 py-2.5 text-xs whitespace-nowrap">${homeHtml}</td>
          <td class="px-3 py-2.5 text-right whitespace-nowrap">
            <span class="px-2.5 py-1 rounded-full bg-emerald-100/60 text-emerald-800 font-extrabold text-[10px] whitespace-nowrap cursor-pointer hover:bg-emerald-200 transition active:scale-95" onclick="showDrillDownDetails('district', '${d}')">
              รวม ${stats.total} คน
            </span>
          </td>
        </tr>
      `);
    });
    
    // Append the total row for districts
    tableBody.append(`
      <tr class="bg-cyan-50/20 font-bold border-t-2 border-emerald-100 transition">
        <td class="px-3 py-2.5 text-cyan-900 text-xs whitespace-nowrap cursor-pointer hover:text-cyan-850 hover:underline" onclick="showDrillDownDetails('outsideCenter', '')">
          <div class="flex items-center gap-1.5">
            <i data-lucide="globe" class="w-3.5 h-3.5 text-cyan-800"></i>
            รวมให้บริการนอกศูนย์
          </div>
        </td>
        <td class="px-2 py-2.5 text-xs whitespace-nowrap">
          <span class="px-2 py-0.5 rounded bg-cyan-100 text-cyan-800 text-[10px] font-bold whitespace-nowrap cursor-pointer hover:bg-cyan-200 transition active:scale-95" onclick="showDrillDownDetails('service', 'รับบริการที่หน่วยบริการ')">หน่วยบริการ ${unitTotal} คน</span>
        </td>
        <td class="px-2 py-2.5 text-xs whitespace-nowrap">
          <span class="px-2 py-0.5 rounded bg-teal-100 text-teal-800 text-[10px] font-bold whitespace-nowrap cursor-pointer hover:bg-teal-200 transition active:scale-95" onclick="showDrillDownDetails('service', 'รับบริการที่บ้าน')">ปรับบ้าน ${homeTotal} คน</span>
        </td>
        <td class="px-3 py-2.5 text-right whitespace-nowrap">
          <span class="px-2.5 py-1 rounded-full bg-cyan-700 text-white font-extrabold text-[10px] whitespace-nowrap cursor-pointer hover:bg-cyan-850 transition active:scale-95" onclick="showDrillDownDetails('outsideCenter', '')">
            รวม ${districtsTotal} คน
          </span>
        </td>
      </tr>
    `);

    // Render Center Classrooms Table
    const centerTableBody = $('#centerStatsTableBody').empty();
    let centerTotal = 0;
    
    const classColors = [
      'text-emerald-500',   // แสนตะวันฉาย
      'text-amber-500',     // มุ่งสู่ดวงดาว
      'text-cyan-500',      // บ้านจำลองทักษะชีวิต
      'text-indigo-500',    // เด่นพัฒนาการ 1
      'text-blue-500',      // เด่นพัฒนาการ 2
      'text-pink-500',      // สะพานสายรุ้ง 1
      'text-rose-500',      // สะพานสายรุ้ง 2
      'text-purple-500',    // สะพานสายรุ้ง 3
      'text-teal-500',      // ประสานสายตา 1
      'text-violet-500',    // ประสานสายตา 2
      'text-red-500'        // วาจาสื่อสาร
    ];

    centerClassrooms.forEach((c, idx) => {
      const count = centerStats[c];
      centerTotal += count;
      const classColor = classColors[idx] || 'text-gray-400';
      
      centerTableBody.append(`
        <tr class="hover:bg-emerald-50/30 border-b border-emerald-100/10 transition cursor-pointer" onclick="showDrillDownDetails('classroom', '${c}')">
          <td class="px-3 py-2.5 font-semibold text-gray-800 text-xs whitespace-nowrap hover:text-emerald-800 hover:underline">
            <div class="flex items-center gap-1.5">
              <i data-lucide="bookmark" class="w-3.5 h-3.5 ${classColor} fill-current/10"></i>
              ห้องเรียน${c}
            </div>
          </td>
          <td class="px-3 py-2.5 text-right whitespace-nowrap">
            <span class="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 font-bold text-[10px] hover:bg-emerald-100 transition active:scale-95">
              ${count} คน
            </span>
          </td>
        </tr>
      `);
    });
    
    // Append the total row for center
    centerTableBody.append(`
      <tr class="bg-emerald-50/20 font-bold cursor-pointer transition hover:bg-emerald-100/30" onclick="showDrillDownDetails('service', 'รับบริการที่ศูนย์')">
        <td class="px-3 py-2.5 text-emerald-900 text-xs whitespace-nowrap hover:underline">
          <div class="flex items-center gap-1.5">
            <i data-lucide="home" class="w-3.5 h-3.5 text-emerald-800"></i>
            รวมให้บริการภายในศูนย์
          </div>
        </td>
        <td class="px-3 py-2.5 text-right whitespace-nowrap">
          <span class="px-2.5 py-1 rounded-full bg-emerald-600 text-white font-extrabold text-[10px] hover:bg-emerald-700 transition active:scale-95">
            รวม ${centerTotal} คน
          </span>
        </td>
      </tr>
    `);
    
    // Re-create lucide icons for table
    lucide.createIcons();
  }

  // Helper to determine district from classroom name
  function getDistrictFromClassroom(classroomName) {
    if (!classroomName) return 'ในศูนย์ / อื่นๆ';
    if (classroomName.includes('เมืองปาน')) return 'อ. เมืองปาน';
    if (classroomName.includes('เมือง')) return 'อ. เมือง';
    if (classroomName.includes('แม่เมาะ')) return 'อ. แม่เมาะ';
    if (classroomName.includes('งาว')) return 'อ. งาว';
    if (classroomName.includes('ห้างฉัตร')) return 'อ. ห้างฉัตร';
    if (classroomName.includes('สบปราบ')) return 'อ. สบปราบ';
    if (classroomName.includes('แม่ทะ')) return 'อ. แม่ทะ';
    if (classroomName.includes('เกาะคา')) return 'อ. เกาะคา';
    if (classroomName.includes('เสริมงาม')) return 'อ. เสริมงาม';
    if (classroomName.includes('แม่พริก')) return 'อ. แม่พริก';
    if (classroomName.includes('เถิน')) {
      if (classroomName.includes('แม่พริก')) return 'อ. แม่พริก';
      return 'อ. เถิน';
    }
    if (classroomName.includes('วังเหนือ')) return 'อ. วังเหนือ';
    if (classroomName.includes('แจ้ห่ม')) return 'อ. แจ้ห่ม';
    return 'ในศูนย์ / อื่นๆ';
  }

  // Drill-down Student Details from Chart Click
  function showDrillDownDetails(type, label, showToast = true) {
    state.currentDrillDownType = type;
    let filtered = [];
    let groupTitle = '';

    if (type === 'service') {
      groupTitle = `ประเภทบริการ: ${label}`;
      filtered = state.filteredStudents.filter(s => {
        if (label === 'รับบริการที่ศูนย์' || label === 'ในศูนย์') return s.serviceInCenter === 1;
        if (label === 'รับบริการที่หน่วยบริการ' || label === 'หน่วยบริการ') return s.serviceUnit === 1;
        if (label === 'รับบริการที่บ้าน' || label === 'ปรับบ้าน') return s.serviceAdjustHome === 1;
        return false;
      });
    } else if (type === 'ageGroup') {
      groupTitle = `ช่วงอายุ: ${label}`;
      filtered = state.filteredStudents.filter(s => {
        const age = calculateAge(s.dateOfBirth, s);
        if (label === 'อายุน้อยกว่า 3 ปี') return age !== null && age < 3;
        if (label === 'อายุ 3 - 6 ปี') return age !== null && age >= 3 && age <= 6;
        if (label === 'อายุ 7 ปีขึ้นไป') return age !== null && age >= 7;
        if (label === 'ไม่ระบุวันเกิด') return age === null;
        return false;
      });
    } else if (type === 'disabilityCard') {
      groupTitle = `ความพิการ (ตามบัตรฯ): ${label}`;
      filtered = state.filteredStudents.filter(s => {
        const norm = getNormalizedDisability(s.disabilityByCard, true);
        return norm === label;
      });
    } else if (type === 'disabilityScreening') {
      groupTitle = `ความพิการ (ตามแบบคัดกรองฯ): ${label}`;
      filtered = state.filteredStudents.filter(s => {
        const norm = getNormalizedDisability(s.disabilityByScreening, false);
        return norm === label;
      });
    } else if (type === 'specificAge') {
      groupTitle = `อายุรายปี: ${label}`;
      const targetAgeStr = label.replace(' ปี', '');
      filtered = state.filteredStudents.filter(s => {
        const age = calculateAge(s.dateOfBirth, s);
        if (targetAgeStr === 'ไม่ระบุ') return age === null;
        return age === parseInt(targetAgeStr, 10);
      });
    } else if (type === 'total') {
      groupTitle = 'นักเรียนทั้งหมด (ตามตัวกรอง)';
      filtered = state.filteredStudents;
    } else if (type === 'hasCard') {
      groupTitle = 'ความสมบูรณ์ของเอกสาร: มีบัตรประจำตัวคนพิการ';
      filtered = state.filteredStudents.filter(s => s.hasDisabilityCard === 1);
    } else if (type === 'hasCert') {
      groupTitle = 'ความสมบูรณ์ของเอกสาร: มีเอกสารรับรองความพิการ';
      filtered = state.filteredStudents.filter(s => s.hasDisabilityCert === 1);
    } else if (type === 'hasScreen') {
      groupTitle = 'ความสมบูรณ์ของเอกสาร: มีแบบคัดกรองทางการศึกษา';
      filtered = state.filteredStudents.filter(s => s.hasEducationScreening === 1);
    } else if (type === 'district') {
      groupTitle = `อำเภอ: ${label}`;
      filtered = state.filteredStudents.filter(s => getDistrictFromClassroom(s.classroom) === label);
    } else if (type === 'districtService') {
      const parts = label.split('|');
      const distName = parts[0];
      const svcType = parts[1];
      const svcLabel = svcType === 'unit' ? 'หน่วยบริการ' : 'ปรับบ้าน';
      groupTitle = `บริการนอกศูนย์: ${distName} (${svcLabel})`;
      filtered = state.filteredStudents.filter(s => {
        if (getDistrictFromClassroom(s.classroom) !== distName) return false;
        if (svcType === 'unit') return s.serviceUnit === 1;
        if (svcType === 'home') return s.serviceAdjustHome === 1;
        return false;
      });
    } else if (type === 'classroom') {
      groupTitle = `ห้องเรียน: ${label}`;
      filtered = state.filteredStudents.filter(s => s.classroom === label);
    } else if (type === 'outsideCenter') {
      groupTitle = 'นักเรียนที่รับบริการนอกศูนย์ (ทั้งหมด)';
      filtered = state.filteredStudents.filter(s => s.serviceUnit === 1 || s.serviceAdjustHome === 1);
    }

    const tbody = $('#drillDownTableBody').empty();
    if (filtered.length === 0) {
      tbody.append('<tr><td colspan="6" class="px-4 py-6 text-center text-gray-400">ไม่พบข้อมูลนักเรียนในกลุ่มนี้</td></tr>');
    } else {
      filtered.forEach(s => {
        let svcText = '';
        if (s.serviceInCenter) svcText += '<span class="px-2 py-0.5 text-[10px] bg-emerald-100 text-emerald-800 rounded-full mr-1">รับบริการที่ศูนย์</span>';
        if (s.serviceUnit) svcText += '<span class="px-2 py-0.5 text-[10px] bg-cyan-100 text-cyan-800 rounded-full mr-1">รับบริการที่หน่วยบริการ</span>';
        if (s.serviceAdjustHome) svcText += '<span class="px-2 py-0.5 text-[10px] bg-teal-100 text-teal-800 rounded-full">รับบริการที่บ้าน</span>';
        if (!svcText) svcText = '-';

        const displayDis = getNormalizedDisability(s.disabilityByCard, true) !== 'ยังไม่มีบัตรคนพิการ' 
          ? getNormalizedDisability(s.disabilityByCard, true) 
          : (getNormalizedDisability(s.disabilityByScreening, false) !== 'ไม่ระบุ' 
             ? getNormalizedDisability(s.disabilityByScreening, false) 
             : '-');

        const age = calculateAge(s.dateOfBirth, s);
        const ageText = s.age || (age !== null ? `${age} ปี` : 'ไม่ระบุ');

        tbody.append(`
          <tr class="hover:bg-emerald-50/20 border-b border-emerald-100/20 transition">
            <td class="px-4 py-2 font-medium text-emerald-950">${s.name}</td>
            <td class="px-4 py-2">${displayDis}</td>
            <td class="px-4 py-2 text-center font-medium">${ageText}</td>
            <td class="px-4 py-2">${s.classroom}</td>
            <td class="px-4 py-2">${svcText}</td>
            <td class="px-4 py-2">${s.teacher}</td>
          </tr>
        `);
      });
    }

    $('#drillDownGroupTitle').text(groupTitle);
    $('#chartDrillDownContainer').removeClass('hidden');
    
    lucide.createIcons();

    // Show toast notification only when invoked from user click, avoiding spam on live keystrokes
    if (showToast) {
      Swal.fire({
        toast: true,
        position: 'bottom-end',
        icon: 'info',
        title: 'แสดงรายละเอียดด้านล่าง',
        showConfirmButton: false,
        timer: 2000,
        background: '#0f172a',
        color: '#ffffff',
        iconColor: '#38bdf8'
      });
    }
  }

  // ----------------------------------------------------
  // Drag and Drop Pivot Table Builder Engine
  // ----------------------------------------------------
  
  function setupDragAndDrop() {
    const cards = document.querySelectorAll('.pivot-field-card');
    const dropzones = document.querySelectorAll('.pivot-dropzone');

    cards.forEach(card => {
      card.addEventListener('dragstart', handleDragStart);
      card.addEventListener('dragend', handleDragEnd);
    });

    dropzones.forEach(zone => {
      zone.addEventListener('dragover', handleDragOver);
      zone.addEventListener('dragenter', handleDragEnter);
      zone.addEventListener('dragleave', handleDragLeave);
      zone.addEventListener('drop', handleDrop);
    });
  }

  function handleDragStart(e) {
    e.dataTransfer.setData('text/plain', e.target.dataset.field);
    e.target.classList.add('dragging');
    
    // Custom ghost drag representation
    const ghost = document.createElement('div');
    ghost.classList.add('drag-ghost');
    ghost.innerHTML = `<i data-lucide="grip-vertical" class="w-4 h-4"></i> ${e.target.textContent}`;
    document.body.appendChild(ghost);
    lucide.createIcons({attrs: {class: 'w-4 h-4'}});
    
    // Set offset and draw
    e.dataTransfer.setDragImage(ghost, 20, 20);
    
    // Remove ghost node from DOM on next tick so it doesn't clutter layout
    setTimeout(() => ghost.remove(), 0);
  }

  function handleDragEnd(e) {
    e.target.classList.remove('dragging');
  }

  function handleDragOver(e) {
    e.preventDefault();
  }

  function handleDragEnter(e) {
    e.preventDefault();
    $(this).addClass('drag-over');
  }

  function handleDragLeave(e) {
    $(this).removeClass('drag-over');
  }

  function handleDrop(e) {
    e.preventDefault();
    $(this).removeClass('drag-over');
    
    const field = e.dataTransfer.getData('text/plain');
    const zoneId = $(this).attr('id');

    if (zoneId === 'pivotRowZone') {
      // Add to rows, remove from cols if present
      if (state.pivotRows.indexOf(field) === -1) {
        state.pivotRows.push(field);
        state.pivotCols = state.pivotCols.filter(f => f !== field);
      }
    } else if (zoneId === 'pivotColZone') {
      // Add to cols, remove from rows if present
      if (state.pivotCols.indexOf(field) === -1) {
        state.pivotCols.push(field);
        state.pivotRows = state.pivotRows.filter(f => f !== field);
      }
    }

    updatePivotSelectionUI();
    renderPivotTable();
  }

  // Update visual tokens representing selected dimensions in Row/Col boxes
  function updatePivotSelectionUI() {
    const fieldLabels = {
      classroom: 'ห้องเรียน',
      teacher: 'ครูผู้รับผิดชอบ',
      serviceType: 'ประเภทบริการ',
      disabilityType: 'ความพิการ (บัตร)',
      disabilityScreen: 'ความพิการ (คัดกรอง)',
      ageGroup: 'ช่วงอายุ',
      specificAge: 'อายุรายปี',
      nationality: 'สัญชาติ',
      disabilityOnset: 'การเกิดความพิการ'
    };

    // Render Rows
    const rowContainer = $('#pivotRowZone').empty();
    if (state.pivotRows.length === 0) {
      rowContainer.append('<div class="text-gray-400 text-xs text-center py-6">ลากมิติข้อมูลมาวางที่นี่ (แนวตั้ง)</div>');
    } else {
      state.pivotRows.forEach(f => {
        rowContainer.append(`
          <div class="inline-flex items-center gap-1.5 bg-emerald-100 border border-emerald-300 text-emerald-800 px-3 py-1.5 rounded-xl text-sm font-medium shadow-sm">
            <i data-lucide="menu" class="w-3.5 h-3.5"></i>
            <span>${fieldLabels[f]}</span>
            <button onclick="removePivotField('row', '${f}')" class="hover:text-red-600 transition ml-1">
              <i data-lucide="x" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        `);
      });
    }

    // Render Cols
    const colContainer = $('#pivotColZone').empty();
    if (state.pivotCols.length === 0) {
      colContainer.append('<div class="text-gray-400 text-xs text-center py-6">ลากมิติข้อมูลมาวางที่นี่ (แนวนอน)</div>');
    } else {
      state.pivotCols.forEach(f => {
        colContainer.append(`
          <div class="inline-flex items-center gap-1.5 bg-cyan-100 border border-cyan-300 text-cyan-800 px-3 py-1.5 rounded-xl text-sm font-medium shadow-sm">
            <i data-lucide="columns" class="w-3.5 h-3.5"></i>
            <span>${fieldLabels[f]}</span>
            <button onclick="removePivotField('col', '${f}')" class="hover:text-red-600 transition ml-1">
              <i data-lucide="x" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        `);
      });
    }

    lucide.createIcons();
  }

  // Remove dimension from Pivot Box
  window.removePivotField = function(zone, field) {
    if (zone === 'row') {
      state.pivotRows = state.pivotRows.filter(f => f !== field);
    } else {
      state.pivotCols = state.pivotCols.filter(f => f !== field);
    }
    updatePivotSelectionUI();
    renderPivotTable();
  };

  // Helper to extract value from student based on field ID
  function getStudentValueForField(student, field) {
    if (field === 'classroom') return student.classroom || 'ไม่ระบุห้อง';
    if (field === 'teacher') return student.teacher || 'ไม่ระบุครู';
    if (field === 'disabilityType') return getNormalizedDisability(student.disabilityByCard, true);
    if (field === 'disabilityScreen') return getNormalizedDisability(student.disabilityByScreening, false);
    if (field === 'serviceType') {
      // Composite label representing service
      if (student.serviceInCenter) return 'รับบริการที่ศูนย์';
      if (student.serviceUnit) return 'รับบริการที่หน่วยบริการ';
      if (student.serviceAdjustHome) return 'รับบริการที่บ้าน';
      return 'ไม่ระบุบริการ';
    }
    if (field === 'ageGroup') {
      const age = calculateAge(student.dateOfBirth, student);
      if (age === null) return 'ไม่ระบุ';
      if (age < 3) return 'อายุน้อยกว่า 3 ปี';
      if (age <= 6) return 'อายุ 3 - 6 ปี';
      return 'อายุ 7 ปีขึ้นไป';
    }
    if (field === 'specificAge') {
      const age = calculateAge(student.dateOfBirth, student);
      return age !== null ? age + ' ปี' : 'ไม่ระบุ';
    }
    if (field === 'nationality') {
      return student.nonThai === 1 ? 'ไม่ใช่สัญชาติไทย' : 'สัญชาติไทย';
    }
    if (field === 'disabilityOnset') {
      return student.disabledLater === 1 ? 'พิการภายหลัง' : 'พิการแต่กำเนิด';
    }
    return 'อื่นๆ';
  }

  // Pivot Engine: dynamic cross tabulation calculation and table generation
  function getPivotFieldLabel(field) {
    const labels = {
      classroom: 'ห้องเรียน',
      teacher: 'ครูผู้รับผิดชอบ',
      serviceType: 'ประเภทบริการ',
      disabilityType: 'ความพิการ (บัตร)',
      disabilityScreen: 'ความพิการ (คัดกรอง)',
      ageGroup: 'ช่วงอายุ',
      specificAge: 'อายุรายปี',
      nationality: 'สัญชาติ',
      disabilityOnset: 'การเกิดความพิการ'
    };
    return labels[field] || field;
  }

  // Pivot Engine: dynamic cross tabulation calculation and table generation
  function renderPivotTable() {
    const container = $('#pivotTableContainer').empty();
    const chartCard = $('#pivotChartCard');
    
    // Hide chart if table is empty
    chartCard.addClass('hidden');

    if (state.pivotRows.length === 0 && state.pivotCols.length === 0) {
      container.append(`
        <div class="flex flex-col items-center justify-center py-16 text-gray-500 text-center">
          <div class="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 border border-emerald-100 shadow-inner mb-4">
            <i data-lucide="table-2" class="w-8 h-8"></i>
          </div>
          <h4 class="font-semibold text-lg text-emerald-800 mb-1">ยินดีต้อนรับสู่ตารางความสัมพันธ์ของข้อมูล</h4>
          <p class="text-sm text-gray-500 max-w-sm">กรุณาลากมิติตัวแปรด้านบนไปวางลงในกล่อง แถว (แนวตั้ง) หรือ คอลัมน์ (แนวนอน) เพื่อแสดงผลตารางความสัมพันธ์ของข้อมูลผู้เรียน</p>
        </div>
      `);
      lucide.createIcons();
      return;
    }

    const students = state.filteredStudents;
    
    // If no students match filters, display notice
    if (students.length === 0) {
      container.append('<div class="text-center py-12 text-gray-500 font-medium bg-white/30 rounded-xl">ไม่มีข้อมูลสำหรับการสร้างตารางความสัมพันธ์ของข้อมูลผู้เรียนในช่วงตัวกรองนี้</div>');
      return;
    }

    // Step 1: Map rows & columns dimensions
    // Build combinations of keys for rows & columns
    const rowCombinations = {};
    const colCombinations = {};
    const dataMap = {}; // Key format: `rowKey|||colKey` -> Count

    students.forEach(student => {
      // Row Key
      let rowKey = 'รวม';
      if (state.pivotRows.length > 0) {
        rowKey = state.pivotRows.map(f => getStudentValueForField(student, f)).join(' / ');
      }
      rowCombinations[rowKey] = (rowCombinations[rowKey] || 0) + 1;

      // Col Key
      let colKey = 'จำนวนคน';
      if (state.pivotCols.length > 0) {
        colKey = state.pivotCols.map(f => getStudentValueForField(student, f)).join(' / ');
      }
      colCombinations[colKey] = (colCombinations[colKey] || 0) + 1;

      // Map Count
      const mapKey = rowKey + '|||' + colKey;
      dataMap[mapKey] = (dataMap[mapKey] || 0) + 1;
    });

    const rowKeys = Object.keys(rowCombinations).sort((a, b) => {
      if (state.pivotRows[0] === 'classroom') {
        const idxA = state.classrooms.indexOf(a.split(' / ')[0]);
        const idxB = state.classrooms.indexOf(b.split(' / ')[0]);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      }
      return a.localeCompare(b, 'th');
    });
    const colKeys = Object.keys(colCombinations).sort((a, b) => {
      if (state.pivotCols[0] === 'classroom') {
        const idxA = state.classrooms.indexOf(a.split(' / ')[0]);
        const idxB = state.classrooms.indexOf(b.split(' / ')[0]);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      }
      return a.localeCompare(b, 'th');
    });

    // Step 2: Build HTML Table Structure
    let tableHtml = `
      <div class="table-container shadow-inner border border-emerald-100/40 bg-white/20">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="border-b border-emerald-200/50">
              <th class="px-6 py-4 font-semibold text-emerald-800 text-sm">
                ${state.pivotRows.length > 0 ? state.pivotRows.map(getPivotFieldLabel).join(' / ') : 'รวมทั้งหมด'}
              </th>
    `;

    // Columns headers
    colKeys.forEach(colKey => {
      tableHtml += `<th class="px-6 py-4 font-semibold text-emerald-800 text-sm text-center">${colKey}</th>`;
    });
    tableHtml += `<th class="px-6 py-4 font-semibold text-emerald-900 text-sm text-center bg-emerald-500/10">รวมทั้งหมด</th></tr></thead><tbody>`;

    // Row by Row data rendering
    const colTotals = {};
    let grandTotal = 0;

    rowKeys.forEach(rowKey => {
      tableHtml += `<tr class="hover:bg-white/40 border-b border-emerald-100/40"><td class="px-6 py-3.5 text-sm font-semibold text-gray-700">${rowKey}</td>`;
      
      let rowTotal = 0;
      colKeys.forEach(colKey => {
        const count = dataMap[rowKey + '|||' + colKey] || 0;
        rowTotal += count;
        colTotals[colKey] = (colTotals[colKey] || 0) + count;
        
        tableHtml += `<td class="px-6 py-3.5 text-sm text-gray-700 text-center">${count > 0 ? count : '-'}</td>`;
      });
      
      grandTotal += rowTotal;
      tableHtml += `<td class="px-6 py-3.5 text-sm font-bold text-emerald-900 text-center bg-emerald-500/10">${rowTotal}</td></tr>`;
    });

    // Grand Totals Row (Footer)
    tableHtml += `
      <tr class="bg-emerald-500/10 font-bold border-t border-emerald-200">
        <td class="px-6 py-4 text-sm text-emerald-900">รวมทั้งหมด</td>
    `;

    colKeys.forEach(colKey => {
      const colSum = colTotals[colKey] || 0;
      tableHtml += `<td class="px-6 py-4 text-sm text-emerald-900 text-center">${colSum}</td>`;
    });

    tableHtml += `<td class="px-6 py-4 text-sm text-emerald-950 text-center bg-emerald-500/20">${grandTotal}</td></tr></tbody></table></div>`;
    container.append(tableHtml);

    // Step 3: Draw Pivot Chart (if there is data to display)
    chartCard.removeClass('hidden');
    drawPivotChart(rowKeys, colKeys, dataMap);
  }

  // Draw or update Chart.js associated with the active Pivot Table
  function drawPivotChart(rowKeys, colKeys, dataMap) {
    const ctx = document.getElementById('chartPivot').getContext('2d');
    
    if (state.pivotChart) {
      state.pivotChart.destroy();
    }

    // Colors mapping list - Vibrant solid colors
    const chartColors = [
      '#FF3D00', // Neon Red-Orange
      '#00E676', // Vibrant Green
      '#29B6F6', // Vibrant Sky Blue
      '#FFD600', // Bright Yellow
      '#AA00FF', // Purple
      '#FF1744', // Hot Pink
      '#00E5FF', // Neon Cyan
      '#FF9100'  // Deep Orange
    ];

    // Datasets generation: One dataset per column key
    const datasets = colKeys.map((colKey, index) => {
      const data = rowKeys.map(rowKey => dataMap[rowKey + '|||' + colKey] || 0);
      return {
        label: colKey,
        data: data,
        backgroundColor: chartColors[index % chartColors.length],
        borderColor: chartColors[index % chartColors.length],
        borderWidth: 1.5,
        borderRadius: 6
      };
    });

    state.pivotChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: rowKeys,
        datasets: datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom' },
          tooltip: { mode: 'index', intersect: false },
          datalabels: {
            anchor: 'center',
            align: 'center',
            color: '#ffffff',
            textShadowColor: 'rgba(0, 0, 0, 0.6)',
            textShadowBlur: 4,
            font: { weight: 'bold', size: 12 },
            formatter: (val) => val > 0 ? val + ' คน' : ''
          }
        },
        scales: {
          x: { stacked: true },
          y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } }
        }
      }
    });
  }

  // Export functions (PDF/Excel mockup/Alert message)
  window.exportPivot = function(format) {
    if (state.filteredStudents.length === 0) {
      Swal.fire('ข้อผิดพลาด', 'ไม่มีข้อมูลสำหรับการส่งออก!', 'warning');
      return;
    }

    showLoading(true);
    
    // Simulate compilation
    setTimeout(() => {
      showLoading(false);
      Swal.fire({
        icon: 'success',
        title: 'ส่งออกข้อมูลสำเร็จ',
        text: `ทำการส่งออกรายงานสารสนเทศในรูปแบบไฟล์ ${format.toUpperCase()} เรียบร้อยแล้ว`,
        confirmButtonColor: '#2E7D32'
      });
    }, 1200);
  };

  // ========================================================
  // SET EXCEL IMPORTER & ADMIN PREVIEW (PHASE 1)
  // ========================================================

  function initSetImportEvents() {
    // 1. Admin Sub-Navigation Tabs
    $('#adminTabBtnGeneral').click(function() {
      $(this).addClass('bg-emerald-700 text-white shadow-sm').removeClass('text-gray-600 hover:bg-white/50 hover:text-emerald-800');
      $('#adminTabBtnSetImport').removeClass('bg-emerald-700 text-white shadow-sm').addClass('text-gray-600 hover:bg-white/50 hover:text-emerald-800');
      $('#adminTabPanelGeneral').removeClass('hidden');
      $('#adminTabPanelSetImport').addClass('hidden');
    });

    $('#adminTabBtnSetImport').click(function() {
      $(this).addClass('bg-emerald-700 text-white shadow-sm').removeClass('text-gray-600 hover:bg-white/50 hover:text-emerald-800');
      $('#adminTabBtnGeneral').removeClass('bg-emerald-700 text-white shadow-sm').addClass('text-gray-600 hover:bg-white/50 hover:text-emerald-800');
      $('#adminTabPanelGeneral').addClass('hidden');
      $('#adminTabPanelSetImport').removeClass('hidden');
      if (typeof lucide !== 'undefined') lucide.createIcons();
    });

    // 2. File Input Handlers
    $('#setFileGeneral').on('change', function(e) {
      const file = e.target.files[0];
      if (file) handleSetFileUpload(file, 'general');
    });

    $('#setFileAddress').on('change', function(e) {
      const file = e.target.files[0];
      if (file) handleSetFileUpload(file, 'address');
    });

    $('#setFileLink').on('change', function(e) {
      const file = e.target.files[0];
      if (file) handleSetFileUpload(file, 'link');
    });

    // 3. Action Buttons
    $('#btnRunSetPreview').click(function() {
      executeSetImportPreview();
    });

    $('#btnLoadMockSetData').click(function() {
      loadMockSetData();
    });

    $('#btnClearSetData').click(function() {
      clearSetImportState();
    });

    // 4. Category Cards & Tab Filtering
    $(document).on('click', '.set-category-card', function() {
      const category = $(this).data('category');
      setCategoryFilter(category);
    });

    $(document).on('click', '.set-filter-tab', function() {
      const filter = $(this).data('filter');
      setCategoryFilter(filter);
    });

    // 5. In-table Search
    $('#setSearchInput').on('input', function() {
      renderSetPreviewTable();
    });

    // 6. PII Masking Toggle
    $('#btnTogglePiiMask').click(function() {
      state.setImport.maskPii = !state.setImport.maskPii;
      const btn = $(this);
      const icon = $('#iconPiiMask');
      const text = $('#textPiiMask');

      if (state.setImport.maskPii) {
        text.text('ซ่อนเลขบัตรประชาชน (Masked)');
        icon.attr('data-lucide', 'eye');
        btn.removeClass('bg-amber-100 text-amber-900 border-amber-300').addClass('text-gray-700');
      } else {
        text.text('แสดงเลขบัตรประชาชน (Unmasked)');
        icon.attr('data-lucide', 'eye-off');
        btn.addClass('bg-amber-100 text-amber-900 border-amber-300').removeClass('text-gray-700');
      }
      if (typeof lucide !== 'undefined') lucide.createIcons();
      renderSetPreviewTable();
    });

    // 7. Diff Detail Modal Events
    $(document).on('click', '.btn-view-set-diff', function() {
      const index = $(this).data('index');
      const category = $(this).data('category');
      openSetDiffModal(category, index);
    });

    $('#btnCloseSetDiffModal, #btnCloseSetDiffModalBtn').click(function() {
      $('#setDiffModal').addClass('hidden');
    });

    $('#setDiffModal').click(function(e) {
      if ($(e.target).is('#setDiffModal')) {
        $('#setDiffModal').addClass('hidden');
      }
    });
  }

  // Handle Reading & Validating Excel file client-side
  function handleSetFileUpload(file, reportType) {
    if (typeof XLSX === 'undefined') {
      Swal.fire('ข้อผิดพลาด', 'ไม่พบไลบรารี SheetJS (XLSX) กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true, raw: false });
        if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
          throw new Error('ไม่พบแผ่นงาน (Sheet) ในไฟล์ Excel ที่เลือก');
        }

        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = SETImporter.extractRowsFromSheet(firstSheet);
        if (rows.length === 0) {
          throw new Error('ไฟล์ที่เลือกไม่มีข้อมูล (แถวว่างเปล่า)');
        }

        const headers = Object.keys(rows[0]);
        const validation = SETImporter.validateReportHeaders(reportType, headers);

        if (reportType === 'general') {
          state.setImport.generalRows = rows;
          state.setImport.generalHeaders = headers;
          state.setImport.generalMapping = validation.detected;

          $('#fileInfoGeneral').text(`${file.name} (${rows.length} รายการ, ${headers.length} คอลัมน์)`);
          if (validation.valid) {
            $('#badgeSetGeneral').removeClass('bg-gray-100 text-gray-600 bg-red-100 text-red-700').addClass('bg-emerald-100 text-emerald-800').text(`✓ ${rows.length} แถว`);
          } else {
            $('#badgeSetGeneral').removeClass('bg-gray-100 text-gray-600 bg-emerald-100 text-emerald-800').addClass('bg-red-100 text-red-700').text('⚠️ คอลัมน์ไม่ครบ');
          }
        } else if (reportType === 'address') {
          state.setImport.addressRows = rows;
          state.setImport.addressHeaders = headers;
          state.setImport.addressMapping = validation.detected;

          $('#fileInfoAddress').text(`${file.name} (${rows.length} รายการ, ${headers.length} คอลัมน์)`);
          if (validation.valid) {
            $('#badgeSetAddress').removeClass('bg-gray-100 text-gray-600 bg-red-100 text-red-700').addClass('bg-emerald-100 text-emerald-800').text(`✓ ${rows.length} แถว`);
          } else {
            $('#badgeSetAddress').removeClass('bg-gray-100 text-gray-600 bg-emerald-100 text-emerald-800').addClass('bg-red-100 text-red-700').text('⚠️ คอลัมน์ไม่ครบ');
          }
        } else if (reportType === 'link') {
          state.setImport.linkRows = rows;
          state.setImport.linkHeaders = headers;
          state.setImport.linkMapping = validation.detected;

          $('#fileInfoLink').text(`${file.name} (${rows.length} รายการ, ${headers.length} คอลัมน์)`);
          if (validation.valid) {
            $('#badgeSetLink').removeClass('bg-gray-100 text-gray-500').addClass('bg-emerald-100 text-emerald-800').text(`✓ ${rows.length} แถว`);
          }
        }

        // Show warnings/errors if any
        displayValidationAlerts(reportType, validation);

        // Check if we can enable Run Preview button (supports both full name and separate first/last name)
        const isGeneralValid = SETImporter.canEnablePreview({
          detected: state.setImport.generalMapping,
          errors: (reportType === 'general' ? validation.errors : [])
        });
        $('#btnRunSetPreview').prop('disabled', !isGeneralValid || state.setImport.generalRows.length === 0);

      } catch (err) {
        Swal.fire('ข้อผิดพลาดในการอ่านไฟล์', err.message, 'error');
      }
    };

    reader.readAsArrayBuffer(file);
  }

  function displayValidationAlerts(reportType, validation) {
    const alertBox = $('#setValidationAlertBox');
    if (!validation.errors.length && !validation.warnings.length) {
      alertBox.addClass('hidden');
      return;
    }

    let html = '';
    if (validation.errors.length) {
      html += `<div class="text-xs text-red-700 font-bold flex items-center gap-1.5"><i data-lucide="alert-circle" class="w-4 h-4 text-red-600"></i> ข้อผิดพลาดคอลัมน์ (${reportType}): ${SETImporter.escapeHtml(validation.errors.join(', '))}</div>`;
    }
    if (validation.warnings.length) {
      html += `<div class="text-xs text-amber-700 flex items-center gap-1.5"><i data-lucide="alert-triangle" class="w-4 h-4 text-amber-600"></i> คำแนะนำ (${reportType}): ${SETImporter.escapeHtml(validation.warnings.join(', '))}</div>`;
    }

    alertBox.html(html).removeClass('hidden').addClass('bg-amber-500/10 border-amber-300');
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  // Execute SET Data Preview
  function executeSetImportPreview() {
    if (!state.setImport.generalRows || state.setImport.generalRows.length === 0) {
      Swal.fire('แจ้งเตือน', 'กรุณาเลือกไฟล์รายงานข้อมูลนักเรียน (ไฟล์ที่ 1) ก่อนเริ่มประมวลผล', 'warning');
      return;
    }

    showLoading(true);

    setTimeout(() => {
      try {
        // 1. Normalize Rows (including Report 3 link rows with Thai headers)
        const normalizedGen = state.setImport.generalRows.map(r => SETImporter.normalizeSetGeneralRow(r, state.setImport.generalMapping));
        const normalizedAddr = state.setImport.addressRows.map(r => SETImporter.normalizeSetAddressRow(r, state.setImport.addressMapping));
        const normalizedLink = state.setImport.linkRows.map(r => SETImporter.normalizeSetLinkRow(r, state.setImport.linkMapping));

        // 2. Multi-report join
        const joinResult = SETImporter.joinSetReports(normalizedGen, normalizedAddr, normalizedLink);

        // 3. Diff Comparison with Google Sheets
        const refDate = state.appConfig ? state.appConfig.reportDate : '';
        const diffResult = SETImporter.compareWithGoogleSheets(joinResult.joined, state.allStudents, refDate);

        // Merge join invalid rows into diff invalid
        if (joinResult.invalid && joinResult.invalid.length > 0) {
          diffResult.invalid = diffResult.invalid.concat(joinResult.invalid.map(inv => ({
            set: inv,
            status: 'invalid',
            description: inv.errors.join(', ')
          })));
          diffResult.summary.invalidCount = diffResult.invalid.length;
        }

        state.setImport.diffResult = diffResult;
        state.setImport.joinedRecords = joinResult.joined;

        // 4. Update UI Counters
        updateSetPreviewCounters(diffResult.summary);

        // 5. Render Table
        state.setImport.activeCategoryFilter = 'all';
        renderSetPreviewTable();

        // 6. Show Results Container
        $('#setPreviewResultsContainer').removeClass('hidden');

        showLoading(false);

        // Scroll to results
        $('html, body').animate({
          scrollTop: $('#setPreviewResultsContainer').offset().top - 80
        }, 500);

      } catch (err) {
        showLoading(false);
        Swal.fire('เกิดข้อผิดพลาดในการประมวลผล', err.message, 'error');
      }
    }, 200);
  }

  // Update Summary Badges and Tab Counters
  function updateSetPreviewCounters(summary) {
    $('#countNewInSet').text(summary.newCount);
    $('#countUpdatedDiff').text(summary.updatedCount);
    $('#countMatched').text(summary.matchedCount);
    $('#countSheetsOnly').text(summary.sheetsOnlyCount);
    $('#countUnmatched').text(summary.unmatchedCount);
    $('#countInvalid').text(summary.invalidCount);

    const totalAll = summary.newCount + summary.updatedCount + summary.matchedCount + summary.sheetsOnlyCount + summary.unmatchedCount + summary.invalidCount;
    $('#tabCountAll').text(totalAll);
    $('#tabCountNew').text(summary.newCount);
    $('#tabCountUpdated').text(summary.updatedCount);
    $('#tabCountMatched').text(summary.matchedCount);
    $('#tabCountSheetsOnly').text(summary.sheetsOnlyCount);
    $('#tabCountUnmatched').text(summary.unmatchedCount);
    $('#tabCountInvalid').text(summary.invalidCount);
  }

  // Switch Category Filter
  function setCategoryFilter(category) {
    state.setImport.activeCategoryFilter = category;

    // Update tab styles
    $('.set-filter-tab').removeClass('bg-emerald-700 text-white font-bold').addClass('text-gray-600 font-medium');
    $(`.set-filter-tab[data-filter="${category}"]`).addClass('bg-emerald-700 text-white font-bold').removeClass('text-gray-600 font-medium');

    renderSetPreviewTable();
  }

  // Render Table of Preview Records
  function renderSetPreviewTable() {
    const diff = state.setImport.diffResult;
    if (!diff) return;

    const category = state.setImport.activeCategoryFilter;
    const search = ($('#setSearchInput').val() || '').trim().toLowerCase();

    // Collect records based on active filter
    let records = [];
    if (category === 'all') {
      records = [
        ...diff.newInSet.map((item, idx) => ({ ...item, category: 'new', categoryIndex: idx })),
        ...diff.updatedDiff.map((item, idx) => ({ ...item, category: 'updated', categoryIndex: idx })),
        ...diff.matched.map((item, idx) => ({ ...item, category: 'matched', categoryIndex: idx })),
        ...diff.sheetsOnly.map((item, idx) => ({ ...item, category: 'sheets_only', categoryIndex: idx })),
        ...diff.unmatched.map((item, idx) => ({ ...item, category: 'unmatched', categoryIndex: idx })),
        ...diff.invalid.map((item, idx) => ({ ...item, category: 'invalid', categoryIndex: idx }))
      ];
    } else if (category === 'new') {
      records = diff.newInSet.map((item, idx) => ({ ...item, category: 'new', categoryIndex: idx }));
    } else if (category === 'updated') {
      records = diff.updatedDiff.map((item, idx) => ({ ...item, category: 'updated', categoryIndex: idx }));
    } else if (category === 'matched') {
      records = diff.matched.map((item, idx) => ({ ...item, category: 'matched', categoryIndex: idx }));
    } else if (category === 'sheets_only') {
      records = diff.sheetsOnly.map((item, idx) => ({ ...item, category: 'sheets_only', categoryIndex: idx }));
    } else if (category === 'unmatched') {
      records = diff.unmatched.map((item, idx) => ({ ...item, category: 'unmatched', categoryIndex: idx }));
    } else if (category === 'invalid') {
      records = diff.invalid.map((item, idx) => ({ ...item, category: 'invalid', categoryIndex: idx }));
    }

    // Keyword filtering
    if (search) {
      records = records.filter(item => {
        const setRec = item.set || {};
        const sheetRec = item.sheet || {};
        const name = (setRec.fullName || sheetRec.name || '').toLowerCase();
        const cid = (setRec.citizenId || '').toLowerCase();
        const sid = (setRec.studentId || '').toLowerCase();
        const dis = (setRec.disabilityTypeSet || sheetRec.disabilityByCard || '').toLowerCase();
        return name.includes(search) || cid.includes(search) || sid.includes(search) || dis.includes(search);
      });
    }

    const tbody = $('#setPreviewTableBody').empty();

    if (records.length === 0) {
      $('#setPreviewEmptyState').removeClass('hidden');
      return;
    }
    $('#setPreviewEmptyState').addClass('hidden');

    const badgeStyles = {
      'new': 'bg-blue-100 text-blue-800 border-blue-200',
      'updated': 'bg-amber-100 text-amber-800 border-amber-200',
      'matched': 'bg-emerald-100 text-emerald-800 border-emerald-200',
      'sheets_only': 'bg-purple-100 text-purple-800 border-purple-200',
      'unmatched': 'bg-gray-100 text-gray-800 border-gray-200',
      'invalid': 'bg-red-100 text-red-800 border-red-200'
    };

    const statusLabels = {
      'new': 'รายการใหม่ใน SET',
      'updated': 'ข้อมูลเปลี่ยนแปลง',
      'matched': 'ข้อมูลตรงกัน',
      'sheets_only': 'มีเฉพาะในชีตเดิม',
      'unmatched': 'จับคู่ไม่ได้',
      'invalid': 'ข้อมูลผิดปกติ'
    };

    records.forEach((item, index) => {
      const setRec = item.set || {};
      const sheetRec = item.sheet || {};

      const rawStudentId = setRec.studentId || sheetRec.studentId || '-';
      const studentId = SETImporter.escapeHtml(rawStudentId);

      const rawCid = setRec.citizenId || sheetRec.citizenId || '';
      const citizenIdDisplay = rawCid ? SETImporter.escapeHtml(state.setImport.maskPii ? SETImporter.maskCitizenId(rawCid) : rawCid) : '-';

      const rawName = setRec.fullName || sheetRec.name || '-';
      let name = SETImporter.escapeHtml(rawName);


      const dob = setRec.dob || sheetRec.dateOfBirth || '-';
      let age = setRec.age || sheetRec.age || '';
      if (!age || age === '-') {
        if (dob !== '-') {
          const calc = calculateAge(dob, sheetRec);
          if (calc !== null) age = `${calc} ปี`;
        }
      }
      let dobAge = '-';
      if (dob !== '-') {
        dobAge = age ? `${dob} (${age})` : dob;
      }
      const dobAgeDisplay = SETImporter.escapeHtml(dobAge);

      const rawDisability = setRec.disabilityTypeSet || sheetRec.disabilityByCard || sheetRec.disabilityByScreening || '-';
      const disability = SETImporter.escapeHtml(rawDisability);

      const rawAddress = setRec.address || sheetRec.address || '-';
      const address = SETImporter.escapeHtml(rawAddress);

      const safeCategory = SETImporter.escapeHtml(item.category);
      const safeIndex = parseInt(item.categoryIndex, 10);
      const badgeCls = badgeStyles[item.category] || 'bg-gray-100 text-gray-700';
      const statusLabel = SETImporter.escapeHtml(statusLabels[item.category] || item.category);

      let confidenceBadge = '';
      if (item.matchConfidence === 'verified') {
        confidenceBadge = `<span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 ml-1" title="ยืนยันด้วยรหัสประจำตัวตรงกัน">ยืนยันแล้ว</span>`;
      } else if (item.matchConfidence === 'predicted') {
        confidenceBadge = `<span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200 ml-1" title="คาดการณ์ด้วยชื่อและวันเกิด (ยังไม่มีรหัสประจำตัวยืนยันตรงกัน)">คาดการณ์</span>`;
      } else if (item.conflictType) {
        confidenceBadge = `<span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 ml-1" title="พบข้อมูลขัดแย้ง/ซ้ำซ้อน">รอตรวจสอบ</span>`;
      }

      let diffSummary = '';
      if (item.category === 'updated' && item.diffs) {
        diffSummary = item.diffs.map(d => `<span class="inline-block px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 text-[11px] font-semibold mr-1 mb-1">${SETImporter.escapeHtml(d.field)}</span>`).join('');
      } else {
        diffSummary = SETImporter.escapeHtml(item.description || '-');
      }

      const rowHtml = `
        <tr class="hover:bg-white/70 transition">
          <td class="px-3 py-3 text-center text-gray-500 font-mono">${index + 1}</td>
          <td class="px-3 py-3 font-mono font-medium text-emerald-950">${studentId}</td>
          <td class="px-3 py-3 font-mono text-gray-600">${citizenIdDisplay}</td>
          <td class="px-3 py-3 font-semibold text-emerald-950">${name}</td>
          <td class="px-3 py-3 text-gray-600">${dobAgeDisplay}</td>
          <td class="px-3 py-3 text-gray-700">${disability}</td>
          <td class="px-3 py-3 text-gray-600 max-w-xs truncate" title="${address}">${address}</td>
          <td class="px-3 py-3 text-center whitespace-nowrap">
            <span class="inline-block px-2.5 py-1 rounded-full text-[11px] font-bold border ${badgeCls}">
              ${statusLabel}
            </span>
            ${confidenceBadge}
          </td>
          <td class="px-3 py-3 text-xs text-gray-600 max-w-xs">${diffSummary}</td>
          <td class="px-3 py-3 text-center whitespace-nowrap">
            <button type="button" class="btn-view-set-diff text-xs px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 hover:bg-emerald-100 font-medium transition" data-category="${safeCategory}" data-index="${safeIndex}">
              ดูรายละเอียด
            </button>
          </td>
        </tr>
      `;

      tbody.append(rowHtml);
    });

    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  // Open Diff Modal for Side-by-Side Comparison
  function openSetDiffModal(category, categoryIndex) {
    const diff = state.setImport.diffResult;
    if (!diff) return;

    let item = null;
    if (category === 'new') item = diff.newInSet[categoryIndex];
    else if (category === 'updated') item = diff.updatedDiff[categoryIndex];
    else if (category === 'matched') item = diff.matched[categoryIndex];
    else if (category === 'sheets_only') item = diff.sheetsOnly[categoryIndex];
    else if (category === 'unmatched') item = diff.unmatched[categoryIndex];
    else if (category === 'invalid') item = diff.invalid[categoryIndex];

    if (!item) return;

    const setRec = item.set || {};
    const sheetRec = item.sheet || item.conflictCandidate || {};

    const studentName = setRec.fullName || sheetRec.name || 'ไม่ระบุชื่อ';
    let modalTitleText = `รายละเอียดเปรียบเทียบ: ${studentName}`;
    if (category === 'sheets_only') {
      modalTitleText += ' (มีเฉพาะใน sheet)';
    }
    $('#diffModalStudentName').text(modalTitleText);

    // Status Banner in modal
    const banner = $('#diffModalStatusBanner');
    const badgeColors = {
      'new': 'bg-blue-50 border-blue-200 text-blue-900',
      'updated': 'bg-amber-50 border-amber-200 text-amber-900',
      'matched': 'bg-emerald-50 border-emerald-200 text-emerald-900',
      'sheets_only': 'bg-purple-50 border-purple-200 text-purple-900',
      'unmatched': 'bg-gray-50 border-gray-200 text-gray-900',
      'invalid': 'bg-red-50 border-red-200 text-red-900'
    };

    const statusLabels = {
      'new': '🆕 รายการใหม่ในระบบ SET (ยังไม่มีในระบบข้อมูลเดิม)',
      'updated': '⚠️ มีข้อมูลที่เปลี่ยนแปลงระหว่าง SET กับชีตเดิม',
      'matched': '✅ ข้อมูลตรงกันทุกฟิลด์หลัก',
      'sheets_only': '📋 มีเฉพาะใน Google Sheets เดิม (ไม่พบใน SET — ต้องตรวจสอบและไม่แสดงต่อ Public)',
      'unmatched': '❓ คีย์ไม่สมบูรณ์หรือไม่สามารถจับคู่ได้',
      'invalid': '❌ ข้อมูลผิดปกติหรือไม่ถูกต้องตามรูปแบบ'
    };

    const safeCitizenId = SETImporter.escapeHtml(setRec.citizenId ? (state.setImport.maskPii ? SETImporter.maskCitizenId(setRec.citizenId) : setRec.citizenId) : '-');
    banner.attr('class', `p-3.5 rounded-xl border flex items-center justify-between text-xs font-semibold ${badgeColors[category] || 'bg-gray-50'}`);
    banner.html(`
      <span>${SETImporter.escapeHtml(statusLabels[category] || category)}</span>
      <span class="font-mono">${safeCitizenId}</span>
    `);

    // Remove existing confidence alerts if any
    $('#diffModalConfidenceAlert').remove();
    let confidenceHtml = '';
    if (item.matchConfidence === 'predicted') {
      confidenceHtml = `
        <div id="diffModalConfidenceAlert" class="p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-xs flex items-start gap-2">
          <i data-lucide="info" class="w-4 h-4 text-blue-700 shrink-0 mt-0.5"></i>
          <div><b>การจับคู่แบบคาดการณ์ (Heuristic Match):</b> รายการนี้จับคู่ด้วยชื่อ-สกุล และวันเกิดตรงกัน แต่ยังไม่มีเลขประจำตัวประชาชนตรงกันข้ามระบบ โปรดตรวจสอบก่อนนำเข้าจริง</div>
        </div>
      `;
    } else if (item.matchConfidence === 'verified') {
      confidenceHtml = `
        <div id="diffModalConfidenceAlert" class="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-start gap-2">
          <i data-lucide="check-circle" class="w-4 h-4 text-emerald-700 shrink-0 mt-0.5"></i>
          <div><b>การจับคู่ที่ยืนยันแล้ว:</b> รายการนี้ได้รับการยืนยันด้วยรหัสประจำตัวตรงกันข้ามระบบ</div>
        </div>
      `;
    } else if (item.conflictType) {
      confidenceHtml = `
        <div id="diffModalConfidenceAlert" class="p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-start gap-2">
          <i data-lucide="alert-triangle" class="w-4 h-4 text-amber-700 shrink-0 mt-0.5"></i>
          <div><b>ตรวจพบข้อมูลขัดแย้งหรือซ้ำซ้อน:</b> ${SETImporter.escapeHtml(item.description)} ระบบปฏิเสธการจับคู่อัตโนมัติเพื่อให้ผู้ดูแลระบบตรวจสอบตัวบุคคล</div>
        </div>
      `;
    }
    if (confidenceHtml) {
      banner.after(confidenceHtml);
    }

    // Compute age from date of birth if not directly provided
    let calcSetAge = setRec.age || '-';
    if ((!calcSetAge || calcSetAge === '-') && setRec.dob) {
      const c = calculateAge(setRec.dob);
      if (c !== null) calcSetAge = `${c} ปี`;
    }
    let calcSheetAge = sheetRec.age || '-';
    if ((!calcSheetAge || calcSheetAge === '-') && sheetRec.dateOfBirth) {
      const c = calculateAge(sheetRec.dateOfBirth, sheetRec);
      if (c !== null) calcSheetAge = `${c} ปี`;
    }

    // Compare fields - cleanly separating independent disability sources and using '-' for missing data
    const fields = [
      {
        name: 'รหัสนักเรียน',
        setVal: setRec.studentId || '-',
        sheetVal: sheetRec.studentId || (sheetRec.rowNumber ? `(แถวชีตที่ ${sheetRec.rowNumber})` : '-')
      },
      {
        name: 'เลขประจำตัวประชาชน',
        setVal: setRec.citizenId ? (state.setImport.maskPii ? SETImporter.maskCitizenId(setRec.citizenId) : setRec.citizenId) : '-',
        sheetVal: sheetRec.citizenId ? (state.setImport.maskPii ? SETImporter.maskCitizenId(sheetRec.citizenId) : sheetRec.citizenId) : '-'
      },
      {
        name: 'ชื่อ-นามสกุล',
        setVal: setRec.fullName || '-',
        sheetVal: sheetRec.name || '-'
      },
      {
        name: 'วันเดือนปีเกิด',
        setVal: setRec.dob || '-',
        sheetVal: sheetRec.dateOfBirth || '-'
      },
      {
        name: 'อายุ',
        setVal: calcSetAge,
        sheetVal: calcSheetAge
      },
      {
        name: 'เพศ',
        setVal: setRec.gender || '-',
        sheetVal: '-'
      },
      {
        name: 'ความพิการ (ระบบ SET)',
        setVal: setRec.disabilityTypeSet || '-',
        sheetVal: sheetRec.disabilityTypeSet || '-',
        isSeparateSource: !sheetRec.disabilityTypeSet
      },
      {
        name: 'ความพิการ (บัตรคนพิการ)',
        setVal: setRec.disabilityByCard || '-',
        sheetVal: sheetRec.disabilityByCard || '-',
        isSeparateSource: true
      },
      {
        name: 'ความพิการ (แบบคัดกรอง)',
        setVal: setRec.disabilityByScreening || '-',
        sheetVal: sheetRec.disabilityByScreening || '-',
        isSeparateSource: true
      },
      {
        name: 'ที่อยู่ตามทะเบียนบ้าน',
        setVal: setRec.address || '-',
        sheetVal: sheetRec.address || '-'
      },
      {
        name: 'ห้องเรียน/ครูผู้รับผิดชอบ',
        setVal: '-',
        sheetVal: sheetRec.classroom ? `${sheetRec.classroom} / ${sheetRec.teacher || '-'}` : '-'
      }
    ];

    const tbody = $('#diffModalTableBody').empty();

    fields.forEach(f => {
      let statusTag = '';
      let rowBg = '';

      if (category === 'new') {
        statusTag = '<span class="px-2 py-0.5 rounded text-[11px] bg-blue-100 text-blue-800 font-bold">ข้อมูลใหม่</span>';
      } else if (category === 'sheets_only') {
        statusTag = '<span class="px-2 py-0.5 rounded text-[11px] bg-purple-100 text-purple-800 font-bold">เฉพาะชีตเดิม</span>';
      } else if (f.isSeparateSource) {
        statusTag = '<span class="px-2 py-0.5 rounded text-[11px] bg-slate-100 text-slate-700 font-medium">แหล่งข้อมูลอิสระ</span>';
      } else if (f.setVal !== '-' && f.sheetVal !== '-' && !f.sheetVal.includes('ไม่มี') && f.setVal !== f.sheetVal) {
        statusTag = '<span class="px-2 py-0.5 rounded text-[11px] bg-amber-100 text-amber-800 font-bold">แตกต่าง</span>';
        rowBg = 'bg-amber-50/60 font-semibold';
      } else if (f.setVal === f.sheetVal && f.setVal !== '-') {
        statusTag = '<span class="px-2 py-0.5 rounded text-[11px] bg-emerald-100 text-emerald-800 font-bold">ตรงกัน</span>';
      } else {
        statusTag = '<span class="px-2 py-0.5 rounded text-[11px] bg-gray-100 text-gray-600">-</span>';
      }

      tbody.append(`
        <tr class="${rowBg}">
          <td class="px-4 py-2.5 font-semibold text-gray-800">${SETImporter.escapeHtml(f.name)}</td>
          <td class="px-4 py-2.5 text-gray-700 bg-blue-50/30 font-mono">${SETImporter.escapeHtml(f.setVal)}</td>
          <td class="px-4 py-2.5 text-gray-700 bg-emerald-50/30 font-mono">${SETImporter.escapeHtml(f.sheetVal)}</td>
          <td class="px-4 py-2.5 text-center">${statusTag}</td>
        </tr>
      `);
    });

    $('#setDiffModal').removeClass('hidden');
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  // Load Mock Dataset for testing without real personal data
  function loadMockSetData() {
    showLoading(true);

    setTimeout(() => {
      const mock = SETImporter.generateMockTestDataset();

      state.setImport.generalRows = mock.mockGeneral;
      state.setImport.addressRows = mock.mockAddress;
      state.setImport.linkRows = [];

      state.setImport.generalHeaders = Object.keys(mock.mockGeneral[0]);
      state.setImport.addressHeaders = Object.keys(mock.mockAddress[0]);

      state.setImport.generalMapping = SETImporter.detectColumns(state.setImport.generalHeaders);
      state.setImport.addressMapping = SETImporter.detectColumns(state.setImport.addressHeaders);

      // Update Card Badges
      $('#badgeSetGeneral').removeClass('bg-gray-100 text-gray-600 bg-red-100 text-red-700').addClass('bg-blue-100 text-blue-800').text('ชุดจำลอง (5 รายการ)');
      $('#badgeSetAddress').removeClass('bg-gray-100 text-gray-600 bg-red-100 text-red-700').addClass('bg-blue-100 text-blue-800').text('ชุดจำลอง (3 รายการ)');
      $('#fileInfoGeneral').text('mock_set_students_general.xlsx (5 รายการทดสอบ)');
      $('#fileInfoAddress').text('mock_set_student_address.xlsx (3 รายการทดสอบ)');

      // Normalize & Join
      const normalizedGen = mock.mockGeneral.map(r => SETImporter.normalizeSetGeneralRow(r, state.setImport.generalMapping));
      const normalizedAddr = mock.mockAddress.map(r => SETImporter.normalizeSetAddressRow(r, state.setImport.addressMapping));
      const joinResult = SETImporter.joinSetReports(normalizedGen, normalizedAddr);

      // Compare with mock sheets (to demonstrate all 6 cases cleanly)
      const diffResult = SETImporter.compareWithGoogleSheets(joinResult.joined, mock.mockSheets);

      if (joinResult.invalid && joinResult.invalid.length > 0) {
        diffResult.invalid = diffResult.invalid.concat(joinResult.invalid.map(inv => ({
          set: inv,
          status: 'invalid',
          description: inv.errors.join(', ')
        })));
        diffResult.summary.invalidCount = diffResult.invalid.length;
      }

      state.setImport.diffResult = diffResult;
      state.setImport.joinedRecords = joinResult.joined;

      // Update counters & render
      updateSetPreviewCounters(diffResult.summary);
      state.setImport.activeCategoryFilter = 'all';
      renderSetPreviewTable();

      $('#btnRunSetPreview').prop('disabled', false);
      $('#setPreviewResultsContainer').removeClass('hidden');

      showLoading(false);

      Swal.fire({
        icon: 'success',
        title: 'โหลดชุดข้อมูลทดสอบจำลองสำเร็จ',
        html: `
          <div class="text-left text-xs text-gray-700 space-y-1">
            <p>• <b>ข้อมูลจำลองทั้งหมด:</b> ไม่มีข้อมูลส่วนบุคคลจริง (Zero real PII)</p>
            <p>• <b>รายการใหม่ (New):</b> ${diffResult.summary.newCount} รายการ</p>
            <p>• <b>ข้อมูลเปลี่ยนแปลง (Updated):</b> ${diffResult.summary.updatedCount} รายการ</p>
            <p>• <b>ข้อมูลตรงกัน (Matched):</b> ${diffResult.summary.matchedCount} รายการ</p>
            <p>• <b>มีเฉพาะในชีต (Sheets Only):</b> ${diffResult.summary.sheetsOnlyCount} รายการ</p>
            <p>• <b>จับคู่ไม่ได้/ขัดแย้ง (Unmatched/Conflict):</b> ${diffResult.summary.unmatchedCount} รายการ</p>
            <p>• <b>ข้อมูลผิดปกติ (Invalid):</b> ${diffResult.summary.invalidCount} รายการ</p>
            <hr class="my-1.5 border-gray-200">
            <p class="text-emerald-800 font-semibold">• <b>ระดับการจับคู่:</b> คาดการณ์ด้วยชื่อ+วันเกิด ${diffResult.summary.predictedCount} รายการ (ต้องรอ Admin ยืนยัน)</p>
          </div>
        `,
        confirmButtonColor: '#2E7D32'
      });

      $('html, body').animate({
        scrollTop: $('#setPreviewResultsContainer').offset().top - 80
      }, 500);

    }, 300);
  }

  // Clear SET State
  function clearSetImportState() {
    state.setImport = {
      generalRows: [],
      addressRows: [],
      linkRows: [],
      generalHeaders: [],
      addressHeaders: [],
      linkHeaders: [],
      generalMapping: {},
      addressMapping: {},
      linkMapping: {},
      joinedRecords: [],
      diffResult: null,
      activeCategoryFilter: 'all',
      maskPii: true,
      currentDiffRecord: null
    };

    $('#setFileGeneral, #setFileAddress, #setFileLink').val('');
    $('#badgeSetGeneral, #badgeSetAddress, #badgeSetLink').attr('class', 'text-[11px] px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 font-medium').text('ยังไม่เลือก');
    $('#fileInfoGeneral, #fileInfoAddress, #fileInfoLink').text('');
    $('#btnRunSetPreview').prop('disabled', true);
    $('#setPreviewResultsContainer').addClass('hidden');
    $('#setValidationAlertBox').addClass('hidden');
  }

  // ========================================================
  // STUDENT EXPANDABLE ACCORDION ROW (ZERO-PII COMPLIANT)
  // ========================================================
  function buildStudentAccordionCardHtml(student) {
    if (!student) return '';

    // Student ID or Row fallback
    const studentId = student.studentId || (student.rowNumber ? `(แถวที่ ${student.rowNumber})` : '-');

    // Gender detection from name prefix
    let gender = 'ไม่ระบุเพศ';
    if (student.name) {
      if (student.name.startsWith('เด็กชาย') || student.name.startsWith('นาย') || student.name.startsWith('ด.ช.')) gender = 'เพศชาย';
      else if (student.name.startsWith('เด็กหญิง') || student.name.startsWith('นางสาว') || student.name.startsWith('ด.ญ.')) gender = 'เพศหญิง';
    }

    // Age calculation
    const age = calculateAge(student.dateOfBirth, student);
    const ageStr = student.age || (age !== null ? `${age} ปี` : 'ไม่ระบุอายุ');
    const dobText = toThaiBuddhistDateString(student.dateOfBirth);

    // Service badge
    let svcText = 'รับบริการในศูนย์ / อื่นๆ';
    let svcClass = 'bg-emerald-100 text-emerald-800';
    if (student.serviceUnit === 1) {
      svcText = 'รับบริการที่หน่วยบริการ';
      svcClass = 'bg-cyan-100 text-cyan-800';
    } else if (student.serviceAdjustHome === 1) {
      svcText = 'รับบริการที่บ้าน (ปรับบ้าน)';
      svcClass = 'bg-teal-100 text-teal-800';
    } else if (student.serviceInCenter === 1) {
      svcText = 'รับบริการที่ศูนย์';
      svcClass = 'bg-emerald-100 text-emerald-800';
    }
    const svcBadge = `<span class="inline-block px-2 py-0.5 rounded text-[11px] font-bold ${svcClass}">${svcText}</span>`;

    // Disability types
    const disCard = getNormalizedDisability(student.disabilityByCard, true);
    const disCardText = disCard !== 'ยังไม่มีบัตรคนพิการ' ? disCard : 'ยังไม่มีบัตรประจำตัวคนพิการ';

    const disScreen = getNormalizedDisability(student.disabilityByScreening, false);
    const disScreenText = disScreen !== 'ไม่ระบุ' ? disScreen : '-';

    // Document Checklist Badges
    const docBadgesHtml = `
      <span class="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${student.hasDisabilityCard === 1 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-400'}">
        <i data-lucide="${student.hasDisabilityCard === 1 ? 'check-circle-2' : 'x-circle'}" class="w-3 h-3"></i>
        <span>บัตรคนพิการ</span>
      </span>
      <span class="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${student.hasDisabilityCert === 1 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-400'}">
        <i data-lucide="${student.hasDisabilityCert === 1 ? 'check-circle-2' : 'x-circle'}" class="w-3 h-3"></i>
        <span>เอกสารรับรอง</span>
      </span>
      <span class="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${student.hasEducationScreening === 1 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-400'}">
        <i data-lucide="${student.hasEducationScreening === 1 ? 'check-circle-2' : 'x-circle'}" class="w-3 h-3"></i>
        <span>แบบคัดกรอง</span>
      </span>
    `;

    // Special status badges (non-Thai, disabled later)
    const hasSpecialStatus = (student.nonThai === 1 || student.nonThai === '1') || (student.disabledLater === 1 || student.disabledLater === '1');
    let specialBadgesHtml = '';
    if (student.nonThai === 1 || student.nonThai === '1') {
      specialBadgesHtml += '<span class="inline-block px-2 py-0.5 text-[11px] font-semibold bg-rose-100 text-rose-800 rounded border border-rose-200">ไม่ใช่สัญชาติไทย</span>';
    }
    if (student.disabledLater === 1 || student.disabledLater === '1') {
      specialBadgesHtml += '<span class="inline-block px-2 py-0.5 text-[11px] font-semibold bg-amber-100 text-amber-800 rounded border border-amber-200">พิการภายหลัง</span>';
    }

    return `
      <div class="p-3 sm:p-4 bg-gradient-to-br from-emerald-50/60 via-white to-teal-50/40 rounded-xl border border-emerald-200/70 shadow-sm text-left">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          <!-- Column 1: ข้อมูลทั่วไปและการศึกษา -->
          <div class="bg-white/90 backdrop-blur-xs p-3 rounded-lg border border-emerald-100 shadow-xs flex flex-col justify-between">
            <div>
              <div class="flex items-center gap-1.5 mb-2 pb-1.5 border-b border-emerald-100/70">
                <i data-lucide="user" class="w-3.5 h-3.5 text-emerald-700"></i>
                <span class="font-bold text-xs text-emerald-950">ข้อมูลพื้นฐาน & การศึกษา</span>
              </div>
              <div class="space-y-1 text-xs text-slate-700 leading-relaxed">
                <div><span class="text-slate-500">รหัสนักเรียน:</span> <strong class="text-emerald-900 font-mono">${studentId}</strong></div>
                <div><span class="text-slate-500">ชื่อ-สกุล:</span> <strong class="text-slate-900">${student.name || '-'}</strong></div>
                <div><span class="text-slate-500">อายุ:</span> <span class="font-medium text-slate-800">${ageStr}</span></div>
                <div><span class="text-slate-500">วันเดือนปีเกิด:</span> <span class="text-slate-800">${dobText}</span></div>
                <div><span class="text-slate-500">ห้องเรียน/หน่วยบริการ:</span> <span class="font-semibold text-emerald-850">${student.classroom || '-'}</span></div>
                <div><span class="text-slate-500">ครูผู้รับผิดชอบ:</span> <span class="font-medium text-slate-800">${student.teacher || '-'}</span></div>
                <div class="pt-1"><span class="text-slate-500 mr-1">ประเภทบริการ:</span> ${svcBadge}</div>
              </div>
            </div>
          </div>

          <!-- Column 2: ความพิการและเอกสารสิทธิ์ -->
          <div class="bg-white/90 backdrop-blur-xs p-3 rounded-lg border border-emerald-100 shadow-xs flex flex-col justify-between">
            <div>
              <div class="flex items-center gap-1.5 mb-2 pb-1.5 border-b border-emerald-100/70">
                <i data-lucide="award" class="w-3.5 h-3.5 text-emerald-700"></i>
                <span class="font-bold text-xs text-emerald-950">ความพิการ & เอกสารหลักฐาน</span>
              </div>
              <div class="space-y-2 text-xs text-slate-700">
                <div>
                  <div class="text-[11px] text-slate-500 mb-0.5">ประเภทความพิการ (ตามบัตรคนพิการ):</div>
                  <div class="font-semibold text-emerald-900 bg-emerald-50/70 px-2 py-1 rounded border border-emerald-100/60">${disCardText}</div>
                </div>
                <div>
                  <div class="text-[11px] text-slate-500 mb-0.5">ประเภทความพิการ (ตามแบบคัดกรองฯ):</div>
                  <div class="font-medium text-slate-800 bg-slate-50 px-2 py-1 rounded border border-slate-100">${disScreenText}</div>
                </div>
                <div>
                  <div class="text-[11px] text-slate-500 mb-1">เอกสารหลักฐานทางการศึกษา:</div>
                  <div class="flex flex-wrap gap-1">
                    ${docBadgesHtml}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Column 3: ที่อยู่และสถานะ -->
          <div class="bg-white/90 backdrop-blur-xs p-3 rounded-lg border border-emerald-100 shadow-xs flex flex-col justify-between">
            <div>
              <div class="flex items-center gap-1.5 mb-2 pb-1.5 border-b border-emerald-100/70">
                <i data-lucide="home" class="w-3.5 h-3.5 text-emerald-700"></i>
                <span class="font-bold text-xs text-emerald-950">${hasSpecialStatus ? 'ที่อยู่ & สถานะพิเศษ' : 'ข้อมูลที่อยู่'}</span>
              </div>
              <div class="space-y-2 text-xs text-slate-700">
                <div>
                  <div class="text-[11px] text-slate-500 mb-0.5">ที่อยู่ตามทะเบียนบ้าน:</div>
                  <div class="text-slate-800 bg-slate-50 p-2 rounded border border-slate-100 text-xs leading-relaxed max-h-24 overflow-y-auto">${student.address || '-'}</div>
                </div>
                ${hasSpecialStatus ? `
                <div>
                  <div class="text-[11px] text-slate-500 mb-1">สถานะพิเศษ:</div>
                  <div class="flex flex-wrap gap-1">
                    ${specialBadgesHtml}
                  </div>
                </div>
                ` : ''}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

    function clearFiltersExceptSearch() {
    $('#filterClassroom').val('').trigger('change');
    $('#filterTeacher').val('').trigger('change');
    $('#filterDisabilityCard').val('').trigger('change');
    $('#filterDisabilityScreen').val('').trigger('change');
    $('#filterAgeRange').val('').trigger('change');
    $('#filterAgeYear').val('').trigger('change');
    $('#filterSvcCenter').prop('checked', false);
    $('#filterSvcUnit').prop('checked', false);
    $('#filterSvcHome').prop('checked', false);
    $('#filterDocCard').prop('checked', false);
    $('#filterDocCert').prop('checked', false);
    $('#filterDocScreen').prop('checked', false);
    $('#filterStatusNonThai').prop('checked', false);
    $('#filterStatusLater').prop('checked', false);
    applyFilters();
  }

  window.clearFiltersExceptSearch = clearFiltersExceptSearch;

  function toggleStudentAccordion(rowNumber) {
    const subRow = $(`#studentSubRow_${rowNumber}`);
    const chevron = $(`#studentAccordionChevron_${rowNumber}`);
    if (subRow.hasClass('hidden')) {
      subRow.removeClass('hidden');
      chevron.addClass('rotate-180');
      if (typeof lucide !== 'undefined') lucide.createIcons();
    } else {
      subRow.addClass('hidden');
      chevron.removeClass('rotate-180');
    }
  }

  function toggleDrillDownAccordion(rowNumber) {
    const subRow = $(`#drillDownSubRow_${rowNumber}`);
    const chevron = $(`#drillDownChevron_${rowNumber}`);
    if (subRow.hasClass('hidden')) {
      subRow.removeClass('hidden');
      chevron.addClass('rotate-180');
      if (typeof lucide !== 'undefined') lucide.createIcons();
    } else {
      subRow.addClass('hidden');
      chevron.removeClass('rotate-180');
    }
  }

  function expandAllStudents(isDrillDown = false) {
    if (isDrillDown) {
      $('.drilldown-accordion-subrow').removeClass('hidden');
      $('[id^="drillDownChevron_"]').addClass('rotate-180');
    } else {
      $('.student-accordion-subrow').removeClass('hidden');
      $('[id^="studentAccordionChevron_"]').addClass('rotate-180');
    }
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  function collapseAllStudents(isDrillDown = false) {
    if (isDrillDown) {
      $('.drilldown-accordion-subrow').addClass('hidden');
      $('[id^="drillDownChevron_"]').removeClass('rotate-180');
    } else {
      $('.student-accordion-subrow').addClass('hidden');
      $('[id^="studentAccordionChevron_"]').removeClass('rotate-180');
    }
  }

  // ========================================================
  // STUDENT PROFILE MODAL CONTROLLERS (ZERO-PII COMPLIANT)
  // ========================================================
  function openStudentProfileByRow(rowNumber, studentList = null) {
    const list = studentList || (state.filteredStudents && state.filteredStudents.length > 0 ? state.filteredStudents : state.allStudents);
    const index = list.findIndex(s => s.rowNumber === rowNumber);
    if (index === -1) return;
    
    state.currentProfileStudents = list;
    state.currentProfileIndex = index;
    renderStudentProfileModal();
    $('#studentProfileModal').removeClass('hidden');
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  function renderStudentProfileModal() {
    if (state.currentProfileIndex < 0 || !state.currentProfileStudents[state.currentProfileIndex]) return;
    const s = state.currentProfileStudents[state.currentProfileIndex];
    const total = state.currentProfileStudents.length;
    const idx = state.currentProfileIndex;

    // Avatar initial letter
    let cleanName = (s.name || '').replace(/^(เด็กชาย|เด็กหญิง|นาย|นางสาว|ด\.ช\.|ด\.ญ\.)/, '').trim();
    let initialLetter = cleanName.charAt(0) || (s.name ? s.name.charAt(0) : 'น');

    $('#profileAvatar').text(initialLetter);
    $('#profileStudentName').text(s.name || '-');
    
    const sid = s.studentId || (s.rowNumber ? `(แถวที่ ${s.rowNumber})` : '-');
    $('#profileStudentIdBadge').text(`รหัส ${sid}`);

    // Gender detection from name prefix
    let gender = 'ไม่ระบุ';
    if (s.name) {
      if (s.name.startsWith('เด็กชาย') || s.name.startsWith('นาย') || s.name.startsWith('ด.ช.')) gender = 'เพศชาย';
      else if (s.name.startsWith('เด็กหญิง') || s.name.startsWith('นางสาว') || s.name.startsWith('ด.ญ.')) gender = 'เพศหญิง';
    }
    
    const age = calculateAge(s.dateOfBirth, s);
    const ageStr = s.age || (age !== null ? `${age} ปี` : 'ไม่ระบุอายุ');
    $('#profileGenderAge').text(`${gender} • อายุ ${ageStr}`);

    // Age range
    let ageRange = 'ไม่ระบุช่วง';
    if (age !== null) {
      if (age < 3) ageRange = 'ช่วงอายุน้อยกว่า 3 ปี';
      else if (age <= 6) ageRange = 'ช่วงอายุ 3 - 6 ปี';
      else ageRange = 'ช่วงอายุ 7 ปีขึ้นไป';
    }
    $('#profileAgeRange').text(ageRange);

    // Service badge
    let svcText = 'รับบริการในศูนย์ / อื่นๆ';
    let svcClass = 'bg-emerald-400 text-emerald-950';
    if (s.serviceUnit === 1) {
      svcText = 'รับบริการที่หน่วยบริการ';
      svcClass = 'bg-cyan-400 text-cyan-950';
    } else if (s.serviceAdjustHome === 1) {
      svcText = 'รับบริการที่บ้าน (ปรับบ้าน)';
      svcClass = 'bg-teal-400 text-teal-950';
    } else if (s.serviceInCenter === 1) {
      svcText = 'รับบริการที่ศูนย์';
      svcClass = 'bg-emerald-400 text-emerald-950';
    }
    const badge = $('#profileServiceBadge');
    badge.text(svcText);
    badge.attr('class', `px-3 py-1 rounded-full text-xs font-bold shadow-sm shrink-0 ${svcClass}`);

    // Education & Classroom
    $('#profileClassroom').text(s.classroom || '-');
    $('#profileTeacher').text(s.teacher || '-');
    $('#profileDob').text(toThaiBuddhistDateString(s.dateOfBirth));
    $('#profileAddress').text(s.address || '-');

    // Disabilities (Card vs Screening)
    const disCard = getNormalizedDisability(s.disabilityByCard, true);
    $('#profileDisCard').text(disCard !== 'ยังไม่มีบัตรคนพิการ' ? disCard : 'ยังไม่มีบัตรคนพิการ');
    
    const disScreen = getNormalizedDisability(s.disabilityByScreening, false);
    $('#profileDisScreen').text(disScreen !== 'ไม่ระบุ' ? disScreen : '-');

    // Document Checklist indicators
    setProfileDocIndicator('#profileDocCard', s.hasDisabilityCard === 1, 'มีบัตรคนพิการ', 'ยังไม่มีบัตร');
    setProfileDocIndicator('#profileDocCert', s.hasDisabilityCert === 1, 'มีเอกสารรับรอง', 'ไม่มีเอกสาร');
    setProfileDocIndicator('#profileDocScreen', s.hasEducationScreening === 1, 'มีแบบคัดกรอง', 'ไม่มีแบบคัดกรอง');

    // Navigation index
    $('#profileCurrentIndexBadge').text(`${idx + 1} / ${total}`);

    // Disable prev/next at bounds
    $('#btnProfilePrevStudent').prop('disabled', idx === 0).toggleClass('opacity-40 cursor-not-allowed', idx === 0);
    $('#btnProfileNextStudent').prop('disabled', idx === total - 1).toggleClass('opacity-40 cursor-not-allowed', idx === total - 1);

    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  function setProfileDocIndicator(selector, hasDoc, trueText, falseText) {
    const el = $(selector);
    if (hasDoc) {
      el.attr('class', 'inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full');
      el.html(`<i data-lucide="check-circle-2" class="w-3.5 h-3.5 text-emerald-600"></i><span>${trueText}</span>`);
    } else {
      el.attr('class', 'inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full');
      el.html(`<i data-lucide="x-circle" class="w-3.5 h-3.5 text-slate-400"></i><span>${falseText}</span>`);
    }
  }

  function closeStudentProfileModal() {
    $('#studentProfileModal').addClass('hidden');
  }

  // Profile modal event listeners
  $(document).ready(function() {
    $('#btnExpandAllStudents').click(function() { expandAllStudents(false); });
    $('#btnCollapseAllStudents').click(function() { collapseAllStudents(false); });
    $('#btnCloseStudentProfileModal, #btnCloseStudentProfileModalBtn').click(closeStudentProfileModal);
    
    $('#studentProfileModal').click(function(e) {
      if (e.target === this) closeStudentProfileModal();
    });

    $('#btnProfilePrevStudent').click(function() {
      if (state.currentProfileIndex > 0) {
        state.currentProfileIndex--;
        renderStudentProfileModal();
      }
    });

    $('#btnProfileNextStudent').click(function() {
      if (state.currentProfileIndex < state.currentProfileStudents.length - 1) {
        state.currentProfileIndex++;
        renderStudentProfileModal();
      }
    });

    $('#btnProfilePrint').click(function() {
      window.print();
    });

    $(document).keydown(function(e) {
      if (!$('#studentProfileModal').hasClass('hidden')) {
        if (e.key === 'Escape') closeStudentProfileModal();
        else if (e.key === 'ArrowLeft') $('#btnProfilePrevStudent').click();
        else if (e.key === 'ArrowRight') $('#btnProfileNextStudent').click();
      }
    });
  });

  // Expose to window for inline onclick handlers
  window.openStudentProfileByRow = openStudentProfileByRow;
  window.closeStudentProfileModal = closeStudentProfileModal;
  window.toggleStudentAccordion = toggleStudentAccordion;
  window.toggleDrillDownAccordion = toggleDrillDownAccordion;
  window.expandAllStudents = expandAllStudents;
  window.collapseAllStudents = collapseAllStudents;
