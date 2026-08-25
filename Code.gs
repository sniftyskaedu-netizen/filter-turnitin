/**
 * Turnitin Filter Selector - Google Apps Script Backend
 * Developed by Sniftyska x Sniftytools
 */

/**
 * Serves the HTML Web Application
 * @param {Object} e - Event object
 * @return {HtmlOutput} - HTML Service Output
 */
function doGet(e) {
  var template = HtmlService.createTemplateFromFile('Index');
  var output = template.evaluate()
    .setTitle('Turnitin Filter Selector | Sniftyska x Sniftytools')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, shrink-to-fit=no')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  return output;
}

/**
 * Setup Database sheets in the active spreadsheet if they don't exist
 * Creates 'PilihanFilter' and 'AuditLog' sheets with column headers
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
