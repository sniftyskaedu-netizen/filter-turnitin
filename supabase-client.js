/**
 * Supabase Client Integration Module
 * Turnitin Filter Selector Backend Solution
 */

(function (window) {
  'use strict';

  const SUPABASE_URL = 'https://znfoalvfqwkbenvxbyri.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpuZm9hbHZmcXdrYmVudnhieXJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5MjQ5NTQsImV4cCI6MjEwMzUwMDk1NH0.6TP0sD8YT51luiB_NZrrHhSWWseoL3NWGJuxGYATEts';

  let client = null;

  function getClient() {
    if (client) return client;
    if (window.supabase && typeof window.supabase.createClient === 'function') {
      client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      return client;
    } else {
      console.error('Supabase JS SDK belum dimuat! Pastikan script CDN Supabase dipanggil.');
      return null;
    }
  }

  // Convert snake_case from DB to camelCase used in app settings
  function dbToAppSettings(row) {
    if (!row) return null;
    return {
      adminPin: row.admin_pin || '2001',
      enableVersiBaru: row.enable_versi_baru !== undefined ? row.enable_versi_baru : true,
      enableVersiLama: row.enable_versi_lama !== undefined ? row.enable_versi_lama : true,
      headerTitle: row.header_title || 'Turnitin Filter Selector',
      headerSubtitle: row.header_subtitle || 'Sesuaikan opsi filter dengan regulasi instansi atau kampus masing-masing secara akurat dan praktis.',
      marqueeText: row.marquee_text || '📢 Filter umum yang digunakan yaitu <strong>Filter Bibliography</strong>, sesuaikan Filter yang dipakai instansi masing-masing. ⚠️ <em>Beda filter = beda hasil.</em>',
      chatTemplateVB: row.chat_template_vb || '',
      chatTemplateVL: row.chat_template_vl || '',
      imgVersiBaruFiles: Array.isArray(row.img_versi_baru) ? row.img_versi_baru : [],
      imgVersiLamaFiles: Array.isArray(row.img_versi_lama) ? row.img_versi_lama : []
    };
  }

  // Convert camelCase to snake_case for DB update
  function appSettingsToDb(settings) {
    return {
      admin_pin: settings.adminPin || '2001',
      enable_versi_baru: !!settings.enableVersiBaru,
      enable_versi_lama: !!settings.enableVersiLama,
      header_title: settings.headerTitle || '',
      header_subtitle: settings.headerSubtitle || '',
      marquee_text: settings.marqueeText || '',
      chat_template_vb: settings.chatTemplateVB || '',
      chat_template_vl: settings.chatTemplateVL || '',
      img_versi_baru: settings.imgVersiBaruFiles || [],
      img_versi_lama: settings.imgVersiLamaFiles || [],
      updated_at: new Date().toISOString()
    };
  }

  async function fetchSettingsFromSupabase() {
    const supabase = getClient();
    if (!supabase) return null;
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('*')
        .eq('id', 1)
        .single();

      if (error) {
        console.warn('Gagal memuat settings dari Supabase DB:', error);
        return null;
      }
      return dbToAppSettings(data);
    } catch (err) {
      console.error('Error fetchSettingsFromSupabase:', err);
      return null;
    }
  }

  async function saveSettingsToSupabase(newSettings) {
    const supabase = getClient();
    if (!supabase) return { success: false, error: 'Supabase client unavailable' };
    try {
      const dbPayload = appSettingsToDb(newSettings);
      const { data, error } = await supabase
        .from('app_settings')
        .update(dbPayload)
        .eq('id', 1)
        .select();

      if (error) {
        console.error('Gagal menyimpan settings ke Supabase DB:', error);
        return { success: false, error: error.message };
      }
      return { success: true, data: dbToAppSettings(data && data[0]) };
    } catch (err) {
      console.error('Error saveSettingsToSupabase:', err);
      return { success: false, error: err.message };
    }
  }

  function subscribeSupabaseRealtime(onSettingsChange) {
    const supabase = getClient();
    if (!supabase) return null;

    const channel = supabase
      .channel('public:app_settings')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'app_settings' },
        (payload) => {
          if (payload && payload.new && typeof onSettingsChange === 'function') {
            const formatted = dbToAppSettings(payload.new);
            onSettingsChange(formatted);
          }
        }
      )
      .subscribe((status) => {
        console.log('Status Realtime Supabase AppSettings:', status);
      });

    return channel;
  }

  // Export to global window scope
  window.SupabaseAppBackend = {
    fetchSettingsFromSupabase,
    saveSettingsToSupabase,
    subscribeSupabaseRealtime
  };

})(window);
