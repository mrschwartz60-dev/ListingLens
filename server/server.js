const express = require('express');
const cron = require('node-cron');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const app = express();
app.use(express.json());

const SUPA_URL = "https://oclulyqimtapjndravjm.supabase.co";
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jbHVseXFpbXRhcGpuZHJhdmptIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njk4NTQwNCwiZXhwIjoyMDkyNTYxNDA0fQ.fydqfT0fgW5CRX5GxsPXyF7r9KtpghO7jGcjLWbR34Y";
const DBX_TOKEN = "sl.u.AGmax5PgyTDgzej9BxGFCul-Pzudf8Zjr1qzL9aT0fsyD9I0coUkfjMP_7Iza0tJeOEy5tzJxcikJyqnKDZpWv9aMTmmNdmncc5b6Vwe88d76TNdeejYdLMn1adupB1VX1Q7Yc9UA7UKgHzWSvhzfhZMXXfg_e00ZgDvsN3J34S8eO13AuGYLC6dYMmh8p5WkgR4dSE8IepmbCK6c6l_JgZGQk2J9X4p_6_bmF0AhxUgoQ1qZ-mDDso_kOkyiRR8suQ6t_wW1iqSvDhWMZmfiGbKqTxu_gbU-c7fe4hTr2OMVI4IoSrdFgQssYC7Orim8L-_XiZx9QYs4y22CT_CG_XpM20iLAtrJ_l45Edgf7AC533qPyQHSRY8ilgM1LD9AEGEjNS9adtDLnYmFaUtdvnd_iX0yRxnutSP-hEY8k_dZF4-It3Y6rKFQFLE7DPgLK6Dk1bYEgSvVZjRUoZJET45vPy3mmF3ybwAI7scsLiGV3CklYBKAUHWSJxIfJ4gZoK2m3vXCruLYNVXX9kKUIHSssBuiMGXn5Eb_9O1Lj6XxlMO_eUahp_ILuQ10IebPCdYJSraY9Sq3MFkUfzY1bzu2QG1N6ymnYVl7FmKJRGQoBbQ9kVJOIIvxet5HmGZb_13zed6bSS3KhbTfAJWPprUGpdGd9L2kTOSXh_Ckrvy_ayPwEnyD2nJ-GAMLQRAD7WqEkVgFdH4SDLjyy78_ZbO1wK4QXrX0VNH95aA8Uhe2sgWgXAtvT4DEYzMoTJ1Wud9oA5cfSkFZxA4Anxq1mMOO2q8rMp7BKoDSymrs3SAkq9R6FnYDnDMCCqugRm_ERXIZeIvckHDAvyaoASJpbQiGeujfpy4L5_jFlBd_JujpnEttTS5UFo2CoG9Ng-5wbmZ-KRzoimitlMssWKbb7yq_ZLWCZJ_wGIgmdCyJUwwtA71N2qXHZ4L-nl7cbNmlexsaLL-nvAeyZ5hO7f_8QN8NkxNP62rK3RxftgVYbVD9TmOTbQIZBVSf74ZP9r_9YY5UwUwSEUA4VNvMY1AFKvL_kGhB_UIdr1blnIIaRTvl573nTTCImT8Wu99xykEnMQr7MUz_oZNRnqNJYq5UhOiaxt4W8NMxnbF8CQg4C3wf6yNTbe4nSlw42IqHLgHnWCUA0WpBBV07KBuanXt88rMvDUqKMG46KhXpc9zh-6c0e_kcN4HzkIIY7JmNivGZmVad7WCxkBY5lc6LIq2LE6O9oGUS4xzBHin4xcoVyJ8OU2_ZyIK0xyt2gmdBJ2zhDfSmUC6qLuUw2OAA_-amAHFUmlNGR5hUJzz2V52vQWV34_YoyTN1ppeC8QWceE4T4uRfWOvPr5q-ARPGERWwJ4JOUIt6hEOmc8atDNn-hX3-BJWmdOnNNIvq_qogDryD19YEwpxvzEg-Yh1XjSnUmfX550ozQd_PMuJhARYoTBGYg";

const supa = createClient(SUPA_URL, SUPA_KEY);

async function checkForFinals() {
  console.log('[' + new Date().toISOString() + '] Checking Dropbox for finals...');
  try {
    const { data: subs, error } = await supa
      .from('submissions')
      .select('*')
      .neq('status', 'Delivered')
      .neq('status', 'Draft');

    if (error) { console.error('Supabase error:', error); return; }
    if (!subs || !subs.length) { console.log('No active submissions to check.'); return; }

    for (const sub of subs) {
      const cleanAddr = sub.address.replace(/[^a-zA-Z0-9 ]/g, '').trim().replace(/\s+/g, '_');
      const finalPath = '/AutoHDR/' + cleanAddr + '/04-FINAL-Photos';
      console.log('Checking:', finalPath);

      try {
        const res = await axios.post(
          'https://api.dropboxapi.com/2/files/list_folder',
          { path: finalPath, limit: 5 },
          { headers: { 'Authorization': 'Bearer ' + DBX_TOKEN, 'Content-Type': 'application/json' } }
        );
        const entries = res.data.entries || [];
        const photos = entries.filter(e => e.name.match(/\.(jpg|jpeg|png)$/i));

        if (photos.length > 0) {
          console.log('Finals found for:', sub.address, '-', photos.length, 'photos');
          await supa.from('submissions').update({
            status: 'Delivered',
            final_photo_count: photos.length
          }).eq('id', sub.id);
          console.log('✅ Marked Delivered:', sub.address);
        } else {
          console.log('No finals yet for:', sub.address);
          if (sub.status === 'Submitted') {
            await supa.from('submissions').update({ status: 'Editing' }).eq('id', sub.id);
          }
        }
      } catch (dbxErr) {
        if (dbxErr.response && dbxErr.response.status === 409) {
          console.log('Folder not found yet for:', sub.address);
        } else {
          console.error('Dropbox error:', dbxErr.message);
        }
      }
    }
  } catch (err) {
    console.error('Check failed:', err.message);
  }
}

cron.schedule('*/5 * * * *', checkForFinals);

app.get('/', (req, res) => {
  res.json({ status: 'ListingLens sync server running', time: new Date().toISOString() });
});

app.get('/check', async (req, res) => {
  await checkForFinals();
  res.json({ status: 'Check complete', time: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Server running on port', PORT);
  checkForFinals();
});
