
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
        
        const options = getMethod ? { method: 'GET' } : {
          method: 'POST',
          body: JSON.stringify({ action, payload })
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
              if (this._onFailure) this._onFailure(new Error(result.message));
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
      saveAppConfig: function(spreadsheetId, sheetName, reportDate, columnOrder) {
        this._callApi('saveAppConfig', { spreadsheetId, sheetName, reportDate, columnOrder });
      },
      createStudent: function(payload) {
        this._callApi('createStudent', payload);
      },
      updateStudent: function(payload) {
        this._callApi('updateStudent', payload);
      },
      deleteStudent: function(rowNumber, studentName) {
        this._callApi('deleteStudent', { rowNumber, studentName });
      }
    }
  }
};

// App Global State
  const state = {
    allStudents: [],
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
    columnOrder: ['name', 'classroom', 'teacher', 'serviceType', 'disabilityType', 'documents', 'birthday']
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
    Chart.defaults.font.family = "'Kanit', 'Sarabun', sans-serif";
    
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
        Swal.fire({
          title: 'เข้าสู่แผงควบคุมระบบ (Admin)',
          text: 'กรุณากรอกรหัสผ่านเพื่อเข้าใช้งานตั้งค่าระบบ',
          input: 'password',
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
                if (data.status === 'success' && data.data.valid) {
                  resolve(); // Password is correct
                } else {
                  resolve('รหัสผ่านไม่ถูกต้อง!'); // Incorrect
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

    // Admin toggle switches: show/hide menu items
    $('#toggleNavStudents').on('change', function() {
      $('#navStudents').toggle(this.checked);
    });
    $('#toggleNavPivot').on('change', function() {
      $('#navPivot').toggle(this.checked);
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

    // Admin Fetch Tabs Button
    $('#btnAdminFetchTabs').click(function() {
      const url = $('#adminSpreadsheetUrl').val();
      if (!url) {
        Swal.fire('คำเตือน', 'กรุณากรอกลิงก์ Google Sheet', 'warning');
        return;
      }
      
      showLoading(true);
      google.script.run
        .withSuccessHandler(function(res) {
          showLoading(false);
          if (res.success) {
            const select = $('#adminSheetTabSelect').empty();
            res.tabs.forEach(tab => {
              select.append(`<option value="${tab.name}">${tab.name} (${tab.id})</option>`);
            });
            select.trigger('change');
            Swal.fire('สำเร็จ', 'ดึงข้อมูลแผ่นงานเรียบร้อยแล้ว กรุณาเลือกแผ่นงานที่ต้องการด้านล่าง', 'success');
          } else {
            Swal.fire('ข้อผิดพลาด', 'ไม่สามารถเชื่อมต่อชีตได้: ' + res.message, 'error');
          }
        })
        .withFailureHandler(function(err) {
          showLoading(false);
          Swal.fire('ข้อผิดพลาด', 'ระบบหลังบ้านผิดพลาด: ' + err.message, 'error');
        })
        .getSheetTabsFromUrl(url);
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

    // Close Drill Down Container
    $(document).on('click', '#btnCloseDrillDown', function() {
      $('#chartDrillDownContainer').addClass('hidden');
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
      // Hide filter panel when in dashboard (overview) mode
      $('#filterPanel').addClass('hidden');
      $('#iconAdvancedSearch').removeClass('rotate-180');
      renderDashboard();
    } else if (targetSection === 'students') {
      titleEl.text('แฟ้มรายชื่อนักเรียน');
      renderStudentTable();
    } else if (targetSection === 'pivot') {
      titleEl.text('ตารางวิเคราะห์ความสัมพันธ์ของข้อมูล');
      renderPivotTable();
    } else if (targetSection === 'admin') {
      titleEl.text('ตั้งค่าระบบสำหรับผู้ดูแล (Admin)');
    }
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
      // 1. Search Name
      if (searchVal && s.name.toLowerCase().indexOf(searchVal) === -1) {
        return false;
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
    state.columnOrder.forEach(colId => {
      const def = COLUMN_DEFINITIONS[colId];
      if (def) {
        thead.append(`<th class="px-6 py-4 text-emerald-800 text-sm ${def.class}">${def.label}</th>`);
      }
    });
    thead.append(`<th class="px-6 py-4 text-emerald-900 text-sm text-right whitespace-nowrap">จัดการ</th>`);
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

  // Render Table of students
  function renderStudentTable() {
    renderTableHeader();
    const tbody = $('#studentTableBody').empty();
    
    if (state.filteredStudents.length === 0) {
      tbody.append(`
        <tr>
          <td colspan="${state.columnOrder.length + 1}" class="px-6 py-10 text-center text-gray-500 font-medium bg-white/30">
            <div class="flex flex-col items-center justify-center gap-2">
              <i data-lucide="users" class="w-10 h-10 text-gray-400"></i>
              <span>ไม่พบข้อมูลนักเรียนที่ตรงตามเงื่อนไข</span>
            </div>
          </td>
        </tr>
      `);
      lucide.createIcons();
      return;
    }

    state.filteredStudents.forEach((student, index) => {
      // Determine service text
      let svcText = '';
      if (student.serviceInCenter) svcText += '<span class="px-2 py-1 text-xs bg-emerald-100 text-emerald-800 rounded-full font-medium mr-1">รับบริการที่ศูนย์</span>';
      if (student.serviceUnit) svcText += '<span class="px-2 py-1 text-xs bg-cyan-100 text-cyan-800 rounded-full font-medium mr-1">รับบริการที่หน่วยบริการ</span>';
      if (student.serviceAdjustHome) svcText += '<span class="px-2 py-1 text-xs bg-teal-100 text-teal-800 rounded-full font-medium">รับบริการที่บ้าน</span>';

      // Document completeness badges
      let docBadges = '';
      docBadges += student.hasDisabilityCard ? 
        '<span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-100 text-green-700 text-xs font-semibold mr-1" title="มีบัตรประจำตัวคนพิการ">บ</span>' : 
        '<span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-gray-400 text-xs font-semibold mr-1" title="ไม่มีบัตรประจำตัวคนพิการ">-</span>';
      
      docBadges += student.hasDisabilityCert ? 
        '<span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold mr-1" title="มีเอกสารรับรองความพิการ">ใบ</span>' : 
        '<span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-gray-400 text-xs font-semibold mr-1" title="ไม่มีเอกสารรับรองความพิการ">-</span>';
      
      docBadges += student.hasEducationScreening ? 
        '<span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-cyan-100 text-cyan-700 text-xs font-semibold" title="มีแบบคัดกรองทางการศึกษา">ค</span>' : 
        '<span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-gray-400 text-xs font-semibold" title="ไม่มีแบบคัดกรองทางการศึกษา">-</span>';

      // Status labels (Non-Thai or Disabled later)
      let statusLabels = '';
      if (student.nonThai) {
        statusLabels += '<span class="px-2 py-0.5 text-xs bg-red-100 text-red-800 rounded-md font-medium mr-1">ไม่ใช่สัญชาติไทย</span>';
      }
      if (student.disabledLater) {
        statusLabels += '<span class="px-2 py-0.5 text-xs bg-amber-100 text-amber-800 rounded-md font-medium">พิการภายหลัง</span>';
      }
      if (!statusLabels) statusLabels = '<span class="text-gray-400">-</span>';

      const displayDis = getNormalizedDisability(student.disabilityByScreening, false) !== 'ไม่ระบุ' 
        ? getNormalizedDisability(student.disabilityByScreening, false) 
        : '-';

      const age = calculateAge(student.dateOfBirth, student);
      const dobText = toThaiBuddhistDateString(student.dateOfBirth) + (student.age ? ` (${student.age})` : (age !== null ? ` (${age} ปี)` : ''));

      let cellsHtml = '';
      state.columnOrder.forEach(colId => {
        cellsHtml += getColumnCellHtml(colId, student, svcText, docBadges, dobText, statusLabels, displayDis);
      });

      const rowHtml = `
        <tr class="hover:bg-white/40 border-b border-emerald-100/40 transition">
          ${cellsHtml}
          <td class="px-6 py-4 text-sm text-right whitespace-nowrap">
            <div class="flex items-center justify-end gap-2">
              <button onclick="editStudentByRow(${student.rowNumber})" class="p-2 text-emerald-700 hover:bg-emerald-500/10 rounded-lg transition" title="แก้ไข">
                <i data-lucide="edit-3" class="w-4 h-4"></i>
              </button>
              <button onclick="deleteStudentByRow(${student.rowNumber}, '${student.name.replace(/'/g, "\\'")}')" class="p-2 text-red-600 hover:bg-red-500/10 rounded-lg transition" title="ลบ">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
      tbody.append(rowHtml);
    });

    lucide.createIcons();
    // Sync scrollbars after rendering
    setTimeout(syncScrollbarWidths, 100);
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
    const student = state.allStudents.find(s => s.rowNumber === rowNumber);
    if (student) {
      openStudentModal(student);
    }
  };

  // Submit action for creating/updating student
  function submitStudentForm() {
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
  window.deleteStudentByRow = function(rowNumber, studentName) {
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
          .deleteStudent(rowNumber, studentName);
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

    // Build Chart 1: Service Types (Doughnut)
    const ctxSvc = document.getElementById('chartServiceTypes').getContext('2d');
    state.dashboardCharts.svc = new Chart(ctxSvc, {
      type: 'doughnut',
      data: {
        labels: ['รับบริการที่ศูนย์', 'รับบริการที่หน่วยบริการ', 'รับบริการที่บ้าน'],
        datasets: [{
          data: [countInCenter, countSvcUnit, countHome],
          backgroundColor: ['#00E676', '#29B6F6', '#FF9100'],
          borderWidth: 2,
          borderColor: '#ffffff'
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
            showDrillDownDetails('service', label);
          }
        },
        plugins: {
          legend: { position: 'bottom' },
          datalabels: {
            color: '#ffffff',
            textShadowColor: 'rgba(0, 0, 0, 0.6)',
            textShadowBlur: 4,
            font: { weight: 'bold', size: 14 },
            formatter: (val) => val > 0 ? val + ' คน' : ''
          }
        }
      }
    });

    // Build Chart 2: Age Groups (Doughnut)
    const ctxAge = document.getElementById('chartAgeGroups').getContext('2d');
    const ageChartLabels = ['อายุน้อยกว่า 3 ปี', 'อายุ 3 - 6 ปี', 'อายุ 7 ปีขึ้นไป'];
    const ageChartData = [countAgeUnder3, countAge3to6, countAgeOver7];
    const ageChartColors = ['#AA00FF', '#00E5FF', '#FFD600'];

    if (countAgeUnknown > 0) {
      ageChartLabels.push('ไม่ระบุวันเกิด');
      ageChartData.push(countAgeUnknown);
      ageChartColors.push('#94A3B8');
    }

    state.dashboardCharts.age = new Chart(ctxAge, {
      type: 'doughnut',
      data: {
        labels: ageChartLabels,
        datasets: [{
          data: ageChartData,
          backgroundColor: ageChartColors,
          borderWidth: 2,
          borderColor: '#ffffff'
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
            showDrillDownDetails('ageGroup', label);
          }
        },
        plugins: {
          legend: { position: 'bottom' },
          datalabels: {
            color: '#ffffff',
            textShadowColor: 'rgba(0, 0, 0, 0.6)',
            textShadowBlur: 4,
            font: { weight: 'bold', size: 14 },
            formatter: (val) => val > 0 ? val + ' คน' : ''
          }
        }
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
              font: {
                family: 'Kanit',
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
              font: {
                family: 'Kanit',
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
  function showDrillDownDetails(type, label) {
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
          <tr class="hover:bg-emerald-50/20 border-b border-emerald-100/20">
            <td class="px-4 py-2 font-medium text-gray-800 sticky-col">${s.name}</td>
            <td class="px-4 py-2">${displayDis}</td>
            <td class="px-4 py-2 text-center">${ageText}</td>
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

    // Show toast notification in bottom-right corner instead of scrolling
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