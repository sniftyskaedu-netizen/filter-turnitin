(function () {
  'use strict';

  // Application State
  const state = {
    isVersiBaru: false, // Default: Versi Lama (Feedback Studio)
    versiBaru: {
      bibliography: true,   // Default: Active
      quotedText: false,     // Default: Off
      citedText: false,      // Default: Off
      matchesMode: 'Off',    // 'Off' | 'Words' (HANYA Words di Versi Baru!)
      customValue: '10'      // Default Words value
    },
    versiLama: {
      quotes: false,         // Default: Off
      bibliography: true,    // Default: Active
      matchesMode: 'Off',    // 'Off' | '%' | 'Words'
      customValue: '1'       // Default value
    }
  };

  // DOM Elements
  const btnVersiBaru = document.getElementById('btnVersiBaru');
  const btnVersiLama = document.getElementById('btnVersiLama');
  const dynamicFilterCards = document.getElementById('dynamicFilterCards');
  const btnResetAll = document.getElementById('btnResetAll');
  const btnSubmit = document.getElementById('btnSubmit');
  const btnPreviewReport = document.getElementById('btnPreviewReport');
  const btnOpenAdminPanel = document.getElementById('btnOpenAdminPanel');

  // Admin System Settings & LocalStorage Schema
  const ADMIN_STORAGE_KEY = 'turnitin_filter_admin_config_v1';

  const defaultAdminSettings = {
    adminPin: '2001',
    enableVersiBaru: true,
    enableVersiLama: true,
    headerTitle: 'Turnitin Filter Selector',
    headerSubtitle: 'Sesuaikan opsi filter dengan regulasi instansi atau kampus masing-masing secara akurat dan praktis.',
    marqueeText: '📢 Filter umum yang digunakan yaitu <strong>Filter Bibliography</strong>, sesuaikan Filter yang dipakai instansi masing-masing. ⚠️ <em>Beda filter = beda hasil.</em>',
    imgVersiBaruFiles: [],
    imgVersiLamaFiles: [],
    gasWebAppUrl: 'https://script.google.com/macros/s/AKfycbxzDzlp3cM9KZ1LJXc2l6c8zskbDwL6y7HzmpUM9r-s4sIsIEhevZ1VJBUPZ3Si6K0w/exec'
  };

  // Default Google Apps Script Web App URL fallback
  const DEFAULT_GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbxzDzlp3cM9KZ1LJXc2l6c8zskbDwL6y7HzmpUM9r-s4sIsIEhevZ1VJBUPZ3Si6K0w/exec';

  function getGasUrl() {
    const current = getAdminSettings();
    const saved = current.gasWebAppUrl || localStorage.getItem('gas_web_app_url');
    if (saved && saved.trim() !== '') return saved.trim();
    if (typeof DEFAULT_GAS_WEB_APP_URL !== 'undefined' && DEFAULT_GAS_WEB_APP_URL.trim() !== '') {
      return DEFAULT_GAS_WEB_APP_URL.trim();
    }
    return '';
  }

  function getAdminSettings() {
    try {
      const raw = localStorage.getItem(ADMIN_STORAGE_KEY);
      if (!raw) return { ...defaultAdminSettings };
      return { ...defaultAdminSettings, ...JSON.parse(raw) };
    } catch (e) {
      return { ...defaultAdminSettings };
    }
  }

  function saveAdminSettingsLocally(newSettings) {
    localStorage.setItem(ADMIN_STORAGE_KEY, JSON.stringify(newSettings));
    if (newSettings && newSettings.gasWebAppUrl) {
      localStorage.setItem('gas_web_app_url', newSettings.gasWebAppUrl);
    }
  }

  function saveAdminSettings(newSettings, callback) {
    saveAdminSettingsLocally(newSettings);

    let isDone = false;
    function finish(success, result) {
      if (isDone) return;
      isDone = true;
      if (callback) callback(success, result);
    }

    const timer = setTimeout(function () {
      finish(true, { status: 'local_saved' });
    }, 2500);

    if (typeof google !== 'undefined' && google.script && google.script.run) {
      google.script.run
        .withSuccessHandler(function (res) {
          clearTimeout(timer);
          finish(true, res);
        })
        .withFailureHandler(function (err) {
          console.warn('Gagal sync ke GAS Cloud:', err);
          clearTimeout(timer);
          finish(true, err);
        })
        .saveAdminSettingsGAS(newSettings);
      return;
    }

    const gasUrl = getGasUrl();
    if (gasUrl && gasUrl.trim() !== '') {
      const postUrl = gasUrl + (gasUrl.includes('?') ? '&' : '?') + 'action=saveSettings';
      fetch(postUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'saveSettings', settings: newSettings })
      })
        .then(res => res.json().catch(() => ({ status: 'success' })))
        .then(resData => {
          console.log('Settings synced via fetch GAS:', resData);
          clearTimeout(timer);
          finish(true, resData);
        })
        .catch(err => {
          console.warn('Gagal sync via fetch GAS:', err);
          clearTimeout(timer);
          finish(true, err);
        });
      return;
    }

    clearTimeout(timer);
    finish(true, null);
  }

  function syncSettingsFromCloud(onComplete) {
    let isDone = false;
    function finish(settings) {
      if (isDone) return;
      isDone = true;
      if (onComplete) onComplete(settings);
    }

    const timer = setTimeout(function () {
      finish(getAdminSettings());
    }, 2500);

    // 1. Primary Cloud Source: Supabase PostgreSQL Database
    if (window.SupabaseAppBackend && typeof window.SupabaseAppBackend.fetchSettingsFromSupabase === 'function') {
      window.SupabaseAppBackend.fetchSettingsFromSupabase()
        .then(function (cloudSettings) {
          clearTimeout(timer);
          if (cloudSettings && typeof cloudSettings === 'object') {
            const current = getAdminSettings();
            const merged = { ...defaultAdminSettings, ...current, ...cloudSettings };
            saveAdminSettingsLocally(merged);
            finish(merged);
          } else {
            finish(getAdminSettings());
          }
        })
        .catch(function (err) {
          console.warn('Gagal memuat setting dari Supabase:', err);
          clearTimeout(timer);
          finish(getAdminSettings());
        });
      return;
    }

    if (typeof google !== 'undefined' && google.script && google.script.run) {
      google.script.run
        .withSuccessHandler(function (cloudSettings) {
          clearTimeout(timer);
          if (cloudSettings && typeof cloudSettings === 'object' && Object.keys(cloudSettings).length > 0) {
            const current = getAdminSettings();
            const merged = { ...defaultAdminSettings, ...current, ...cloudSettings };
            saveAdminSettingsLocally(merged);
            finish(merged);
          } else {
            finish(getAdminSettings());
          }
        })
        .withFailureHandler(function (err) {
          console.warn('Error fetching cloud settings:', err);
          clearTimeout(timer);
          finish(getAdminSettings());
        })
        .getAdminSettingsGAS();
      return;
    }

    const current = getAdminSettings();
    const gasUrl = getGasUrl();
    if (gasUrl && gasUrl.trim() !== '') {
      const fetchUrl = gasUrl + (gasUrl.includes('?') ? '&' : '?') + 'action=getSettings&t=' + Date.now();
      fetch(fetchUrl)
        .then(res => res.json())
        .then(resData => {
          clearTimeout(timer);
          if (resData && (resData.status === 'success' || resData.data)) {
            const cloudSettings = resData.data || resData;
            if (cloudSettings && typeof cloudSettings === 'object' && Object.keys(cloudSettings).length > 0) {
              const merged = { ...defaultAdminSettings, ...current, ...cloudSettings };
              saveAdminSettingsLocally(merged);
              finish(merged);
            } else {
              finish(current);
            }
          } else {
            finish(current);
          }
        })
        .catch(err => {
          console.warn('Fetch error cloud settings:', err);
          clearTimeout(timer);
          finish(current);
        });
      return;
    }

    clearTimeout(timer);
    finish(current);
  }

  function applyAdminSettingsToUI() {
    const settings = getAdminSettings();

    // Update Header Title
    const elTitle = document.getElementById('headerTitleEl');
    if (elTitle && settings.headerTitle) {
      elTitle.innerHTML = `<i class="fa-solid fa-sliders text-warning me-1"></i> ${settings.headerTitle}`;
    }

    // Update Header Subtitle
    const elSubtitle = document.getElementById('headerSubtitleEl');
    if (elSubtitle && settings.headerSubtitle) {
      elSubtitle.textContent = settings.headerSubtitle;
    }

    // Update Marquee Text
    const elMarquee = document.getElementById('marqueeTextEl');
    if (elMarquee && settings.marqueeText) {
      elMarquee.innerHTML = settings.marqueeText;
    }

    // Version Switch Buttons Visibility & Enforcement
    if (btnVersiBaru) btnVersiBaru.style.display = settings.enableVersiBaru ? 'inline-block' : 'none';
    if (btnVersiLama) btnVersiLama.style.display = settings.enableVersiLama ? 'inline-block' : 'none';

    // Auto enforcement if Versi Lama or Versi Baru is disabled by Admin!
    if (!settings.enableVersiLama && !state.isVersiBaru) {
      state.isVersiBaru = true;
    } else if (!settings.enableVersiBaru && state.isVersiBaru) {
      state.isVersiBaru = false;
    }

    // Sync button active classes
    if (state.isVersiBaru) {
      if (btnVersiBaru) btnVersiBaru.classList.add('active');
      if (btnVersiLama) btnVersiLama.classList.remove('active');
    } else {
      if (btnVersiLama) btnVersiLama.classList.add('active');
      if (btnVersiBaru) btnVersiBaru.classList.remove('active');
    }
  }

  // Initialize App
  function init() {
    bindEvents();
    applyAdminSettingsToUI();
    renderApp();

    // Initial Supabase / Cloud Sync
    syncSettingsFromCloud(function () {
      applyAdminSettingsToUI();
      renderApp();
    });

    // Real-time listener for Supabase changes (updates UI live when admin changes settings)
    if (window.SupabaseAppBackend && typeof window.SupabaseAppBackend.subscribeSupabaseRealtime === 'function') {
      window.SupabaseAppBackend.subscribeSupabaseRealtime(function (cloudSettings) {
        if (cloudSettings) {
          const merged = { ...defaultAdminSettings, ...getAdminSettings(), ...cloudSettings };
          saveAdminSettingsLocally(merged);
          applyAdminSettingsToUI();
          renderApp();
        }
      });
    }

    // Auto-sync when user switches back to browser tab
    window.addEventListener('focus', function () {
      syncSettingsFromCloud(function () {
        applyAdminSettingsToUI();
        renderApp();
      });
    });

    // Background auto-sync interval (every 15 seconds)
    setInterval(function () {
      syncSettingsFromCloud(function () {
        applyAdminSettingsToUI();
        renderApp();
      });
    }, 15000);
  }

  function bindEvents() {
    // Version Switch
    if (btnVersiBaru) {
      btnVersiBaru.addEventListener('click', () => {
        state.isVersiBaru = true;
        btnVersiBaru.classList.add('active');
        btnVersiLama.classList.remove('active');
        renderApp();
      });
    }

    if (btnVersiLama) {
      btnVersiLama.addEventListener('click', () => {
        state.isVersiBaru = false;
        btnVersiLama.classList.add('active');
        btnVersiBaru.classList.remove('active');
        renderApp();
      });
    }

    // Reset All Button
    if (btnResetAll) {
      btnResetAll.addEventListener('click', resetAllFilters);
    }

    // Submit Button Action
    if (btnSubmit) {
      btnSubmit.addEventListener('click', handleSubmit);
    }

    // Preview Report Icon Button
    if (btnPreviewReport) {
      btnPreviewReport.addEventListener('click', showReportPreviewModal);
    }

    // Admin Panel Trigger Button
    if (btnOpenAdminPanel) {
      btnOpenAdminPanel.addEventListener('click', handleOpenAdminModal);
    }

    // Toggle Guide Section (Panduan & Penjelasan)
    const btnToggleGuide = document.getElementById('btnToggleGuide');
    const guideSectionCard = document.getElementById('guideSectionCard');
    const iconGuideChevron = document.getElementById('iconGuideChevron');

    if (btnToggleGuide && guideSectionCard) {
      btnToggleGuide.addEventListener('click', () => {
        const isShown = guideSectionCard.classList.contains('show');
        if (isShown) {
          guideSectionCard.classList.remove('show');
          if (iconGuideChevron) {
            iconGuideChevron.className = 'fa-solid fa-chevron-down ms-1';
          }
          // Otomatis menutup seluruh dropdown / accordion item yang sedang terbuka
          const activeCollapses = guideSectionCard.querySelectorAll('.collapse.show');
          activeCollapses.forEach(el => {
            if (typeof bootstrap !== 'undefined' && bootstrap.Collapse) {
              try {
                const bsCollapse = bootstrap.Collapse.getInstance(el) || new bootstrap.Collapse(el, { toggle: false });
                bsCollapse.hide();
              } catch (err) { }
            }
            el.classList.remove('show');
            const targetBtn = guideSectionCard.querySelector(`[data-bs-target="#${el.id}"], [href="#${el.id}"]`);
            if (targetBtn) {
              targetBtn.classList.add('collapsed');
              targetBtn.setAttribute('aria-expanded', 'false');
            }
          });
          localStorage.removeItem('activeGuideVB');
          localStorage.removeItem('activeGuideVL');
        } else {
          guideSectionCard.classList.add('show');
          if (iconGuideChevron) {
            iconGuideChevron.className = 'fa-solid fa-chevron-up ms-1 text-primary';
          }
          setTimeout(() => {
            guideSectionCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 100);
        }
      });
    }

    // Listen to Bootstrap collapse show/hide events to persist open accordion item in localStorage
    document.addEventListener('shown.bs.collapse', function (e) {
      if (e.target && e.target.id) {
        const id = e.target.id;
        if (id.startsWith('collapseVB_')) {
          localStorage.setItem('activeGuideVB', id);
        } else if (id.startsWith('collapseVL_')) {
          localStorage.setItem('activeGuideVL', id);
        }
      }
    });

    document.addEventListener('hidden.bs.collapse', function (e) {
      if (e.target && e.target.id) {
        const id = e.target.id;
        if (id.startsWith('collapseVB_')) {
          const current = localStorage.getItem('activeGuideVB');
          if (current === id) localStorage.setItem('activeGuideVB', '');
        } else if (id.startsWith('collapseVL_')) {
          const current = localStorage.getItem('activeGuideVL');
          if (current === id) localStorage.setItem('activeGuideVL', '');
        }
      }
    });
  }

  // Preview Turnitin Report Modal Handler (Supports Unlimited Uploaded Images with Carousel)
  function showReportPreviewModal() {
    const isBaru = state.isVersiBaru;
    const settings = getAdminSettings();

    const imgFiles = isBaru ? (settings.imgVersiBaruFiles || []) : (settings.imgVersiLamaFiles || []);
    const titleVersion = isBaru ? 'Laporan tampilan baru' : 'Laporan tampilan lama';

    let previewHtml = '';

    if (imgFiles && imgFiles.length > 0) {
      if (imgFiles.length === 1) {
        previewHtml = `
          <div class="text-center d-flex justify-content-center align-items-center">
            <img src="${imgFiles[0]}" class="img-fluid rounded border shadow-sm popup-img-fit" alt="${titleVersion}" />
          </div>`;
      } else {
        // Multi-image Carousel Slider (Static, NO Auto-slide)
        const carouselId = 'previewCarouselReport';
        const slidesHtml = imgFiles.map((src, idx) => `
          <div class="carousel-item ${idx === 0 ? 'active' : ''}">
            <div class="d-flex justify-content-center align-items-center">
              <img src="${src}" class="img-fluid rounded border popup-img-fit" alt="Gambar ${idx + 1}" />
            </div>
            <div class="text-center mt-2"><span class="badge bg-dark opacity-75 fs-8">Gambar ${idx + 1} dari ${imgFiles.length}</span></div>
          </div>
        `).join('');

        previewHtml = `
          <div id="${carouselId}" class="carousel slide" data-bs-interval="false">
            <div class="carousel-inner">
              ${slidesHtml}
            </div>
            <button class="carousel-control-prev" type="button" data-bs-target="#${carouselId}" data-bs-slide="prev" style="filter: invert(1); width: 10%;">
              <span class="carousel-control-prev-icon" aria-hidden="true"></span>
              <span class="visually-hidden">Previous</span>
            </button>
            <button class="carousel-control-next" type="button" data-bs-target="#${carouselId}" data-bs-slide="next" style="filter: invert(1); width: 10%;">
              <span class="carousel-control-next-icon" aria-hidden="true"></span>
              <span class="visually-hidden">Next</span>
            </button>
          </div>`;
      }
    } else {
      // Built-in interactive HTML mockups fallback
      if (isBaru) {
        previewHtml = `
          <div class="preview-mockup-card p-3 text-center" style="background: #0f172a; color: #ffffff; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
            <div class="d-flex align-items-center justify-content-between pb-2 mb-2 border-bottom border-secondary">
              <div class="d-flex align-items-center gap-2">
                <span class="badge bg-danger fs-8">12% Similarity</span>
                <span class="badge bg-primary fs-8"><i class="fa-solid fa-sliders me-1"></i> Panel Filter</span>
              </div>
              <small class="text-light opacity-75 font-semibold">Turnitin New Viewer</small>
            </div>
            <div class="p-3 bg-white text-dark rounded-2 text-start position-relative" style="min-height: 180px; font-family: sans-serif; font-size: 0.75rem;">
              <div class="p-2 mb-2 bg-light rounded border border-warning">
                <strong class="text-indigo d-block mb-1">📄 BAB I PENDAHULUAN</strong>
                <span style="background-color: #fecaca; color: #991b1b; padding: 2px 4px; border-radius: 3px; font-weight: 600;">1 [Metode penelitian kuantitatif adalah penelitian ilmiah...]</span>
                <span style="background-color: #fef08a; color: #854d0e; padding: 2px 4px; border-radius: 3px; font-weight: 600;">2 [...menggunakan analisis data statistik secara terstruktur.]</span>
              </div>
              <div class="p-2 rounded border border-primary" style="background-color: #eff6ff;">
                <strong class="text-dark d-block mb-1"><i class="fa-solid fa-sliders text-indigo me-1"></i> Setting Filter:</strong>
                <span class="text-primary font-bold">Exclude Small Matches: Minimal 8 Words</span>
                <small class="text-muted d-block mt-1">Algoritma otomatis memfilter frasa kecil di bawah ambang kata tanpa perlu memasukkan kata manual.</small>
              </div>
            </div>
          </div>`;
      } else {
        previewHtml = `
          <div class="preview-mockup-card p-3 text-center" style="background: #0f172a; color: #ffffff; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
            <div class="d-flex align-items-center justify-content-between pb-2 mb-2 border-bottom border-secondary">
              <div class="d-flex align-items-center gap-2">
                <span class="badge bg-danger fs-8">18% Similarity</span>
                <span class="badge bg-secondary fs-8"><i class="fa-solid fa-filter me-1"></i> Funnel Icon</span>
              </div>
              <small class="text-light opacity-75 font-semibold">Feedback Studio Classic</small>
            </div>
            <div class="p-3 bg-white text-dark rounded-2 text-start position-relative" style="min-height: 180px; font-family: sans-serif; font-size: 0.75rem;">
              <div class="row g-2">
                <div class="col-8">
                  <div class="p-2 bg-light rounded border border-danger">
                    <strong class="text-danger d-block mb-1">📄 Lembar Naskah Dokumen</strong>
                    <span style="background-color: #fecaca; color: #991b1b; padding: 2px 4px; border-radius: 3px; font-weight: 600;">1 Teks terdeteksi plagiasi dari jurnal ilmiah publik...</span>
                  </div>
                </div>
                <div class="col-4">
                  <div class="p-2 rounded border text-center" style="background: #f8fafc; border-color: #cbd5e1 !important;">
                    <div class="fs-4 text-danger font-bold">18%</div>
                    <div class="my-1"><i class="fa-solid fa-filter text-indigo fs-5" title="Ikon Corong Filter"></i></div>
                    <small class="fs-8 text-muted d-block fw-bold" style="font-size: 0.68rem;">Ikon Corong Filter</small>
                  </div>
                </div>
              </div>
            </div>
          </div>`;
      }
    }

    Swal.fire({
      title: `<span style="font-size: 1.05rem; font-weight: 800; color: #1e293b;">${titleVersion}</span>`,
      html: `
        <div class="text-center">
          ${previewHtml}
        </div>
      `,
      confirmButtonText: 'Tutup Gambar',
      confirmButtonColor: '#334155',
      customClass: {
        popup: 'swal2-popup-image-fit'
      }
    });
  }

  // Aesthetic Open Admin PIN / Authentication Dialog before redirecting to admin.html
  function handleOpenAdminModal() {
    const settings = getAdminSettings();
    const activePin = settings.adminPin || '2001';

    Swal.fire({
      title: `
        <div class="mx-auto mb-2 text-center" style="width: 48px; height: 48px; border-radius: 50%; background: #eff6ff; color: #2563eb; display: flex; align-items: center; justify-content: center; font-size: 1.3rem; border: 1px solid #bfdbfe;">
          <i class="fa-solid fa-shield-halved"></i>
        </div>
        <div style="font-size: 1.05rem; font-weight: 800; color: #1e293b;">Keamanan Panel Admin</div>
        <div style="font-size: 0.76rem; font-weight: 500; color: #64748b; margin-top: 2px;">Masukkan PIN Admin untuk masuk ke dashboard</div>
      `,
      html: `
        <div class="my-2">
          <input type="password" id="swalPinInput" class="form-control pin-input-aesthetic py-2 mx-auto" maxlength="10" placeholder="••••" style="max-width: 200px; font-size: 1.1rem !important;" autofocus autocomplete="off">
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: '<i class="fa-solid fa-key me-1"></i> Masuk Dashboard',
      cancelButtonText: 'Batal',
      confirmButtonColor: '#334155',
      customClass: {
        popup: 'swal2-popup-custom-mobile'
      },
      didOpen: () => {
        const input = document.getElementById('swalPinInput');
        if (input) {
          input.focus();
          input.addEventListener('keyup', function (e) {
            if (e.key === 'Enter') Swal.clickConfirm();
          });
        }
      },
      preConfirm: () => {
        const inputVal = document.getElementById('swalPinInput').value.trim();
        if (!inputVal) {
          Swal.showValidationMessage('Silakan masukkan PIN Admin!');
          return false;
        }
        if (inputVal !== activePin) {
          Swal.showValidationMessage('⚠️ PIN Admin salah! Silakan coba lagi.');
          return false;
        }
        return true;
      }
    }).then((result) => {
      if (result.isConfirmed) {
        sessionStorage.setItem('turnitin_admin_authenticated', 'true');
        window.location.href = 'admin.html';
      }
    });
  }

  // Display Full Mobile-Friendly Tabbed Admin Settings Modal
  function showAdminSettingsModal() {
    const settings = getAdminSettings();

    // Local state for uploaded images
    let tempImgFilesVB = [...(settings.imgVersiBaruFiles || [])];
    let tempImgFilesVL = [...(settings.imgVersiLamaFiles || [])];

    const modalHtml = `
      <div class="text-start" style="font-size: 0.85rem; color: #334155;">
        <!-- Tab Menu Navigation Wrapper (Mobile-Friendly Pill Tabs) -->
        <div class="admin-tab-wrapper">
          <ul class="nav nav-pills admin-tab-nav" id="adminTab" role="tablist">
            <li class="nav-item" role="presentation">
              <button class="nav-link active" id="tab-versi-link" data-bs-toggle="pill" data-bs-target="#adminTabVersi" type="button" role="tab"><i class="fa-solid fa-toggle-on"></i> Versi</button>
            </li>
            <li class="nav-item" role="presentation">
              <button class="nav-link" id="tab-teks-link" data-bs-toggle="pill" data-bs-target="#adminTabTeks" type="button" role="tab"><i class="fa-solid fa-pen"></i> Teks</button>
            </li>
            <li class="nav-item" role="presentation">
              <button class="nav-link" id="tab-img-link" data-bs-toggle="pill" data-bs-target="#adminTabImg" type="button" role="tab"><i class="fa-solid fa-image"></i> Gambar</button>
            </li>
            <li class="nav-item" role="presentation">
              <button class="nav-link" id="tab-pin-link" data-bs-toggle="pill" data-bs-target="#adminTabPin" type="button" role="tab"><i class="fa-solid fa-key"></i> PIN</button>
            </li>
          </ul>
        </div>

        <div class="tab-content" id="adminTabContent">
          <!-- TAB 1: KONTROL VERSI TURNITIN (DEFAULT ACTIVE) -->
          <div class="tab-pane fade show active" id="adminTabVersi" role="tabpanel">
            <div class="admin-card-section">
              <div class="fw-bold mb-3 text-dark d-flex align-items-center gap-2" style="font-size: 0.92rem;">
                <i class="fa-solid fa-toggle-on text-primary fs-6"></i> Kontrol Versi Turnitin (On/Off)
              </div>
              <div class="form-check form-switch mb-3">
                <input class="form-check-input" type="checkbox" id="adminEnableVB" ${settings.enableVersiBaru ? 'checked' : ''} style="cursor: pointer;">
                <label class="form-check-label fw-bold" for="adminEnableVB" style="cursor: pointer;">Tampilkan Versi Baru (New Viewer)</label>
              </div>
              <div class="form-check form-switch mb-2">
                <input class="form-check-input" type="checkbox" id="adminEnableVL" ${settings.enableVersiLama ? 'checked' : ''} style="cursor: pointer;">
                <label class="form-check-label fw-bold" for="adminEnableVL" style="cursor: pointer;">Tampilkan Versi Lama (Feedback Studio)</label>
              </div>
              <div class="p-2 rounded bg-light border mt-3" style="font-size: 0.76rem; color: #64748b; line-height: 1.4;">
                <i class="fa-solid fa-circle-info text-primary me-1"></i> <strong>Catatan:</strong> Jika salah satu versi di-off-kan, opsi tersebut otomatis disembunyikan dari layar pengunjung.
              </div>
            </div>
          </div>

          <!-- TAB 2: EDIT TEKS WEBSITE -->
          <div class="tab-pane fade" id="adminTabTeks" role="tabpanel">
            <div class="admin-card-section">
              <div class="fw-bold mb-3 text-dark d-flex align-items-center gap-2" style="font-size: 0.92rem;">
                <i class="fa-solid fa-pen-to-square text-success fs-6"></i> Edit Teks Website
              </div>
              <div class="admin-field-group">
                <label class="admin-label">Judul Utama Header:</label>
                <input type="text" id="adminHeaderTitle" class="form-control admin-input-custom" value="${escapeHtmlAttr(settings.headerTitle)}">
              </div>
              <div class="admin-field-group">
                <label class="admin-label">Sub-Judul Header:</label>
                <input type="text" id="adminHeaderSubtitle" class="form-control admin-input-custom" value="${escapeHtmlAttr(settings.headerSubtitle)}">
              </div>
              <div class="admin-field-group mb-0">
                <label class="admin-label">Teks Running Banner (Running Text):</label>
                <textarea id="adminMarqueeText" class="form-control admin-input-custom" rows="3" placeholder="Masukkan teks running banner...">${escapeHtmlAttr(settings.marqueeText)}</textarea>
                
                <!-- Live Preview Card for Running Text -->
                <div class="mt-2 p-2 rounded border" style="background: #f8fafc; border-color: #cbd5e1 !important;">
                  <div class="fw-bold mb-1 d-flex align-items-center justify-content-between" style="font-size: 0.75rem; color: #0284c7;">
                    <span><i class="fa-solid fa-eye me-1"></i> Pratinjau Tampilan Langsung (Live Preview):</span>
                    <small class="text-muted italic" style="font-size: 0.68rem;">Real-time update</small>
                  </div>
                  <div class="marquee-container mb-0" style="background: #ffffff; border-left: 3px solid #334155; padding: 6px 8px;">
                    <div class="marquee-badge" style="font-size: 0.65rem; padding: 2px 5px;">
                      <i class="fa-solid fa-bullhorn"></i> PENTING
                    </div>
                    <div class="marquee-content" style="white-space: normal; overflow: visible;">
                      <span id="liveMarqueePreview" style="font-size: 0.8rem; font-weight: 600; color: #334155;">
                        ${settings.marqueeText}
                      </span>
                    </div>
                  </div>
                </div>

                <!-- Interactive Format Toolbar & Variable Cheat-Sheet -->
                <div class="mt-2 p-2 bg-light rounded border">
                  <div class="fw-bold mb-1 d-flex align-items-center justify-content-between" style="font-size: 0.76rem; color: #334155;">
                    <span><i class="fa-solid fa-wand-magic-sparkles text-warning me-1"></i> Format Cepat (Klik untuk menyisipkan):</span>
                  </div>
                  <div class="d-flex flex-wrap gap-1 mb-2">
                    <button type="button" class="btn btn-sm btn-outline-secondary py-0 px-2 fs-8 fw-bold btn-format-tag" data-tag-start="<strong>" data-tag-end="</strong>" title="Sembunyikan / Cetak Tebal"><b>B</b> Tebal</button>
                    <button type="button" class="btn btn-sm btn-outline-secondary py-0 px-2 fs-8 fw-bold btn-format-tag" data-tag-start="<em>" data-tag-end="</em>" title="Cetak Miring"><i>I</i> Miring</button>
                    <button type="button" class="btn btn-sm btn-outline-secondary py-0 px-2 fs-8 fw-bold btn-format-tag" data-tag-start="<u>" data-tag-end="</u>" title="Garis Bawah"><u>U</u> Garis Bawah</button>
                    <button type="button" class="btn btn-sm btn-outline-danger py-0 px-2 fs-8 fw-bold btn-format-tag" data-tag-start="<span style='color: #dc2626; font-weight: 700;'>" data-tag-end="</span>" title="Warna Teks Merah">🔴 Teks Merah</button>
                    <button type="button" class="btn btn-sm btn-outline-warning py-0 px-2 fs-8 fw-bold btn-format-tag" data-tag-start="<span style='color: #d97706; font-weight: 700;'>" data-tag-end="</span>" title="Warna Teks Kuning">🟡 Teks Kuning</button>
                    <button type="button" class="btn btn-sm btn-outline-success py-0 px-2 fs-8 fw-bold btn-format-tag" data-tag-start="<span style='color: #16a34a; font-weight: 700;'>" data-tag-end="</span>" title="Warna Teks Hijau">🟢 Teks Hijau</button>
                    <button type="button" class="btn btn-sm btn-outline-dark py-0 px-2 fs-8 fw-bold btn-format-tag" data-tag-start="📢 " data-tag-end="" title="Ikon Toa">📢 Toa</button>
                    <button type="button" class="btn btn-sm btn-outline-dark py-0 px-2 fs-8 fw-bold btn-format-tag" data-tag-start="⚠️ " data-tag-end="" title="Ikon Peringatan">⚠️ Peringatan</button>
                    <button type="button" class="btn btn-sm btn-outline-dark py-0 px-2 fs-8 fw-bold btn-format-tag" data-tag-start="👉 " data-tag-end="" title="Ikon Penunjuk">👉 Penunjuk</button>
                  </div>
                  <div class="p-2 rounded bg-white border" style="font-size: 0.72rem; color: #475569; line-height: 1.45;">
                    <strong>📖 Referensi Kode Manual:</strong>
                    <div class="row g-1 mt-1">
                      <div class="col-6"><code>&lt;strong&gt;teks&lt;/strong&gt;</code> = <b>Tebal</b></div>
                      <div class="col-6"><code>&lt;em&gt;teks&lt;/em&gt;</code> = <i>Miring</i></div>
                      <div class="col-6"><code>&lt;u&gt;teks&lt;/u&gt;</code> = <u>Garis Bawah</u></div>
                      <div class="col-6"><code>&lt;span style="color:red"&gt;teks&lt;/span&gt;</code> = <span class="text-danger fw-bold">Warna</span></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- TAB 3: UNLIMITED FILE UPLOAD GAMBAR REPORT -->
          <div class="tab-pane fade" id="adminTabImg" role="tabpanel">
            <div class="admin-card-section">
              <div class="fw-bold mb-3 text-dark d-flex align-items-center gap-2" style="font-size: 0.92rem;">
                <i class="fa-solid fa-cloud-arrow-up text-danger fs-6"></i> Upload Gambar Laporan (Galeri Slider)
              </div>
              
              <!-- Versi Baru Upload Dropzone -->
              <div class="admin-dropzone-box">
                <label class="admin-label text-primary">
                  <i class="fa-solid fa-image"></i> Gambar Versi Baru (New Viewer):
                </label>
                <input type="file" id="adminFileInputVB" accept="image/*" multiple class="form-control admin-input-custom mb-2">
                <div id="thumbContainerVB" class="d-flex flex-wrap gap-2 mt-2"></div>
              </div>

              <!-- Versi Lama Upload Dropzone -->
              <div class="admin-dropzone-box mb-1">
                <label class="admin-label text-secondary">
                  <i class="fa-solid fa-image"></i> Gambar Versi Lama (Feedback Studio):
                </label>
                <input type="file" id="adminFileInputVL" accept="image/*" multiple class="form-control admin-input-custom mb-2">
                <div id="thumbContainerVL" class="d-flex flex-wrap gap-2 mt-2"></div>
              </div>

              <small class="text-muted mt-2 d-block" style="font-size: 0.74rem;">
                *Pilih satu atau beberapa gambar sekaligus dari galeri Anda. Gambar akan langsung tersimpan dan tampil di slider saat tombol preview diklik.*
              </small>
            </div>
          </div>

          <!-- TAB 4: KEAMANAN PIN -->
          <div class="tab-pane fade" id="adminTabPin" role="tabpanel">
            <div class="admin-card-section">
              <div class="fw-bold mb-3 text-dark d-flex align-items-center gap-2" style="font-size: 0.92rem;">
                <i class="fa-solid fa-key text-warning fs-6"></i> Ubah PIN Akses Admin
              </div>
              <div class="admin-field-group">
                <label class="admin-label">PIN Admin Baru:</label>
                <input type="text" id="adminPinInput" class="form-control admin-input-custom text-center font-bold" style="letter-spacing: 4px; font-size: 1.1rem; max-width: 240px; margin: 0 auto;" placeholder="2001" value="${escapeHtmlAttr(settings.adminPin || '2001')}">
                <small class="text-muted d-block text-center mt-2" style="font-size: 0.74rem;">*PIN ini digunakan untuk membuka panel admin melalui tombol gear header.</small>
              </div>
            </div>
          </div>

        </div>
      </div>
    `;

    Swal.fire({
      title: '<span style="font-size: 1.15rem; font-weight: 800; color: #1e293b;"><i class="fa-solid fa-sliders text-indigo me-2"></i> Panel Pengaturan Admin</span>',
      html: modalHtml,
      showCancelButton: true,
      confirmButtonText: '<i class="fa-solid fa-floppy-disk me-1"></i> Simpan',
      cancelButtonText: 'Batal',
      denyButtonText: '<i class="fa-solid fa-rotate-left me-1"></i> Reset',
      showDenyButton: true,
      confirmButtonColor: '#334155',
      denyButtonColor: '#dc2626',
      cancelButtonColor: '#64748b',
      customClass: {
        popup: 'swal2-popup-admin-spacious'
      },
      didOpen: () => {
        // Bulletproof Manual Tab Switching Handler for SweetAlert2 Modal
        const tabNavLinks = document.querySelectorAll('#adminTab .nav-link');
        const tabPanes = document.querySelectorAll('#adminTabContent .tab-pane');

        tabNavLinks.forEach((link) => {
          link.addEventListener('click', function (e) {
            e.preventDefault();
            const targetId = this.getAttribute('data-bs-target');
            if (!targetId) return;

            // Remove active status from all tab buttons
            tabNavLinks.forEach((nav) => nav.classList.remove('active'));
            // Add active status to clicked tab button
            this.classList.add('active');

            // Hide all tab panes
            tabPanes.forEach((pane) => {
              pane.classList.remove('show', 'active');
            });

            // Show target tab pane
            const targetPane = document.querySelector(targetId);
            if (targetPane) {
              targetPane.classList.add('show', 'active');
            }
          });
        });

        function renderThumbnails() {
          const boxVB = document.getElementById('thumbContainerVB');
          const boxVL = document.getElementById('thumbContainerVL');

          if (boxVB) {
            if (tempImgFilesVB.length === 0) {
              boxVB.innerHTML = '<small class="text-muted italic" style="font-size: 0.7rem;">Belum ada file gambar diupload (Menggunakan Tampilan Default)</small>';
            } else {
              boxVB.innerHTML = tempImgFilesVB.map((src, idx) => `
                <div class="position-relative d-inline-block border rounded p-1 bg-light">
                  <img src="${src}" style="width: 55px; height: 55px; object-fit: cover;" class="rounded">
                  <button type="button" class="btn btn-danger btn-sm position-absolute top-0 end-0 p-0 rounded-circle d-flex align-items-center justify-content-center" style="width: 18px; height: 18px; font-size: 10px; transform: translate(30%, -30%);" data-remove-vb="${idx}" title="Hapus gambar">&times;</button>
                </div>
              `).join('');
            }
          }

          if (boxVL) {
            if (tempImgFilesVL.length === 0) {
              boxVL.innerHTML = '<small class="text-muted italic" style="font-size: 0.7rem;">Belum ada file gambar diupload (Menggunakan Tampilan Default)</small>';
            } else {
              boxVL.innerHTML = tempImgFilesVL.map((src, idx) => `
                <div class="position-relative d-inline-block border rounded p-1 bg-light">
                  <img src="${src}" style="width: 55px; height: 55px; object-fit: cover;" class="rounded">
                  <button type="button" class="btn btn-danger btn-sm position-absolute top-0 end-0 p-0 rounded-circle d-flex align-items-center justify-content-center" style="width: 18px; height: 18px; font-size: 10px; transform: translate(30%, -30%);" data-remove-vl="${idx}" title="Hapus gambar">&times;</button>
                </div>
              `).join('');
            }
          }
        }

        renderThumbnails();

        // Marquee Text Live Preview Listener
        const areaMarquee = document.getElementById('adminMarqueeText');
        const liveMarqueePreview = document.getElementById('liveMarqueePreview');

        const updateLiveMarqueePreview = () => {
          if (liveMarqueePreview && areaMarquee) {
            liveMarqueePreview.innerHTML = areaMarquee.value.trim() || '<em class="text-muted" style="font-size: 0.76rem;">(Teks running banner kosong)</em>';
          }
        };

        if (areaMarquee) {
          areaMarquee.addEventListener('input', updateLiveMarqueePreview);
        }

        // Format Tag Button Click Handlers for Marquee Textarea
        const formatBtns = document.querySelectorAll('.btn-format-tag');
        formatBtns.forEach((btn) => {
          btn.addEventListener('click', function (e) {
            e.preventDefault();
            if (!areaMarquee) return;

            const tagStart = this.getAttribute('data-tag-start') || '';
            const tagEnd = this.getAttribute('data-tag-end') || '';

            const startPos = areaMarquee.selectionStart;
            const endPos = areaMarquee.selectionEnd;

            if (startPos !== undefined && endPos !== undefined && startPos !== endPos) {
              const selectedText = areaMarquee.value.substring(startPos, endPos);
              const replacement = tagStart + selectedText + tagEnd;
              areaMarquee.value = areaMarquee.value.substring(0, startPos) + replacement + areaMarquee.value.substring(endPos);
              areaMarquee.selectionStart = startPos + tagStart.length;
              areaMarquee.selectionEnd = startPos + tagStart.length + selectedText.length;
            } else {
              const currentVal = areaMarquee.value;
              const insertText = tagEnd ? `${tagStart}Teks${tagEnd}` : tagStart;
              areaMarquee.value = currentVal + (currentVal ? ' ' : '') + insertText;
            }
            updateLiveMarqueePreview();
            areaMarquee.focus();
          });
        });

        document.addEventListener('click', function thumbDeleteHandler(e) {
          const btnRemoveVB = e.target.closest('[data-remove-vb]');
          const btnRemoveVL = e.target.closest('[data-remove-vl]');

          if (btnRemoveVB) {
            const idx = parseInt(btnRemoveVB.getAttribute('data-remove-vb'), 10);
            tempImgFilesVB.splice(idx, 1);
            renderThumbnails();
          } else if (btnRemoveVL) {
            const idx = parseInt(btnRemoveVL.getAttribute('data-remove-vl'), 10);
            tempImgFilesVL.splice(idx, 1);
            renderThumbnails();
          }
        });

        const inputVB = document.getElementById('adminFileInputVB');
        const inputVL = document.getElementById('adminFileInputVL');

        if (inputVB) {
          inputVB.addEventListener('change', function (e) {
            const files = Array.from(e.target.files);
            if (!files || files.length === 0) return;

            let readCount = 0;
            files.forEach((file) => {
              const reader = new FileReader();
              reader.onload = function (evt) {
                tempImgFilesVB.push(evt.target.result);
                readCount++;
                if (readCount === files.length) {
                  renderThumbnails();
                  inputVB.value = '';
                }
              };
              reader.readAsDataURL(file);
            });
          });
        }

        if (inputVL) {
          inputVL.addEventListener('change', function (e) {
            const files = Array.from(e.target.files);
            if (!files || files.length === 0) return;

            let readCount = 0;
            files.forEach((file) => {
              const reader = new FileReader();
              reader.onload = function (evt) {
                tempImgFilesVL.push(evt.target.result);
                readCount++;
                if (readCount === files.length) {
                  renderThumbnails();
                  inputVL.value = '';
                }
              };
              reader.readAsDataURL(file);
            });
          });
        }
      },
      preConfirm: () => {
        const enableVB = document.getElementById('adminEnableVB').checked;
        const enableVL = document.getElementById('adminEnableVL').checked;
        const pinVal = document.getElementById('adminPinInput').value.trim();

        if (!enableVB && !enableVL) {
          Swal.showValidationMessage('Minimal harus ada 1 versi yang di-aktifkan (On)!');
          return false;
        }

        if (!pinVal) {
          Swal.showValidationMessage('PIN Admin tidak boleh kosong!');
          return false;
        }

        return {
          adminPin: pinVal,
          enableVersiBaru: enableVB,
          enableVersiLama: enableVL,
          headerTitle: document.getElementById('adminHeaderTitle').value.trim() || defaultAdminSettings.headerTitle,
          headerSubtitle: document.getElementById('adminHeaderSubtitle').value.trim() || defaultAdminSettings.headerSubtitle,
          marqueeText: document.getElementById('adminMarqueeText').value.trim() || defaultAdminSettings.marqueeText,
          gasWebAppUrl: localStorage.getItem('gas_web_app_url') || '',
          imgVersiBaruFiles: tempImgFilesVB,
          imgVersiLamaFiles: tempImgFilesVL
        };
      }
    }).then((result) => {
      if (result.isConfirmed && result.value) {
        saveAdminSettings(result.value, function () {
          applyAdminSettingsToUI();
          renderApp();
        });
        applyAdminSettingsToUI();
        renderApp();
        Swal.fire({
          toast: true,
          position: 'top',
          icon: 'success',
          title: 'Pengaturan Admin Berhasil Disimpan & Disinkronkan!',
          showConfirmButton: false,
          timer: 2000
        });
      } else if (result.isDenied) {
        saveAdminSettings(defaultAdminSettings, function () {
          applyAdminSettingsToUI();
          renderApp();
        });
        applyAdminSettingsToUI();
        renderApp();
        Swal.fire({
          toast: true,
          position: 'top',
          icon: 'info',
          title: 'Pengaturan Dikembalikan ke Default!',
          showConfirmButton: false,
          timer: 2000
        });
      }
    });
  }

  function escapeHtmlAttr(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  let currentRenderedVersion = null;

  // Main Render Function according to active version
  function renderApp() {
    if (state.isVersiBaru) {
      renderVersiBaruUI();
    } else {
      renderVersiLamaUI();
    }

    // Render guide accordion ONLY when version changes or on initial load
    if (currentRenderedVersion !== state.isVersiBaru) {
      currentRenderedVersion = state.isVersiBaru;
      renderGuideAccordionUI();
    }
  }

  // Render dynamic guide accordion for Section 6 matching active version cards exact order & title names
  function renderGuideAccordionUI() {
    const container = document.getElementById('guideAccordionContainer');
    if (!container) return;

    const isBaru = state.isVersiBaru;

    if (isBaru) {
      const savedVB = localStorage.getItem('activeGuideVB');
      const activeVB = (savedVB !== null) ? savedVB : '';

      container.innerHTML = `
        <div class="accordion guide-accordion" id="accordionGuideVB">

          <!-- 1. Exclude Bibliography -->
          <div class="accordion-item">
            <h2 class="accordion-header" id="headingVB_Biblio">
              <button class="accordion-button ${activeVB === 'collapseVB_Biblio' ? '' : 'collapsed'}" type="button" data-bs-toggle="collapse" data-bs-target="#collapseVB_Biblio" aria-expanded="${activeVB === 'collapseVB_Biblio' ? 'true' : 'false'}" aria-controls="collapseVB_Biblio">
                <i class="fa-solid fa-book-bookmark me-2 text-indigo"></i> 1. Exclude Bibliography
              </button>
            </h2>
            <div id="collapseVB_Biblio" class="accordion-collapse collapse ${activeVB === 'collapseVB_Biblio' ? 'show' : ''}" aria-labelledby="headingVB_Biblio" data-bs-parent="#accordionGuideVB">
              <div class="accordion-body">
                <p class="mb-2"><strong>Fungsi Utama:</strong> Menyembunyikan seluruh bagian Daftar Pustaka / Referensi / <em>Works Cited</em> di bagian akhir naskah dari perhitungan persentase <em>similarity index</em> Turnitin.</p>
                
                <p class="mb-2 fs-7 text-muted"><strong>Cara Kerja Pemindaian Sistem:</strong> Sistem Turnitin memindai dokumen dari baris pertama judul bab Daftar Pustaka hingga akhir dokumen. Agar pemindaian 100% berhasil, terdapat 2 aturan utama yang wajib dipatuhi:</p>

                <!-- Warning Alert 1: Halaman Baru (Page Break) -->
                <div class="edu-card warning mb-2">
                  <i class="fa-solid fa-file-export me-1"></i> <strong>Wajib Ditempatkan di Halaman Baru (Page Break):</strong><br>
                  Sangat disarankan meletakkan judul <strong>DAFTAR PUSTAKA</strong> di awal <strong>halaman baru</strong> (menggunakan <em>Page Break</em> di MS Word). Pada banyak kasus, jika judul Daftar Pustaka disatukan atau menempel langsung di bawah paragraf pembahasan sebelumnya (dalam halaman yang sama), sistem Turnitin <strong>sering gagal mengenali awalan bab</strong> sehingga filter otomatis tidak berfungsi!
                </div>

                <!-- Warning Alert 2: Penulisan Judul Bab -->
                <div class="edu-card danger mb-3">
                  <i class="fa-solid fa-triangle-exclamation me-1"></i> <strong>Penulisan Judul Bab Wajib Standar (Tanpa Nomor):</strong><br>
                  Judul bab harus ditulis di baris tersendiri dengan kata baku kapital. Jika judul bab diberi nomor bab (misal: <em>BAB V DAFTAR PUSTAKA</em> atau <em>V. DAFTAR PUSTAKA</em>), menggunakan typo, atau menggunakan simbol, Turnitin <strong>TIDAK AKAN</strong> menganggapnya sebagai daftar pustaka sehingga seluruh referensi tetap terhitung plagiasi!
                </div>

                <h6 class="font-bold fs-7 mb-2 text-navy"><i class="fa-solid fa-table me-1"></i> Tabel Contoh Penulisan Judul Bab Daftar Pustaka:</h6>
                <div class="table-responsive">
                  <table class="table table-bordered table-sm fs-7 mb-0">
                    <thead class="table-light">
                      <tr>
                        <th style="width: 50%;">Judul Benar (100% Lolos Filter ✅)</th>
                        <th style="width: 50%;">Judul Salah (Gagal Filter ❌)</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td><span class="code-tag-valid">DAFTAR PUSTAKA</span></td>
                        <td><span class="code-tag-invalid">BAB V DAFTAR PUSTAKA</span></td>
                      </tr>
                      <tr>
                        <td><span class="code-tag-valid">Daftar Pustaka</span></td>
                        <td><span class="code-tag-invalid">V. DAFTAR PUSTAKA</span></td>
                      </tr>
                      <tr>
                        <td><span class="code-tag-valid">BIBLIOGRAPHY</span></td>
                        <td><span class="code-tag-invalid">5. Daftar Pustaka</span></td>
                      </tr>
                      <tr>
                        <td><span class="code-tag-valid">REFERENCES</span></td>
                        <td><span class="code-tag-invalid">Daptar Pustaka</span></td>
                      </tr>
                      <tr>
                        <td><span class="code-tag-valid">LITERATURE CITED</span></td>
                        <td><span class="code-tag-invalid">Daftar_Pustaka</span></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

          <!-- 2. Exclude Quoted Text -->
          <div class="accordion-item">
            <h2 class="accordion-header" id="headingVB_Quoted">
              <button class="accordion-button ${activeVB === 'collapseVB_Quoted' ? '' : 'collapsed'}" type="button" data-bs-toggle="collapse" data-bs-target="#collapseVB_Quoted" aria-expanded="${activeVB === 'collapseVB_Quoted' ? 'true' : 'false'}" aria-controls="collapseVB_Quoted">
                <i class="fa-solid fa-quote-right me-2 text-indigo"></i> 2. Exclude Quoted Text
              </button>
            </h2>
            <div id="collapseVB_Quoted" class="accordion-collapse collapse ${activeVB === 'collapseVB_Quoted' ? 'show' : ''}" aria-labelledby="headingVB_Quoted" data-bs-parent="#accordionGuideVB">
              <div class="accordion-body">
                <p class="mb-2"><strong>Fungsi Utama:</strong> Mengabaikan seluruh kalimat atau paragraf yang diapit oleh tanda kutip ganda standar <code>"..."</code> dari laporan plagiarisme.</p>
                
                <div class="row g-2 mb-2">
                  <div class="col-12 col-md-6">
                    <div class="edu-card success">
                      <strong class="d-block mb-1 text-success"><i class="fa-solid fa-circle-check me-1"></i> Contoh Kutipan Benar (Lolos Filter):</strong>
                      <span class="fs-7">"Menurut Sugiyono (2020), metode penelitian kuantitatif adalah..."</span><br>
                      <small class="text-muted">(Kutipan teori wajar & menggunakan tanda kutip ganda standar)</small>
                    </div>
                  </div>
                  <div class="col-12 col-md-6">
                    <div class="edu-card danger">
                      <strong class="d-block mb-1 text-danger"><i class="fa-solid fa-circle-xmark me-1"></i> Contoh Kutipan Salah (Gagal Filter):</strong>
                      <span class="fs-7">Seluruh halaman atau paragraf sengaja dibungkus tanda kutip ganda.</span><br>
                      <small class="text-muted">(Terdeteksi sebagai manipulasi teks / Flagging oleh Turnitin)</small>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 3. Exclude Cited Text -->
          <div class="accordion-item">
            <h2 class="accordion-header" id="headingVB_Cited">
              <button class="accordion-button ${activeVB === 'collapseVB_Cited' ? '' : 'collapsed'}" type="button" data-bs-toggle="collapse" data-bs-target="#collapseVB_Cited" aria-expanded="${activeVB === 'collapseVB_Cited' ? 'true' : 'false'}" aria-controls="collapseVB_Cited">
                <i class="fa-solid fa-asterisk me-2 text-indigo"></i> 3. Exclude Cited Text
              </button>
            </h2>
            <div id="collapseVB_Cited" class="accordion-collapse collapse ${activeVB === 'collapseVB_Cited' ? 'show' : ''}" aria-labelledby="headingVB_Cited" data-bs-parent="#accordionGuideVB">
              <div class="accordion-body">
                <p class="mb-2"><strong>Fungsi Utama:</strong> Menyembunyikan kalimat yang memuat sitasi atau rujukan ilmiah (nama penulis, tahun penerbitan, atau nomor referensi) dari perhitungan persentase kesamaan Turnitin.</p>
                
                <p class="mb-2 fs-7 text-muted"><strong>Cara Kerja Pemindaian Sistem:</strong> Algoritma Turnitin secara cerdas mengenali pola struktur penulisan sitasi standar akademik (<em>in-text citation</em>) yang menempel pada kalimat pembahasan.</p>

                <h6 class="font-bold fs-7 mb-2 text-navy"><i class="fa-solid fa-list-check me-1"></i> Contoh Format Sitasi Standar yang Diakui Sistem (✅):</h6>
                <div class="row g-2 mb-3">
                  <div class="col-12 col-md-4">
                    <div class="edu-card success h-100">
                      <strong class="d-block mb-1 text-success fs-7"><i class="fa-solid fa-circle-check me-1"></i> Format APA / Harvard:</strong>
                      <span class="fs-7 code-tag-valid">(Sugiyono, 2020)</span><br>
                      <small class="text-muted">(Nama Penulis, Tahun)</small>
                    </div>
                  </div>
                  <div class="col-12 col-md-4">
                    <div class="edu-card success h-100">
                      <strong class="d-block mb-1 text-success fs-7"><i class="fa-solid fa-circle-check me-1"></i> Format Naratif:</strong>
                      <span class="fs-7 code-tag-valid">Menurut Arikunto (2019)...</span><br>
                      <small class="text-muted">(Sapaan Penulis + Tahun)</small>
                    </div>
                  </div>
                  <div class="col-12 col-md-4">
                    <div class="edu-card success h-100">
                      <strong class="d-block mb-1 text-success fs-7"><i class="fa-solid fa-circle-check me-1"></i> Format Numerik IEEE:</strong>
                      <span class="fs-7 code-tag-valid">...dijelaskan pada [1]</span><br>
                      <small class="text-muted">(Sitasi Nomor Kurung Siku)</small>
                    </div>
                  </div>
                </div>

                <div class="edu-card info mb-0" style="background-color: #f0fdf4; border-color: #bbf7d0; color: #166534;">
                  <i class="fa-solid fa-lightbulb me-1"></i> <strong>Manfaat Utama:</strong> Sangat efektif mereduksi persentase similarity pada <strong>BAB II (Kajian Pustaka / Landasan Teori)</strong> yang sarat akan kutipan referensi ilmiah.
                </div>
              </div>
            </div>
          </div>

          <!-- 4. Exclude Small Matches -->
          <div class="accordion-item">
            <h2 class="accordion-header" id="headingVB_Matches">
              <button class="accordion-button ${activeVB === 'collapseVB_Matches' ? '' : 'collapsed'}" type="button" data-bs-toggle="collapse" data-bs-target="#collapseVB_Matches" aria-expanded="${activeVB === 'collapseVB_Matches' ? 'true' : 'false'}" aria-controls="collapseVB_Matches">
                <i class="fa-solid fa-filter me-2 text-indigo"></i> 4. Exclude Small Matches
              </button>
            </h2>
            <div id="collapseVB_Matches" class="accordion-collapse collapse ${activeVB === 'collapseVB_Matches' ? 'show' : ''}" aria-labelledby="headingVB_Matches" data-bs-parent="#accordionGuideVB">
              <div class="accordion-body">
                <p class="mb-2"><strong>Fungsi Utama:</strong> Mengabaikan frasa atau kombinasi kata kecil yang berulang dalam naskah berdasarkan jumlah ambang kata (<em>Words</em>) yang ditentukan.</p>

                <h6 class="font-bold fs-7 mb-1 text-navy"><i class="fa-solid fa-circle-info me-1"></i> Aturan & Cara Kerja Sistem Turnitin:</h6>
                <ul class="ps-3 mb-2 fs-7 text-muted">
                  <li class="mb-1"><strong>Minimal Diisi 8 Words:</strong> Pada tampilan Turnitin terbaru (New Viewer), ambang batas <em>Exclude Small Matches</em> diatur secara resmi oleh sistem global dengan <strong>minimal 8 Words</strong> (tidak dapat diisi angka 1 - 7 kata).</li>
                  <li class="mb-1"><strong>Tidak Bisa Request Kata Khusus:</strong> Pengguna <strong>tidak dapat memilih atau menentukan kata/kosa kata tertentu secara manual</strong> untuk diabaikan oleh sistem.</li>
                  <li class="mb-1"><strong>Otomatis Diproses Sistem:</strong> Seluruh kata atau sumber yang difilter akan <strong>secara otomatis dipindai dan ditentukan oleh algoritma sistem Turnitin</strong> berdasarkan nilai ambang kata yang dipilih.</li>
                </ul>

                <div class="edu-card warning mb-2">
                  <i class="fa-solid fa-graduation-cap me-1"></i> <strong>Rekomendasi Standar Perguruan Tinggi:</strong> Mayoritas perpustakaan kampus merekomendasikan penggunaan <strong>8 - 10 Words</strong> untuk memfilter frasa umum yang tidak disengaja.
                </div>

                <div class="edu-card danger mb-0">
                  <i class="fa-solid fa-triangle-exclamation me-1"></i> <strong>Peringatan Penting Pengisian Angka:</strong><br>
                  Jangan memasukkan angka filter <em>matches</em> yang terlalu besar (misal: 50–100 Words). Pengisian angka yang terlalu tinggi akan menyebabkan pemotongan frasa secara berlebihan sehingga laporan menjadi tidak wajar dan skor plagiarisme secara tidak sah turun hingga <strong>0%</strong>.<br>
                  <small class="d-block mt-1">👉 <strong>Saran:</strong> Selalu sesuaikan setelan angka filter <em>matches</em> dengan pedoman resmi yang berlaku di instansi / perguruan tinggi masing-masing.</small>
                </div>
              </div>
            </div>
          </div>

        </div>
      `;
    } else {
      const savedVL = localStorage.getItem('activeGuideVL');
      const activeVL = (savedVL !== null) ? savedVL : '';

      container.innerHTML = `
        <div class="accordion guide-accordion" id="accordionGuideVL">

          <!-- 1. Exclude Quotes -->
          <div class="accordion-item">
            <h2 class="accordion-header" id="headingVL_Quotes">
              <button class="accordion-button ${activeVL === 'collapseVL_Quotes' ? '' : 'collapsed'}" type="button" data-bs-toggle="collapse" data-bs-target="#collapseVL_Quotes" aria-expanded="${activeVL === 'collapseVL_Quotes' ? 'true' : 'false'}" aria-controls="collapseVL_Quotes">
                <i class="fa-solid fa-quote-right me-2 text-indigo"></i> 1. Exclude Quotes
              </button>
            </h2>
            <div id="collapseVL_Quotes" class="accordion-collapse collapse ${activeVL === 'collapseVL_Quotes' ? 'show' : ''}" aria-labelledby="headingVL_Quotes" data-bs-parent="#accordionGuideVL">
              <div class="accordion-body">
                <p class="mb-2"><strong>Fungsi Utama:</strong> Mengabaikan seluruh kalimat atau paragraf yang diapit oleh tanda kutip ganda standar <code>"..."</code> dari laporan plagiarisme Feedback Studio.</p>
                
                <div class="row g-2 mb-2">
                  <div class="col-12 col-md-6">
                    <div class="edu-card success">
                      <strong class="d-block mb-1 text-success"><i class="fa-solid fa-circle-check me-1"></i> Contoh Kutipan Benar (Lolos Filter):</strong>
                      <span class="fs-7">"Menurut Sugiyono (2020), metode penelitian kuantitatif adalah..."</span><br>
                      <small class="text-muted">(Kutipan teori wajar & menggunakan tanda kutip ganda standar)</small>
                    </div>
                  </div>
                  <div class="col-12 col-md-6">
                    <div class="edu-card danger">
                      <strong class="d-block mb-1 text-danger"><i class="fa-solid fa-circle-xmark me-1"></i> Contoh Kutipan Salah (Gagal Filter):</strong>
                      <span class="fs-7">Seluruh halaman atau paragraf sengaja dibungkus tanda kutip ganda.</span><br>
                      <small class="text-muted">(Terdeteksi sebagai manipulasi teks / Flagging oleh Turnitin)</small>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 2. Exclude Bibliography -->
          <div class="accordion-item">
            <h2 class="accordion-header" id="headingVL_Biblio">
              <button class="accordion-button ${activeVL === 'collapseVL_Biblio' ? '' : 'collapsed'}" type="button" data-bs-toggle="collapse" data-bs-target="#collapseVL_Biblio" aria-expanded="${activeVL === 'collapseVL_Biblio' ? 'true' : 'false'}" aria-controls="collapseVL_Biblio">
                <i class="fa-solid fa-book-bookmark me-2 text-indigo"></i> 2. Exclude Bibliography
              </button>
            </h2>
            <div id="collapseVL_Biblio" class="accordion-collapse collapse ${activeVL === 'collapseVL_Biblio' ? 'show' : ''}" aria-labelledby="headingVL_Biblio" data-bs-parent="#accordionGuideVL">
              <div class="accordion-body">
                <p class="mb-2"><strong>Fungsi Utama:</strong> Menyembunyikan seluruh bagian Daftar Pustaka / Referensi / <em>Works Cited</em> di bagian akhir naskah dari perhitungan persentase <em>similarity index</em> Turnitin.</p>
                
                <p class="mb-2 fs-7 text-muted"><strong>Cara Kerja Pemindaian Sistem:</strong> Sistem Turnitin memindai dokumen dari baris pertama judul bab Daftar Pustaka hingga akhir dokumen. Agar pemindaian 100% berhasil, terdapat 2 aturan utama yang wajib dipatuhi:</p>

                <!-- Warning Alert 1: Halaman Baru (Page Break) -->
                <div class="edu-card warning mb-2">
                  <i class="fa-solid fa-file-export me-1"></i> <strong>Wajib Ditempatkan di Halaman Baru (Page Break):</strong><br>
                  Sangat disarankan meletakkan judul <strong>DAFTAR PUSTAKA</strong> di awal <strong>halaman baru</strong> (menggunakan <em>Page Break</em> di MS Word). Pada banyak kasus, jika judul Daftar Pustaka disatukan atau menempel langsung di bawah paragraf pembahasan sebelumnya (dalam halaman yang sama), sistem Turnitin <strong>sering gagal mengenali awalan bab</strong> sehingga filter otomatis tidak berfungsi!
                </div>

                <!-- Warning Alert 2: Penulisan Judul Bab -->
                <div class="edu-card danger mb-3">
                  <i class="fa-solid fa-triangle-exclamation me-1"></i> <strong>Penulisan Judul Bab Wajib Standar (Tanpa Nomor):</strong><br>
                  Judul bab harus ditulis di baris tersendiri dengan kata baku kapital. Jika judul bab diberi nomor bab (misal: <em>BAB V DAFTAR PUSTAKA</em> atau <em>V. DAFTAR PUSTAKA</em>), menggunakan typo, atau menggunakan simbol, Turnitin <strong>TIDAK AKAN</strong> menganggapnya sebagai daftar pustaka sehingga seluruh referensi tetap terhitung plagiasi!
                </div>

                <h6 class="font-bold fs-7 mb-2 text-navy"><i class="fa-solid fa-table me-1"></i> Tabel Contoh Penulisan Judul Bab Daftar Pustaka:</h6>
                <div class="table-responsive">
                  <table class="table table-bordered table-sm fs-7 mb-0">
                    <thead class="table-light">
                      <tr>
                        <th style="width: 50%;">Judul Benar (100% Lolos Filter ✅)</th>
                        <th style="width: 50%;">Judul Salah (Gagal Filter ❌)</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td><span class="code-tag-valid">DAFTAR PUSTAKA</span></td>
                        <td><span class="code-tag-invalid">BAB V DAFTAR PUSTAKA</span></td>
                      </tr>
                      <tr>
                        <td><span class="code-tag-valid">Daftar Pustaka</span></td>
                        <td><span class="code-tag-invalid">V. DAFTAR PUSTAKA</span></td>
                      </tr>
                      <tr>
                        <td><span class="code-tag-valid">BIBLIOGRAPHY</span></td>
                        <td><span class="code-tag-invalid">5. Daftar Pustaka</span></td>
                      </tr>
                      <tr>
                        <td><span class="code-tag-valid">REFERENCES</span></td>
                        <td><span class="code-tag-invalid">Daptar Pustaka</span></td>
                      </tr>
                      <tr>
                        <td><span class="code-tag-valid">LITERATURE CITED</span></td>
                        <td><span class="code-tag-invalid">Daftar_Pustaka</span></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

          <!-- 3. Exclude Matches -->
          <div class="accordion-item">
            <h2 class="accordion-header" id="headingVL_Matches">
              <button class="accordion-button ${activeVL === 'collapseVL_Matches' ? '' : 'collapsed'}" type="button" data-bs-toggle="collapse" data-bs-target="#collapseVL_Matches" aria-expanded="${activeVL === 'collapseVL_Matches' ? 'true' : 'false'}" aria-controls="collapseVL_Matches">
                <i class="fa-solid fa-filter me-2 text-indigo"></i> 3. Exclude Matches
              </button>
            </h2>
            <div id="collapseVL_Matches" class="accordion-collapse collapse ${activeVL === 'collapseVL_Matches' ? 'show' : ''}" aria-labelledby="headingVL_Matches" data-bs-parent="#accordionGuideVL">
              <div class="accordion-body">
                <p class="mb-2"><strong>Fungsi Utama:</strong> Mengabaikan kecocokan frasa kecil atau rujukan sumber minor dari laporan plagiarisme Feedback Studio dengan 2 pilihan mode:</p>
                
                <h6 class="font-bold fs-7 mb-2 text-navy"><i class="fa-solid fa-layer-group me-1"></i> Penjelasan 2 Mode Penyaringan Versi Lama:</h6>
                <div class="row g-2 mb-3">
                  <div class="col-12 col-md-6">
                    <div class="edu-card success h-100">
                      <strong class="d-block mb-1 text-success fs-7"><i class="fa-solid fa-font me-1"></i> Mode Words (Kata):</strong>
                      <span class="fs-7 text-muted">Mengabaikan frasa yang jumlah katanya di bawah angka tertentu (misal: <code>< 10 Words</code>). Bebas diisi berapa saja (minimal 1 kata).</span><br>
                      <small class="text-dark font-semibold d-block mt-1"><i class="fa-solid fa-star text-warning me-1"></i> Rekomendasi: <strong>8 - 10 Words</strong></small>
                    </div>
                  </div>
                  <div class="col-12 col-md-6">
                    <div class="edu-card success h-100">
                      <strong class="d-block mb-1 text-success fs-7"><i class="fa-solid fa-percent me-1"></i> Mode Persentase (%):</strong>
                      <span class="fs-7 text-muted">Mengabaikan seluruh sumber rujukan yang persentase kesamaannya di bawah nilai tertentu (misal: <code>< 1%</code>).</span><br>
                      <small class="text-dark font-semibold d-block mt-1"><i class="fa-solid fa-star text-warning me-1"></i> Rekomendasi: <strong>1%</strong></small>
                    </div>
                  </div>
                </div>

                <h6 class="font-bold fs-7 mb-1 text-navy"><i class="fa-solid fa-circle-info me-1"></i> Ketentuan Penting Sistem Turnitin:</h6>
                <ul class="ps-3 mb-2 fs-7 text-muted">
                  <li class="mb-1"><strong>Tidak Bisa Request Kata Khusus:</strong> Pengguna <strong>tidak dapat memilih atau menentukan kata/kosa kata tertentu secara manual</strong> untuk diabaikan oleh sistem.</li>
                  <li class="mb-1"><strong>Otomatis Diproses Sistem:</strong> Seluruh kata atau sumber yang difilter akan <strong>secara otomatis dipindai dan ditentukan oleh algoritma sistem Turnitin</strong> berdasarkan nilai ambang mode % atau Words yang dipilih.</li>
                </ul>

                <div class="edu-card warning mb-2">
                  <i class="fa-solid fa-graduation-cap me-1"></i> <strong>Rekomendasi Standar Perguruan Tinggi:</strong> Mayoritas perpustakaan kampus merekomendasikan penggunaan <strong>1%</strong> atau <strong>8 - 10 Words</strong> untuk memfilter frasa umum yang tidak disengaja.
                </div>

                <div class="edu-card danger mb-0">
                  <i class="fa-solid fa-triangle-exclamation me-1"></i> <strong>Peringatan Penting Pengisian Angka:</strong><br>
                  Jangan memasukkan angka filter <em>matches</em> yang terlalu besar (misal: 50–100 Words atau > 5%). Pengisian angka yang terlalu tinggi akan menyebabkan pemotongan frasa secara berlebihan sehingga laporan menjadi tidak wajar dan skor plagiarisme secara tidak sah turun hingga <strong>0%</strong>.<br>
                  <small class="d-block mt-1">👉 <strong>Saran:</strong> Selalu sesuaikan setelan angka filter <em>matches</em> dengan pedoman resmi yang berlaku di instansi / perguruan tinggi masing-masing.</small>
                </div>
              </div>
            </div>
          </div>

        </div>
      `;
    }
  }

  // Render Filters for VERSI BARU (New Viewer)
  // Options: Exclude Bibliography, Exclude Quoted Text, Exclude Cited Text, Exclude Small Matches (Words ONLY!)
  function renderVersiBaruUI() {
    const data = state.versiBaru;

    const html = `
      <!-- 1. Exclude Bibliography -->
      <div class="filter-card filter-card-vb ${data.bibliography ? 'active' : ''}" id="cardVB_Biblio">
        <div class="filter-card-header">
          <div class="filter-info">
            <div class="filter-icon-box"><i class="fa-solid fa-book-bookmark"></i></div>
            <div>
              <div class="filter-title">Exclude Bibliography</div>
              <div class="filter-subtext">Sembunyikan Daftar Pustaka / Referensi</div>
            </div>
          </div>
          <div class="status-badge">
            ${data.bibliography ? '<i class="fa-solid fa-check text-success"></i> Active' : '<i class="fa-solid fa-xmark text-danger"></i> Off'}
          </div>
        </div>
      </div>

      <!-- 2. Exclude Quoted Text -->
      <div class="filter-card filter-card-vb ${data.quotedText ? 'active' : ''}" id="cardVB_Quoted">
        <div class="filter-card-header">
          <div class="filter-info">
            <div class="filter-icon-box"><i class="fa-solid fa-quote-right"></i></div>
            <div>
              <div class="filter-title">Exclude Quoted Text</div>
              <div class="filter-subtext">Sembunyikan teks dalam tanda kutip ("...")</div>
            </div>
          </div>
          <div class="status-badge">
            ${data.quotedText ? '<i class="fa-solid fa-check text-success"></i> Active' : '<i class="fa-solid fa-xmark text-danger"></i> Off'}
          </div>
        </div>
      </div>

      <!-- 3. Exclude Cited Text -->
      <div class="filter-card filter-card-vb ${data.citedText ? 'active' : ''}" id="cardVB_Cited">
        <div class="filter-card-header">
          <div class="filter-info">
            <div class="filter-icon-box"><i class="fa-solid fa-asterisk"></i></div>
            <div>
              <div class="filter-title">Exclude Cited Text</div>
              <div class="filter-subtext">Sembunyikan teks sitasi / kutipan rujukan</div>
            </div>
          </div>
          <div class="status-badge">
            ${data.citedText ? '<i class="fa-solid fa-check text-success"></i> Active' : '<i class="fa-solid fa-xmark text-danger"></i> Off'}
          </div>
        </div>
      </div>

      <!-- 4. Exclude Small Matches (Words ONLY for Versi Baru!) -->
      <div class="filter-card filter-card-matches filter-card-vb ${data.matchesMode !== 'Off' ? 'active' : ''}" style="cursor: default;">
        <div class="filter-card-header align-items-center">
          <div class="filter-info">
            <div class="filter-icon-box"><i class="fa-solid fa-filter"></i></div>
            <div style="min-width: 0; flex: 1;">
              <div class="filter-title">Exclude Small Matches</div>
              <div class="filter-subtext">Abaikan kecocokan kecil (word)</div>
            </div>
          </div>
          <div class="matches-pill-group">
            <button type="button" class="matches-pill-btn ${data.matchesMode === 'Off' ? 'active' : ''}" id="btnVBPillOff">Off</button>
            <button type="button" class="matches-pill-btn ${data.matchesMode === 'Words' ? 'active' : ''}" id="btnVBPillWords">Words</button>
          </div>
        </div>

        <div class="custom-input-box ${data.matchesMode === 'Words' ? 'show' : ''}" id="boxVBMatches">
          <div class="d-flex align-items-center justify-content-between flex-wrap gap-2">
            <label class="form-label font-semibold mb-0" style="font-size: 0.72rem; color: #475569;">
              Minimum Words: <span id="iconVBStatus"></span>
            </label>
            <div class="input-group input-group-sm" style="width: 108px; flex-shrink: 0;">
              <input type="number" min="8" class="form-control form-control-custom" id="inputVBWords" value="${data.customValue !== undefined ? data.customValue : ''}" placeholder="Angka">
              <span class="input-group-text bg-light font-bold py-0 px-2 fs-7" style="height: 28px;">Words</span>
            </div>
          </div>
        </div>
      </div>
    `;

    dynamicFilterCards.innerHTML = html;
    bindVersiBaruEvents();
  }

  function updateVBStatusIcon(valStr) {
    const iconEl = document.getElementById('iconVBStatus');
    if (!iconEl) return;
    if (!valStr || valStr.trim() === '') {
      iconEl.innerHTML = '<i class="fa-solid fa-xmark text-danger ms-1" title="Harus diisi minimal 8 words"></i>';
      return;
    }
    const val = parseInt(valStr, 10);
    if (!isNaN(val) && val >= 8) {
      iconEl.innerHTML = '<i class="fa-solid fa-check text-success ms-1" title="Sesuai (minimal 8 words)"></i>';
    } else {
      iconEl.innerHTML = '<i class="fa-solid fa-xmark text-danger ms-1" title="Harus minimal 8 words"></i>';
    }
  }

  function bindVersiBaruEvents() {
    const data = state.versiBaru;

    document.getElementById('cardVB_Biblio').addEventListener('click', () => {
      data.bibliography = !data.bibliography;
      renderApp();
    });

    document.getElementById('cardVB_Quoted').addEventListener('click', () => {
      data.quotedText = !data.quotedText;
      renderApp();
    });

    document.getElementById('cardVB_Cited').addEventListener('click', () => {
      data.citedText = !data.citedText;
      renderApp();
    });

    document.getElementById('btnVBPillOff').addEventListener('click', (e) => {
      e.stopPropagation();
      data.matchesMode = 'Off';
      renderApp();
    });

    document.getElementById('btnVBPillWords').addEventListener('click', (e) => {
      e.stopPropagation();
      data.matchesMode = 'Words';
      // Biarkan kosong sampai visitor mengisi manual
      if (data.customValue === undefined) data.customValue = '';
      renderApp();
    });

    const inputVBWords = document.getElementById('inputVBWords');
    if (inputVBWords) {
      updateVBStatusIcon(inputVBWords.value);
      inputVBWords.addEventListener('input', (e) => {
        data.customValue = e.target.value;
        updateVBStatusIcon(e.target.value);
      });
    }
  }

  // Render Filters for VERSI LAMA (Classic / Feedback Studio)
  // Options: Exclude Quotes, Exclude Bibliography, Exclude Matches (Off | % | Words)
  function renderVersiLamaUI() {
    const data = state.versiLama;

    let subtextVL = "Abaikan kecocokan kecil / frasa berulang";
    if (data.matchesMode === '%') {
      subtextVL = "Abaikan kecocokan kecil (%)";
    } else if (data.matchesMode === 'Words') {
      subtextVL = "Abaikan kecocokan kecil (word)";
    }

    const html = `
      <!-- 1. Exclude Quotes -->
      <div class="filter-card filter-card-vl ${data.quotes ? 'active' : ''}" id="cardVL_Quotes">
        <div class="filter-card-header">
          <div class="filter-info">
            <div class="filter-icon-box"><i class="fa-solid fa-quote-right"></i></div>
            <div style="min-width: 0; flex: 1;">
              <div class="filter-title">Exclude Quotes</div>
              <div class="filter-subtext">Sembunyikan teks dalam tanda kutip ("...")</div>
            </div>
          </div>
          <div class="status-badge">
            ${data.quotes ? '<i class="fa-solid fa-check text-success"></i> Active' : '<i class="fa-solid fa-xmark text-danger"></i> Off'}
          </div>
        </div>
      </div>

      <!-- 2. Exclude Bibliography -->
      <div class="filter-card filter-card-vl ${data.bibliography ? 'active' : ''}" id="cardVL_Biblio">
        <div class="filter-card-header">
          <div class="filter-info">
            <div class="filter-icon-box"><i class="fa-solid fa-book-bookmark"></i></div>
            <div style="min-width: 0; flex: 1;">
              <div class="filter-title">Exclude Bibliography</div>
              <div class="filter-subtext">Sembunyikan Daftar Pustaka / Referensi</div>
            </div>
          </div>
          <div class="status-badge">
            ${data.bibliography ? '<i class="fa-solid fa-check text-success"></i> Active' : '<i class="fa-solid fa-xmark text-danger"></i> Off'}
          </div>
        </div>
      </div>

      <!-- 3. Exclude Matches (% or Words) -->
      <div class="filter-card filter-card-vl ${data.matchesMode !== 'Off' ? 'active' : ''}" style="cursor: default;">
        <div class="filter-card-header align-items-center">
          <div class="filter-info">
            <div class="filter-icon-box"><i class="fa-solid fa-filter"></i></div>
            <div style="min-width: 0; flex: 1;">
              <div class="filter-title">Exclude Matches</div>
              <div class="filter-subtext">${subtextVL}</div>
            </div>
          </div>
          <div class="matches-pill-group">
            <button type="button" class="matches-pill-btn ${data.matchesMode === 'Off' ? 'active' : ''}" id="btnVLPillOff">Off</button>
            <button type="button" class="matches-pill-btn ${data.matchesMode === '%' ? 'active' : ''}" id="btnVLPillPercent">%</button>
            <button type="button" class="matches-pill-btn ${data.matchesMode === 'Words' ? 'active' : ''}" id="btnVLPillWords">Words</button>
          </div>
        </div>

        <div class="custom-input-box ${data.matchesMode !== 'Off' ? 'show' : ''}" id="boxVLMatches">
          <div class="d-flex align-items-center justify-content-between flex-wrap gap-2">
            <label class="form-label font-semibold mb-0" style="font-size: 0.72rem; color: #475569;">
              ${data.matchesMode === '%' ? 'Minimum Persentase:' : 'Minimum Words:'} <span id="iconVLStatus"></span>
            </label>
            <div class="input-group input-group-sm" style="width: 108px; flex-shrink: 0;">
              <input type="number" min="1" class="form-control form-control-custom" id="inputVLValue" value="${data.customValue !== undefined ? data.customValue : ''}" placeholder="Angka">
              <span class="input-group-text bg-light font-bold py-0 px-2 fs-7" style="height: 28px;">${data.matchesMode === '%' ? '%' : 'Words'}</span>
            </div>
          </div>
        </div>
      </div>
    `;

    dynamicFilterCards.innerHTML = html;
    bindVersiLamaEvents();
  }

  function updateVLStatusIcon(valStr) {
    const iconEl = document.getElementById('iconVLStatus');
    if (!iconEl) return;
    if (!valStr || valStr.trim() === '') {
      iconEl.innerHTML = '<i class="fa-solid fa-xmark text-danger ms-1" title="Wajib diisi angka"></i>';
      return;
    }
    const val = parseInt(valStr, 10);
    if (!isNaN(val) && val >= 1) {
      iconEl.innerHTML = '<i class="fa-solid fa-check text-success ms-1" title="Sesuai"></i>';
    } else {
      iconEl.innerHTML = '<i class="fa-solid fa-xmark text-danger ms-1" title="Harus minimal 1"></i>';
    }
  }

  function bindVersiLamaEvents() {
    const data = state.versiLama;

    document.getElementById('cardVL_Quotes').addEventListener('click', () => {
      data.quotes = !data.quotes;
      renderApp();
    });

    document.getElementById('cardVL_Biblio').addEventListener('click', () => {
      data.bibliography = !data.bibliography;
      renderApp();
    });

    document.getElementById('btnVLPillOff').addEventListener('click', (e) => {
      e.stopPropagation();
      data.matchesMode = 'Off';
      renderApp();
    });

    document.getElementById('btnVLPillPercent').addEventListener('click', (e) => {
      e.stopPropagation();
      data.matchesMode = '%';
      if (data.customValue === undefined) data.customValue = '';
      renderApp();
    });

    document.getElementById('btnVLPillWords').addEventListener('click', (e) => {
      e.stopPropagation();
      data.matchesMode = 'Words';
      if (data.customValue === undefined) data.customValue = '';
      renderApp();
    });

    const inputVLValue = document.getElementById('inputVLValue');
    if (inputVLValue) {
      updateVLStatusIcon(inputVLValue.value);
      inputVLValue.addEventListener('input', (e) => {
        data.customValue = e.target.value;
        updateVLStatusIcon(e.target.value);
      });
    }
  }

  // Reset All Filters Handler
  function resetAllFilters() {
    if (state.isVersiBaru) {
      state.versiBaru.bibliography = false;
      state.versiBaru.quotedText = false;
      state.versiBaru.citedText = false;
      state.versiBaru.matchesMode = 'Off';
    } else {
      state.versiLama.quotes = false;
      state.versiLama.bibliography = false;
      state.versiLama.matchesMode = 'Off';
    }

    renderApp();

    if (typeof Swal !== 'undefined') {
      const Toast = Swal.mixin({
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 2000,
        timerProgressBar: true
      });
      Toast.fire({
        icon: 'info',
        title: 'Seluruh filter telah dimatikan (Off)'
      });
    }
  }

  // Generate Summary Text String for Clipboard based on Admin Template
  function buildSummaryText() {
    const settings = getAdminSettings();
    const isBaru = state.isVersiBaru;

    const footerBrand = '_ˢⁿⁱᶠᵗʸˢᵏᵃ ˣ ˢⁿⁱᶠᵗʸᵗᵒᵒˡˢ_';
    const defaultVB = `🔔 *PENGATURAN FILTER TURNITIN*\n\n🖥️ *Versi Turnitin:* {versi}\n📌 *Exclude Bibliography:* {biblio}\n📌 *Exclude Quoted Text:* {quotes}\n📌 *Exclude Cited Text:* {cited}\n📌 *Exclude Small Matches:* {matches}\n\n👉 *Catatan:* Mohon terapkan pengaturan filter di atas pada sistem Turnitin. Terima kasih!\n\n${footerBrand}`;
    const defaultVL = `🔔 *PENGATURAN FILTER TURNITIN*\n\n🖥️ *Versi Turnitin:* {versi}\n📌 *Exclude Quotes:* {quotes}\n📌 *Exclude Bibliography:* {biblio}\n📌 *Exclude Matches:* {matches}\n\n👉 *Catatan:* Mohon terapkan pengaturan filter di atas pada sistem Turnitin. Terima kasih!\n\n${footerBrand}`;

    let template = isBaru ? (settings.chatTemplateVB || defaultVB) : (settings.chatTemplateVL || defaultVL);

    let result = '';
    if (isBaru) {
      const data = state.versiBaru;
      const biblioText = data.bibliography ? '✅ Active' : '❌ Off';
      const quotedText = data.quotedText ? '✅ Active' : '❌ Off';
      const citedText = data.citedText ? '✅ Active' : '❌ Off';

      let matchesText = '❌ Off';
      if (data.matchesMode === 'Words') {
        const val = data.customValue || '8';
        matchesText = `✅ Exclude < ${val} Words`;
      }

      result = template
        .replace(/\{versi\}/g, '(NEW VIEW)')
        .replace(/\{biblio\}/g, biblioText)
        .replace(/\{quotes\}/g, quotedText)
        .replace(/\{cited\}/g, citedText)
        .replace(/\{matches\}/g, matchesText)
        .replace(/\{waktu\}/g, new Date().toLocaleDateString('id-ID'))
        .replace(/\{footer\}/g, footerBrand);
    } else {
      const data = state.versiLama;
      const quotesText = data.quotes ? '✅ Active' : '❌ Off';
      const biblioText = data.bibliography ? '✅ Active' : '❌ Off';

      let matchesText = '❌ Off';
      if (data.matchesMode === '%') {
        const val = data.customValue || '1';
        matchesText = `✅ Exclude < ${val}%`;
      } else if (data.matchesMode === 'Words') {
        const val = data.customValue || '10';
        matchesText = `✅ Exclude < ${val} Words`;
      }

      result = template
        .replace(/\{versi\}/g, '(OLD VIEW)')
        .replace(/\{biblio\}/g, biblioText)
        .replace(/\{quotes\}/g, quotesText)
        .replace(/\{cited\}/g, '❌ N/A')
        .replace(/\{matches\}/g, matchesText)
        .replace(/\{waktu\}/g, new Date().toLocaleDateString('id-ID'))
        .replace(/\{footer\}/g, footerBrand);
    }

    if (!result.includes('ˢⁿⁱᶠᵗʸˢᵏᵃ')) {
      result += `\n\n${footerBrand}`;
    }

    return result;
  }

  // Handle Submit & Copy Action
  function handleSubmit() {
    const isBaru = state.isVersiBaru;
    const currentData = isBaru ? state.versiBaru : state.versiLama;

    // Validation for matches value
    if (currentData.matchesMode !== 'Off') {
      const inputEl = document.getElementById(isBaru ? 'inputVBWords' : 'inputVLValue');
      const valStr = inputEl ? inputEl.value.trim() : (currentData.customValue ? String(currentData.customValue).trim() : '');
      const val = parseInt(valStr, 10);

      // Jika kolom diisi kosong / tidak valid
      if (valStr === '' || isNaN(val) || val <= 0) {
        Swal.fire({
          icon: 'warning',
          title: 'Kolom Matches Wajib Diisi',
          text: 'Kolom matches wajib diisi atau pilih opsi off.',
          confirmButtonColor: '#334155'
        }).then(() => {
          currentData.customValue = '';
          if (inputEl) {
            inputEl.value = '';
          }
        });
        return;
      }

      // Aturan Khusus VERSI BARU SAJA: Exclude Small Matches minimal 8 Words
      // (Versi Lama BEBAS diisi berapa saja minimal 1 word / 1%)
      if (isBaru && currentData.matchesMode === 'Words' && val < 8) {
        Swal.fire({
          icon: 'warning',
          title: 'Batas Minimum 8 Words',
          text: 'Untuk Versi Baru, Exclude Small Matches minimal diisi 8 Words.',
          confirmButtonColor: '#334155'
        });
        return;
      }
    }

    const summaryText = buildSummaryText();

    // Reliable Copy to Clipboard
    copyToClipboard(summaryText);

    // Ultra-Clear & Bold Success Popup Modal (Zero Redirection)
    Swal.fire({
      icon: 'success',
      iconColor: '#22c55e',
      title: '<span style="font-size: 1.1rem; font-weight: 800; color: #1e293b;">Pilihan Filter Berhasil Disalin!</span>',
      html: `
        <div class="my-2" style="color: #475569; font-size: 0.84rem; font-weight: 600; line-height: 1.45;">
          Teks format filter telah tersalin ke papan klip (*clipboard*).<br>
          <div class="mt-2 p-2 rounded" style="background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; font-size: 0.78rem; font-weight: 700;">
            <i class="fa-solid fa-circle-check text-success me-1"></i> Silakan tempel (copas) di kolom chat WA Admin
          </div>
        </div>
      `,
      confirmButtonText: '<i class="fa-solid fa-check me-1"></i> Oke, Mengerti',
      confirmButtonColor: '#334155',
      customClass: {
        popup: 'swal2-popup-copy-success'
      }
    });

    // Silent GAS Logger Call
    submitLogToGAS({
      versi: isBaru ? 'Versi Baru (New Viewer)' : 'Versi Lama (Classic / Feedback Studio)',
      summaryText: summaryText,
      userAgent: navigator.userAgent
    });
  }

  // Clipboard Copy Helper
  function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).catch(() => {
        fallbackCopyTextToClipboard(text);
      });
    } else {
      fallbackCopyTextToClipboard(text);
    }
  }

  function fallbackCopyTextToClipboard(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
    } catch (err) {
      console.error('Fallback copy error: ', err);
    }
    document.body.removeChild(textArea);
  }

  // Silent GAS Logger Call
  function submitLogToGAS(payload) {
    if (typeof google !== 'undefined' && google.script && google.script.run) {
      google.script.run
        .withSuccessHandler(function (res) {
          console.log('Log GAS sukses:', res);
        })
        .withFailureHandler(function (err) {
          console.warn('Log GAS gagal (silent):', err);
        })
        .submitTurnitinFilter(payload);
      return;
    }

    const current = getAdminSettings();
    const gasUrl = current.gasWebAppUrl || localStorage.getItem('gas_web_app_url');
    if (gasUrl) {
      fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'submitFilter', payload: payload })
      })
        .then(res => res.json())
        .then(resData => console.log('Log GAS fetch sukses:', resData))
        .catch(err => console.warn('Log GAS fetch gagal (silent):', err));
    }
  }

  // DOM Ready Init
  document.addEventListener('DOMContentLoaded', init);

})();
