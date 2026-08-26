(function () {
  'use strict';

  const ADMIN_STORAGE_KEY = 'turnitin_filter_admin_config_v1';
  const AUTH_SESSION_KEY = 'turnitin_admin_authenticated';

  const defaultAdminSettings = {
    adminPin: '2001',
    enableVersiBaru: true,
    enableVersiLama: true,
    headerTitle: 'Turnitin Filter Selector',
    headerSubtitle: 'Sesuaikan opsi filter dengan regulasi instansi atau kampus masing-masing secara akurat dan praktis.',
    marqueeText: '📢 Filter umum yang digunakan yaitu <strong>Filter Bibliography</strong>, sesuaikan Filter yang dipakai instansi masing-masing. ⚠️ <em>Beda filter = beda hasil.</em>',
    imgVersiBaruFiles: [],
    imgVersiLamaFiles: [],
    filterSubtexts: {
      biblio: 'Filter Daftar Pustaka / Referensi',
      quotes: 'Filter teks dalam tanda kutip',
      cited: 'Filter sitasi & rujukan',
      matches: 'Filter kecocokan frasa kecil'
    },
    chatTemplateVB: `🔔 *PENGATURAN FILTER TURNITIN*\n\n🖥️ *Versi Turnitin:* {versi}\n📌 *Exclude Bibliography:* {biblio}\n📌 *Exclude Quoted Text:* {quotes}\n📌 *Exclude Cited Text:* {cited}\n📌 *Exclude Small Matches:* {matches}\n\n👉 *Catatan:* Mohon terapkan pengaturan filter di atas pada sistem Turnitin. Terima kasih!\n\n_ˢⁿⁱᶠᵗʸˢᵏᵃ ˣ ˢⁿⁱᶠᵗʸᵗᵒᵒˡˢ_`,
    chatTemplateVL: `🔔 *PENGATURAN FILTER TURNITIN*\n\n🖥️ *Versi Turnitin:* {versi}\n📌 *Exclude Quotes:* {quotes}\n📌 *Exclude Bibliography:* {biblio}\n📌 *Exclude Matches:* {matches}\n\n👉 *Catatan:* Mohon terapkan pengaturan filter di atas pada sistem Turnitin. Terima kasih!\n\n_ˢⁿⁱᶠᵗʸˢᵏᵃ ˣ ˢⁿⁱᶠᵗʸᵗᵒᵒˡˢ_`,
    gasWebAppUrl: ''
  };

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

    // 1. Try google.script.run for Google Apps Script Web App environment
    if (typeof google !== 'undefined' && google.script && google.script.run) {
      google.script.run
        .withSuccessHandler(function (res) {
          console.log('Settings synced to GAS Cloud:', res);
          if (callback) callback(true, res);
        })
        .withFailureHandler(function (err) {
          console.warn('Gagal sync ke GAS Cloud:', err);
          if (callback) callback(false, err);
        })
        .saveAdminSettingsGAS(newSettings);
      return;
    }

    // 2. Try fetch for Vercel / External Web Hosting
    const gasUrl = newSettings.gasWebAppUrl || localStorage.getItem('gas_web_app_url');
    if (gasUrl) {
      fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'saveSettings', settings: newSettings })
      })
        .then(res => res.json())
        .then(resData => {
          console.log('Settings synced via fetch GAS:', resData);
          if (callback) callback(true, resData);
        })
        .catch(err => {
          console.warn('Gagal sync via fetch GAS:', err);
          if (callback) callback(false, err);
        });
      return;
    }

    if (callback) callback(true, null);
  }

  function syncSettingsFromCloud(onComplete) {
    if (typeof google !== 'undefined' && google.script && google.script.run) {
      google.script.run
        .withSuccessHandler(function (cloudSettings) {
          if (cloudSettings && typeof cloudSettings === 'object' && Object.keys(cloudSettings).length > 0) {
            const current = getAdminSettings();
            const merged = { ...defaultAdminSettings, ...current, ...cloudSettings };
            saveAdminSettingsLocally(merged);
            if (onComplete) onComplete(merged);
          } else {
            if (onComplete) onComplete(getAdminSettings());
          }
        })
        .withFailureHandler(function (err) {
          console.warn('Error fetching cloud settings:', err);
          if (onComplete) onComplete(getAdminSettings());
        })
        .getAdminSettingsGAS();
      return;
    }

    const current = getAdminSettings();
    const gasUrl = current.gasWebAppUrl || localStorage.getItem('gas_web_app_url');
    if (gasUrl) {
      const fetchUrl = gasUrl + (gasUrl.includes('?') ? '&' : '?') + 'action=getSettings&t=' + Date.now();
      fetch(fetchUrl)
        .then(res => res.json())
        .then(resData => {
          if (resData && (resData.status === 'success' || resData.data)) {
            const cloudSettings = resData.data || resData;
            if (cloudSettings && typeof cloudSettings === 'object' && Object.keys(cloudSettings).length > 0) {
              const merged = { ...defaultAdminSettings, ...current, ...cloudSettings };
              saveAdminSettingsLocally(merged);
              if (onComplete) onComplete(merged);
            } else {
              if (onComplete) onComplete(current);
            }
          } else {
            if (onComplete) onComplete(current);
          }
        })
        .catch(err => {
          console.warn('Fetch error cloud settings:', err);
          if (onComplete) onComplete(current);
        });
      return;
    }

    if (onComplete) onComplete(current);
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

  // Temporary local image state
  let tempImgFilesVB = [];
  let tempImgFilesVL = [];

  // DOM Elements
  const authSection = document.getElementById('authSection');
  const dashboardSection = document.getElementById('dashboardSection');
  const pinInputForm = document.getElementById('pinInputForm');
  const adminPinField = document.getElementById('adminPinField');
  const authErrorMessage = document.getElementById('authErrorMessage');

  // Dashboard Controls
  const adminEnableVB = document.getElementById('adminEnableVB');
  const adminEnableVL = document.getElementById('adminEnableVL');
  const adminHeaderTitle = document.getElementById('adminHeaderTitle');
  const adminHeaderSubtitle = document.getElementById('adminHeaderSubtitle');
  const adminMarqueeText = document.getElementById('adminMarqueeText');
  const liveMarqueePreview = document.getElementById('liveMarqueePreview');
  const adminFileInputVB = document.getElementById('adminFileInputVB');
  const adminFileInputVL = document.getElementById('adminFileInputVL');
  const thumbContainerVB = document.getElementById('thumbContainerVB');
  const thumbContainerVL = document.getElementById('thumbContainerVL');
  const adminPinInput = document.getElementById('adminPinInput');
  const adminGasWebAppUrl = document.getElementById('adminGasWebAppUrl');
  const btnSaveAdmin = document.getElementById('btnSaveAdmin');
  const btnResetAdmin = document.getElementById('btnResetAdmin');
  const btnBackToWebsite = document.getElementById('btnBackToWebsite');
  // Chat Template Controls
  const adminChatTemplateVB = document.getElementById('adminChatTemplateVB');
  const adminChatTemplateVL = document.getElementById('adminChatTemplateVL');
  const liveChatPreview = document.getElementById('liveChatPreview');
  let activeChatTextarea = null;

  function init() {
    checkAuthStatus();
    bindEvents();
    syncSettingsFromCloud(function () {
      if (sessionStorage.getItem(AUTH_SESSION_KEY) === 'true') {
        loadSettingsToUI();
      }
    });
  }

  function checkAuthStatus() {
    const isAuthenticated = sessionStorage.getItem(AUTH_SESSION_KEY) === 'true';
    if (isAuthenticated) {
      if (authSection) authSection.style.display = 'none';
      if (dashboardSection) dashboardSection.style.display = 'block';
      loadSettingsToUI();
    } else {
      if (authSection) authSection.style.display = 'block';
      if (dashboardSection) dashboardSection.style.display = 'none';
      if (adminPinField) adminPinField.focus();
    }
  }

  function bindEvents() {
    // PIN Auth Submit
    if (pinInputForm) {
      pinInputForm.addEventListener('submit', function (e) {
        e.preventDefault();
        const settings = getAdminSettings();
        const enteredPin = adminPinField ? adminPinField.value.trim() : '';
        const correctPin = settings.adminPin || '2001';

        if (!enteredPin) {
          showAuthError('Silakan masukkan PIN Admin!');
          return;
        }

        if (enteredPin === correctPin) {
          sessionStorage.setItem(AUTH_SESSION_KEY, 'true');
          if (authErrorMessage) authErrorMessage.style.display = 'none';
          checkAuthStatus();
        } else {
          showAuthError('⚠️ PIN Admin salah! Silakan coba lagi.');
        }
      });
    }

    // Back to Website (Acts as Exit & Logout)
    if (btnBackToWebsite) {
      btnBackToWebsite.addEventListener('click', function () {
        sessionStorage.removeItem(AUTH_SESSION_KEY);
      });
    }

    // Live Marquee Preview
    if (adminMarqueeText) {
      adminMarqueeText.addEventListener('input', updateLivePreview);
    }

    // Chat Template Textarea Focus & Input Listeners
    const chatTextareas = [adminChatTemplateVB, adminChatTemplateVL];
    chatTextareas.forEach((area) => {
      if (area) {
        area.addEventListener('focus', function () {
          activeChatTextarea = this;
          updateLiveChatPreview();
        });
        area.addEventListener('input', updateLiveChatPreview);
      }
    });

    // Sub-tab switch listener for chat preview
    const chatSubTabBtns = document.querySelectorAll('#chatSubTab .nav-link');
    chatSubTabBtns.forEach((btn) => {
      btn.addEventListener('shown.bs.tab', function (e) {
        const targetId = e.target.getAttribute('data-bs-target');
        if (targetId === '#chat-subtab-vb' && adminChatTemplateVB) {
          activeChatTextarea = adminChatTemplateVB;
        } else if (targetId === '#chat-subtab-vl' && adminChatTemplateVL) {
          activeChatTextarea = adminChatTemplateVL;
        }
        updateLiveChatPreview();
      });
    });

    // Variable Chips for Chat Template
    const chatVarBtns = document.querySelectorAll('.btn-chat-var-tag');
    chatVarBtns.forEach((btn) => {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        const targetArea = activeChatTextarea || adminChatTemplateVB;
        const varText = this.getAttribute('data-var') || '';
        if (targetArea && varText) {
          const currentVal = targetArea.value;
          targetArea.value = currentVal + (currentVal ? ' ' : '') + varText;
          targetArea.focus();
          updateLiveChatPreview();
        }
      });
    });

    // Quick Format Buttons
    const formatBtns = document.querySelectorAll('.btn-format-tag');
    formatBtns.forEach((btn) => {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        if (!adminMarqueeText) return;

        const tagStart = this.getAttribute('data-tag-start') || '';
        const tagEnd = this.getAttribute('data-tag-end') || '';

        const startPos = adminMarqueeText.selectionStart;
        const endPos = adminMarqueeText.selectionEnd;

        if (startPos !== undefined && endPos !== undefined && startPos !== endPos) {
          const selectedText = adminMarqueeText.value.substring(startPos, endPos);
          const replacement = tagStart + selectedText + tagEnd;
          adminMarqueeText.value = adminMarqueeText.value.substring(0, startPos) + replacement + adminMarqueeText.value.substring(endPos);
          adminMarqueeText.selectionStart = startPos + tagStart.length;
          adminMarqueeText.selectionEnd = startPos + tagStart.length + selectedText.length;
        } else {
          const currentVal = adminMarqueeText.value;
          const insertText = tagEnd ? `${tagStart}Teks${tagEnd}` : tagStart;
          adminMarqueeText.value = currentVal + (currentVal ? ' ' : '') + insertText;
        }
        updateLivePreview();
        adminMarqueeText.focus();
      });
    });

    // Image Upload Handlers
    if (adminFileInputVB) {
      adminFileInputVB.addEventListener('change', function (e) {
        handleImageFiles(Array.from(e.target.files), 'VB');
      });
    }

    if (adminFileInputVL) {
      adminFileInputVL.addEventListener('change', function (e) {
        handleImageFiles(Array.from(e.target.files), 'VL');
      });
    }

    // Remove Image Thumbnail Click Delegation
    document.addEventListener('click', function (e) {
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

    // Save Admin Settings
    if (btnSaveAdmin) {
      btnSaveAdmin.addEventListener('click', handleSaveSettings);
    }

    // Reset Admin Settings
    if (btnResetAdmin) {
      btnResetAdmin.addEventListener('click', handleResetSettings);
    }
  }

  function showAuthError(msg) {
    if (authErrorMessage) {
      authErrorMessage.textContent = msg;
      authErrorMessage.style.display = 'block';
    }
  }

  function loadSettingsToUI() {
    const settings = getAdminSettings();

    if (adminEnableVB) adminEnableVB.checked = settings.enableVersiBaru;
    if (adminEnableVL) adminEnableVL.checked = settings.enableVersiLama;
    if (adminHeaderTitle) adminHeaderTitle.value = settings.headerTitle || defaultAdminSettings.headerTitle;
    if (adminHeaderSubtitle) adminHeaderSubtitle.value = settings.headerSubtitle || defaultAdminSettings.headerSubtitle;
    if (adminMarqueeText) adminMarqueeText.value = settings.marqueeText || defaultAdminSettings.marqueeText;
    if (adminPinInput) adminPinInput.value = settings.adminPin || '2001';
    if (adminGasWebAppUrl) adminGasWebAppUrl.value = settings.gasWebAppUrl || localStorage.getItem('gas_web_app_url') || '';

    if (adminChatTemplateVB) adminChatTemplateVB.value = settings.chatTemplateVB || defaultAdminSettings.chatTemplateVB;
    if (adminChatTemplateVL) adminChatTemplateVL.value = settings.chatTemplateVL || defaultAdminSettings.chatTemplateVL;
    activeChatTextarea = adminChatTemplateVB;

    tempImgFilesVB = [...(settings.imgVersiBaruFiles || [])];
    tempImgFilesVL = [...(settings.imgVersiLamaFiles || [])];

    renderThumbnails();
    updateLivePreview();
    updateLiveChatPreview();
  }

  function updateLivePreview() {
    if (liveMarqueePreview && adminMarqueeText) {
      liveMarqueePreview.innerHTML = adminMarqueeText.value.trim() || '<em class="text-muted">(Teks running banner kosong)</em>';
    }
  }

  function updateLiveChatPreview() {
    if (!liveChatPreview) return;
    const currentArea = activeChatTextarea || adminChatTemplateVB;
    if (!currentArea) return;
    const isVL = currentArea === adminChatTemplateVL;
    let raw = currentArea.value || '';
    let preview = raw
      .replace(/\{versi\}/g, isVL ? '(OLD VIEW)' : '(NEW VIEW)')
      .replace(/\{biblio\}/g, '✅ Active')
      .replace(/\{quotes\}/g, '✅ Active')
      .replace(/\{cited\}/g, '✅ Active')
      .replace(/\{matches\}/g, '✅ Exclude < 8 Words')
      .replace(/\{waktu\}/g, new Date().toLocaleDateString('id-ID'))
      .replace(/\{footer\}/g, '_ˢⁿⁱᶠᵗʸˢᵏᵃ ˣ ˢⁿⁱᶠᵗʸᵗᵒᵒˡˢ_');
    liveChatPreview.textContent = preview;
  }

  function handleImageFiles(files, type) {
    if (!files || files.length === 0) return;

    let readCount = 0;
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = function (evt) {
        if (type === 'VB') {
          tempImgFilesVB.push(evt.target.result);
        } else {
          tempImgFilesVL.push(evt.target.result);
        }
        readCount++;
        if (readCount === files.length) {
          renderThumbnails();
          if (type === 'VB' && adminFileInputVB) adminFileInputVB.value = '';
          if (type === 'VL' && adminFileInputVL) adminFileInputVL.value = '';
        }
      };
      reader.readAsDataURL(file);
    });
  }

  function renderThumbnails() {
    if (thumbContainerVB) {
      if (tempImgFilesVB.length === 0) {
        thumbContainerVB.innerHTML = '<small class="text-muted italic" style="font-size: 0.72rem;">Belum ada file gambar diupload (Menggunakan Mockup Tampilan Default)</small>';
      } else {
        thumbContainerVB.innerHTML = tempImgFilesVB.map((src, idx) => `
          <div class="position-relative d-inline-block border rounded p-1 bg-white shadow-sm">
            <img src="${src}" style="width: 56px; height: 56px; object-fit: cover;" class="rounded">
            <button type="button" class="btn btn-danger btn-sm position-absolute top-0 end-0 p-0 rounded-circle d-flex align-items-center justify-content-center" style="width: 18px; height: 18px; font-size: 10px; transform: translate(25%, -25%);" data-remove-vb="${idx}" title="Hapus gambar">&times;</button>
          </div>
        `).join('');
      }
    }

    if (thumbContainerVL) {
      if (tempImgFilesVL.length === 0) {
        thumbContainerVL.innerHTML = '<small class="text-muted italic" style="font-size: 0.72rem;">Belum ada file gambar diupload (Menggunakan Mockup Tampilan Default)</small>';
      } else {
        thumbContainerVL.innerHTML = tempImgFilesVL.map((src, idx) => `
          <div class="position-relative d-inline-block border rounded p-1 bg-white shadow-sm">
            <img src="${src}" style="width: 56px; height: 56px; object-fit: cover;" class="rounded">
            <button type="button" class="btn btn-danger btn-sm position-absolute top-0 end-0 p-0 rounded-circle d-flex align-items-center justify-content-center" style="width: 18px; height: 18px; font-size: 10px; transform: translate(25%, -25%);" data-remove-vl="${idx}" title="Hapus gambar">&times;</button>
          </div>
        `).join('');
      }
    }
  }

  function handleSaveSettings() {
    const enableVB = adminEnableVB ? adminEnableVB.checked : true;
    const enableVL = adminEnableVL ? adminEnableVL.checked : true;
    const pinVal = adminPinInput ? adminPinInput.value.trim() : '2001';
    const gasUrlVal = adminGasWebAppUrl ? adminGasWebAppUrl.value.trim() : '';

    if (!enableVB && !enableVL) {
      Swal.fire({
        icon: 'warning',
        title: 'Perhatian',
        text: 'Minimal harus ada 1 versi yang di-aktifkan (On)!',
        confirmButtonColor: '#334155'
      });
      return;
    }

    if (!pinVal) {
      Swal.fire({
        icon: 'warning',
        title: 'PIN Kosong',
        text: 'PIN Admin tidak boleh kosong!',
        confirmButtonColor: '#334155'
      });
      return;
    }

    const newSettings = {
      adminPin: pinVal,
      enableVersiBaru: enableVB,
      enableVersiLama: enableVL,
      headerTitle: adminHeaderTitle ? (adminHeaderTitle.value.trim() || defaultAdminSettings.headerTitle) : defaultAdminSettings.headerTitle,
      headerSubtitle: adminHeaderSubtitle ? (adminHeaderSubtitle.value.trim() || defaultAdminSettings.headerSubtitle) : defaultAdminSettings.headerSubtitle,
      marqueeText: adminMarqueeText ? (adminMarqueeText.value.trim() || defaultAdminSettings.marqueeText) : defaultAdminSettings.marqueeText,
      chatTemplateVB: adminChatTemplateVB ? (adminChatTemplateVB.value.trim() || defaultAdminSettings.chatTemplateVB) : defaultAdminSettings.chatTemplateVB,
      chatTemplateVL: adminChatTemplateVL ? (adminChatTemplateVL.value.trim() || defaultAdminSettings.chatTemplateVL) : defaultAdminSettings.chatTemplateVL,
      gasWebAppUrl: gasUrlVal,
      imgVersiBaruFiles: tempImgFilesVB,
      imgVersiLamaFiles: tempImgFilesVL
    };

    Swal.fire({
      title: 'Menyimpan Pengaturan...',
      text: 'Menyimpan & mensinkronkan perubahan ke cloud database untuk seluruh perangkat...',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    saveAdminSettings(newSettings, function (success, res) {
      Swal.fire({
        icon: 'success',
        title: 'Pengaturan Disimpan!',
        text: 'Semua perubahan berhasil disimpan ke Cloud Database dan berlaku untuk seluruh perangkat.',
        confirmButtonColor: '#334155'
      });
    });
  }

  function handleResetSettings() {
    Swal.fire({
      title: 'Kembalikan Pengaturan Default?',
      text: 'Seluruh judul, teks banner, PIN, dan gambar upload akan dikembalikan ke setelan awal pabrik.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Ya, Reset Default',
      cancelButtonText: 'Batal',
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#64748b'
    }).then((result) => {
      if (result.isConfirmed) {
        saveAdminSettings(defaultAdminSettings, function() {
          loadSettingsToUI();
          Swal.fire({
            icon: 'info',
            title: 'Pengaturan Direset',
            text: 'Semua data telah kembali ke setelan awal pabrik.',
            confirmButtonColor: '#334155'
          });
        });
      }
    });
  }

  document.addEventListener('DOMContentLoaded', init);

})();

