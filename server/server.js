const express = require('express');
const cron = require('node-cron');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const app = express();
app.use(express.json());

const SUPA_URL = "https://oclulyqimtapjndravjm.supabase.co";
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jbHVseXFpbXRhcGpuZHJhdmptIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njk4NTQwNCwiZXhwIjoyMDkyNTYxNDA0fQ.fydqfT0fgW5CRX5GxsPXyF7r9KtpghO7jGcjLWbR34Y";
const DBX_TOKEN = "sl.u.AGmZmOla2s3se3ll27yH2ynMgcu3xnB6ARTvmYAcjRTSoAZxdt6hLjvuvfU6R8bwEfiTWmzgCnKNi6HPjMfuABSCtk8NrjzgWL7HM2Z88sZVDXlKmOB1diWtq8yPED_oqMlvNNEdMm59sc2NmtmPQLrcfwZNW2XMzRjiWBzZ4iov0MTQbQlLQqp7x7HvAI8op-g1CMO8n_9wdV7VkvggQYGpdhbEG8bHaM2sWXG4So59V29HrZJs6150NEyhzFHSfv-yuuvsAN5bSgCSlE6SaIaWIX8uZgIv_K4g8aT5RLs08eiRz1pTrpc9ogkjGNsu_Z40DnoOAoJbJVEnxtZfbmhc_KCSE0vGvIUU2BaAzKvT1XQNzpaDt4g47NhbMZfZidBlsyFfBwC7a78DsDufP_qZsRs1UHV14nufpZQYckgBJffS5Uf-udlIBh_b8a_110EIAOiYaoTzBSS1_vBByU9ZiGbu0dShmuPrIGyP_EjKRrQOxSMP97FVt_MEjloy6uMfvIhWaKU-zlUXjV3NKIXOHBY9aYawzzWhRF0p_FU4zZ4kCakxFVLdLF7VZ8yOPmhLZteQ5yNANXujCNJ7aMpDtg60RODaqxoq_Bj7cEn3cBFuzp8ubUoUZUVCqIiNwyQaKHsCKgfo2LdzAe6wP7ZvMBzGbatABw48E56KZVSmx1vlJ96tcF_6gZbmrRW_A9RCExsajF8ZeTq_oN7y0ZJ1nbbRmEVokDp3nvOdHpjH2_fJ5mFCkzKdHDE0i6qFI6JYZrtIH2bYoGHwBRkznaS9_ZHCyN8k7VoBIUePfrKlaGWO42NWRRTBdKnJlwqeFV6pzNdDh515c6ryKCYKGQbQA4ykSVSpLE8mfwQZQrW56LJPqD8tsr9xi5pyVausKgMgTsVroC1RWR-ceaQsqVDBX0QGyRDOIBuHViaOWzQHYfbCDbNJZDP8s0OyX5rj398inry1updDPx4CSQK19L7ldTPFomVBWVp83tdWOOCGdVR8MhTwztuPolnpwOtPqKzzntQIAAhDhRcMq3T4wnpI-jM0DfW1HmtLtb5PKMgcbSAHy2CQp8kyI0BWYQMx95D8jG9PA14sAtkA7CnA15Q0jT4VTeC5Y61R2YZ6VrRcK0yyulRyx3UwVHraGRMd1Zd55KejnKaxUSgM3O2b9LwgNXHCRRfaXX_eA6dV0EDRsCOTmYOAvOvzaGwksxJIHdhF0XIrL2VEy49hC2fvhbRkLBkIbYMeBMB-j6DegKR3x10b1uCkpXNut6atNzy_witQ3HAOXfb-b_L7lvnsL6wGxMmskzsnxq7sQB9nKSL1tIU2WccpuDTrlTw5Qu8yqcccYEa-hMn1yKndWN1s2qIgI5_BE2Cy--29LgjdMHyP5j_DLjhyPifu62UELRMCzG7Vd59YWRcu4vkUTun9D0rFYFccxwIWsp3mqfx_jVpvUQ";

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
