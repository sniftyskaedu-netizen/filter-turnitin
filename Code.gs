/**
 * Turnitin Filter Selector - Google Apps Script Backend
 * Developed by Sniftyska x Sniftytools
 */

/**
 * Serves the HTML Web Application or JSON API endpoints
 * @param {Object} e - Event object
 * @return {HtmlOutput|TextOutput} - HTML Service Output or JSON Output
 */
function doGet(e) {
  var action = e && e.parameter && e.parameter.action;
  if (action === 'getSettings') {
    var settings = getAdminSettingsGAS() || {};
    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      data: settings
    })).setMimeType(ContentService.MimeType.JSON);
  }

  var page = e && e.parameter && e.parameter.page;
  var templateName = (page === 'admin' || page === 'Admin') ? 'admin' : 'Index';

  try {
    var template = HtmlService.createTemplateFromFile(templateName);
    return template.evaluate()
      .setTitle(page === 'admin' ? 'Panel Admin | Turnitin Filter Selector' : 'Turnitin Filter Selector | Sniftyska x Sniftytools')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1, shrink-to-fit=no')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (err) {
    var fallback = HtmlService.createTemplateFromFile('Index');
    return fallback.evaluate()
      .setTitle('Turnitin Filter Selector | Sniftyska x Sniftytools')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1, shrink-to-fit=no')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
}

/**
 * Handles HTTP POST requests for external web hosting (e.g. Vercel) or web app API calls
 * @param {Object} e - Event object
 * @return {TextOutput} - JSON Output
 */
function doPost(e) {
  try {
    var contents = (e && e.postData && e.postData.contents) ? e.postData.contents : null;
    var data = {};
    if (contents) {
      try {
        data = JSON.parse(contents);
      } catch (err) {
        data = e.parameter || {};
      }
    } else if (e && e.parameter) {
      data = e.parameter;
    }

    var action = data.action || data.type;

    if (action === 'saveSettings') {
      var resSave = saveAdminSettingsGAS(data.settings || data.payload || data);
      return ContentService.createTextOutput(JSON.stringify(resSave))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'getSettings') {
      var settings = getAdminSettingsGAS() || {};
      return ContentService.createTextOutput(JSON.stringify({ status: 'success', data: settings }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'submitFilter') {
      var resSubmit = submitTurnitinFilter(data.payload || data);
      return ContentService.createTextOutput(JSON.stringify(resSubmit))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Action tidak dikenal' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Get Admin Settings stored centrally in PropertiesService / Spreadsheet
 * @return {Object|null} Admin settings object or null
 */
function getAdminSettingsGAS() {
  try {
    // 1. Try ScriptProperties first
    var props = PropertiesService.getScriptProperties();
    var raw = props.getProperty('ADMIN_CONFIG');
    if (raw) {
      return JSON.parse(raw);
    }

    // 2. Fallback to Spreadsheet sheet 'AdminConfig'
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss) {
      var sheet = ss.getSheetByName('AdminConfig');
      if (sheet && sheet.getLastRow() >= 2) {
        var val = sheet.getRange(2, 1).getValue();
        if (val) {
          return JSON.parse(val);
        }
      }
    }
  } catch (error) {
    Logger.log('Error getAdminSettingsGAS: ' + error.toString());
  }
  return null;
}

/**
 * Save Admin Settings centrally to ScriptProperties & Spreadsheet DB
 * @param {Object} settings - New settings object to save
 * @return {Object} Status response
 */
function saveAdminSettingsGAS(settings) {
  var lock = LockService.getScriptLock();
  try {
    if (!lock.waitLock(10000)) {
      return { status: 'error', message: 'Server sibuk. Silakan coba beberapa saat lagi.' };
    }

    if (!settings || typeof settings !== 'object') {
      return { status: 'error', message: 'Payload settings tidak valid.' };
    }

    // 1. Separate light text settings from heavy image Data URLs
    var cleanSettings = {};
    for (var key in settings) {
      if (key !== 'imgVersiBaruFiles' && key !== 'imgVersiLamaFiles') {
        cleanSettings[key] = settings[key];
      }
    }

    // Safely attach images if under total character budget
    cleanSettings.imgVersiBaruFiles = sanitizeImagesArray_(settings.imgVersiBaruFiles);
    cleanSettings.imgVersiLamaFiles = sanitizeImagesArray_(settings.imgVersiLamaFiles);

    var jsonStr = JSON.stringify(cleanSettings);

    // 2. Always save Core Settings to ScriptProperties for high-speed cross-device retrieval
    var props = PropertiesService.getScriptProperties();
    if (jsonStr.length < 8000) {
      props.setProperty('ADMIN_CONFIG', jsonStr);
    } else {
      // If full JSON with images exceeds 8KB, store core text settings in ScriptProperties
      var coreOnly = {};
      for (var k in cleanSettings) {
        if (k !== 'imgVersiBaruFiles' && k !== 'imgVersiLamaFiles') {
          coreOnly[k] = cleanSettings[k];
        }
      }
      props.setProperty('ADMIN_CONFIG', JSON.stringify(coreOnly));
    }

    // 3. Save to Spreadsheet Sheet 'AdminConfig' as persistent backup
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss) {
      var sheet = ss.getSheetByName('AdminConfig');
      if (!sheet) {
        sheet = ss.insertSheet('AdminConfig');
        sheet.appendRow(['ConfigData', 'LastUpdated']);
        sheet.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#1e1b4b').setFontColor('#ffffff');
        sheet.setFrozenRows(1);
      }

      // Truncate safe string if total JSON > 48,000 chars to strictly prevent Google Sheets 50,000 char cell crashes
      var safeCellStr = jsonStr;
      if (safeCellStr.length > 48000) {
        var fallbackSettings = {};
        for (var fKey in cleanSettings) {
          if (fKey !== 'imgVersiBaruFiles' && fKey !== 'imgVersiLamaFiles') {
            fallbackSettings[fKey] = cleanSettings[fKey];
          }
        }
        safeCellStr = JSON.stringify(fallbackSettings);
      }

      sheet.getRange(2, 1).setValue(safeCellStr);
      sheet.getRange(2, 2).setValue(new Date());

      // Write Audit Log entry
      var sheetAudit = ss.getSheetByName('AuditLog');
      if (sheetAudit) {
        sheetAudit.appendRow([
          new Date(),
          'ADMIN_SETTINGS_UPDATE',
          'Admin Dashboard',
          'SUCCESS',
          'Admin memperbarui setelan filter / versi (VersiBaru: ' + (settings.enableVersiBaru ? 'ON' : 'OFF') + ', VersiLama: ' + (settings.enableVersiLama ? 'ON' : 'OFF') + ')'
        ]);
      }
    }

    return {
      status: 'success',
      message: 'Pengaturan Admin berhasil disimpan ke Cloud Database dan berlaku untuk seluruh perangkat.'
    };
  } catch (error) {
    Logger.log('Error saveAdminSettingsGAS: ' + error.toString());
    return { status: 'error', message: error.toString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Sanitizes base64 images array to prevent script/cell overflow
 * @param {Array} imgArr - Raw images array
 * @return {Array} Safe images array
 */
function sanitizeImagesArray_(imgArr) {
  if (!Array.isArray(imgArr)) return [];
  var result = [];
  var totalLen = 0;
  for (var i = 0; i < imgArr.length; i++) {
    var str = String(imgArr[i]);
    if (totalLen + str.length < 30000) {
      result.push(str);
      totalLen += str.length;
    } else {
      break;
    }
  }
  return result;
}

/**
 * Setup Database sheets in the active spreadsheet if they don't exist
 * Creates 'PilihanFilter', 'AuditLog', and 'AdminConfig' sheets with column headers
 */
function setupDatabase() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) {
      Logger.log('Spreadsheet tidak ditemukan. Pastikan script ini terikat (bound) ke Spreadsheet.');
      return;
    }

    // 1. Setup Sheet PilihanFilter
    var sheetFilter = ss.getSheetByName('PilihanFilter');
    if (!sheetFilter) {
      sheetFilter = ss.insertSheet('PilihanFilter');
      sheetFilter.appendRow([
        'Timestamp',
        'Versi Turnitin',
        'Exclude Quotes',
        'Exclude Bibliography',
        'Exclude Matches Mode',
        'Custom Value',
        'Ringkasan Teks'
      ]);
      sheetFilter.getRange(1, 1, 1, 7).setFontWeight('bold').setBackground('#1e1b4b').setFontColor('#ffffff');
      sheetFilter.setFrozenRows(1);
    }

    // 2. Setup Sheet AuditLog
    var sheetAudit = ss.getSheetByName('AuditLog');
    if (!sheetAudit) {
      sheetAudit = ss.insertSheet('AuditLog');
      sheetAudit.appendRow([
        'Timestamp',
        'Action',
        'User Agent',
        'Status',
        'Details'
      ]);
      sheetAudit.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#1e1b4b').setFontColor('#ffffff');
      sheetAudit.setFrozenRows(1);
    }

    // 3. Setup Sheet AdminConfig
    var sheetConfig = ss.getSheetByName('AdminConfig');
    if (!sheetConfig) {
      sheetConfig = ss.insertSheet('AdminConfig');
      sheetConfig.appendRow(['ConfigData', 'LastUpdated']);
      sheetConfig.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#1e1b4b').setFontColor('#ffffff');
      sheetConfig.setFrozenRows(1);
    }

    Logger.log('Database berhasil disiapkan.');
  } catch (error) {
    Logger.log('Error setupDatabase: ' + error.toString());
  }
}

/**
 * Submit Turnitin Filter selection payload to Google Sheets silently
 * Uses LockService to prevent race conditions and sanitizes input data.
 * @param {Object} payload - Filter payload object from frontend
 * @return {Object} JSON response status
 */
function submitTurnitinFilter(payload) {
  var lock = LockService.getScriptLock();
  try {
    // Lock script up to 10 seconds
    if (!lock.waitLock(10000)) {
      return {
        status: 'error',
        message: 'Server sibuk. Silakan coba beberapa saat lagi.'
      };
    }

    if (!payload) {
      return { status: 'error', message: 'Payload kosong.' };
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) {
      // Automatic fallback setup if database isn't linked yet
      return { status: 'warning', message: 'Spreadsheet terpisah/belum dihubungkan.' };
    }

    // Ensure database sheets exist
    setupDatabase();

    var sheetFilter = ss.getSheetByName('PilihanFilter');
    var sheetAudit = ss.getSheetByName('AuditLog');

    var timestamp = new Date();
    var versi = sanitizeInput_(payload.versi || 'Versi Baru (New Viewer)');
    var quotes = sanitizeInput_(payload.quotes ? 'AKTIF' : 'NONAKTIF');
    var bibliography = sanitizeInput_(payload.bibliography ? 'AKTIF' : 'NONAKTIF');
    var matchesMode = sanitizeInput_(payload.matchesMode || 'Off');
    var customValue = sanitizeInput_(payload.customValue ? String(payload.customValue) : '-');
    var summaryText = sanitizeInput_(payload.summaryText || '');
    var userAgent = sanitizeInput_(payload.userAgent || 'Web Browser');

    // Append Filter Selection Log
    if (sheetFilter) {
      sheetFilter.appendRow([
        timestamp,
        versi,
        quotes,
        bibliography,
        matchesMode,
        customValue,
        summaryText
      ]);
    }

    // Append Audit Log
    if (sheetAudit) {
      sheetAudit.appendRow([
        timestamp,
        'FILTER_SELECTION_COPY',
        userAgent,
        'SUCCESS',
        'User menyalin setelan filter: ' + versi + ' | Quotes: ' + quotes + ' | Biblio: ' + bibliography + ' | Matches: ' + matchesMode
      ]);
    }

    return {
      status: 'success',
      message: 'Log pilihan filter berhasil disimpan secara silent.'
    };
  } catch (error) {
    Logger.log('Error submitTurnitinFilter: ' + error.toString());
    return {
      status: 'error',
      message: error.toString()
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Sanitizes input strings to prevent XSS / formula injection in Google Sheets
 * @param {string} input - Raw input string
 * @return {string} Sanitized string
 */
function sanitizeInput_(input) {
  if (typeof input !== 'string') {
    return input;
  }
  var sanitized = input.trim();
  // Prevent Google Sheets formula injection (e.g. =, +, -, @)
  if (/^[=+@-]/.test(sanitized)) {
    sanitized = "'" + sanitized;
  }
  return sanitized;
}

