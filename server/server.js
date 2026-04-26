const express = require('express');
const cron = require('node-cron');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const app = express();
app.use(express.json());

const SUPA_URL = "https://oclulyqimtapjndravjm.supabase.co";
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jbHVseXFpbXRhcGpuZHJhdmptIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njk4NTQwNCwiZXhwIjoyMDkyNTYxNDA0fQ.fydqfT0fgW5CRX5GxsPXyF7r9KtpghO7jGcjLWbR34Y";
const DBX_TOKEN = "sl.u.AGeZ57TDn3-PrEWzY5rKlQRSayVEMTrcWZA-cL6PyliuY68PqHWEyJHaA1G6u1VbAJStIHNXhrbA0w04ED7SrITnEm9rZJ09jc_vZYSGJfr3bxdYCi74L5ke9a87dxrKUozCYcaQHM4e3o3iloE-aK-w4hSZ_IoJkoEQI7I9mNwEteWhxuTBPKPo2UgNyFsgexBO00LtkJ3k9oMFVVB3VURPrDHgNtwA3HDb-tawBYMs2P64i7jTJ09BwijY7n9aaQnrj0JzMj5-mpeU4-iDZpDEipq2Mk-5emYQn90KnNlEB59pVs2dDt55JNuLTcZFKAVtuIte1kv4cbIJ9BRA5ZXF-htFFCrV-qFMpMOrIYjGWEo1udIpjVHTmKhZXFkaAW0NfZ3EJFGAS0V98P3utItUNb-RuMFWz2SgbnSZHKXHg3jXKerGploOrr8B_Z3DEj2O8Bj3oBxN6D7LX9UoZTaaR8j8q7avo1VnnqK6q2cEtB5NVgyxS_cO9SJ3KMxCx4FF-TUfQqXMWCwO9q03Snb_qhPpOC3x38ku3SagMysUMtVt9VZVknsdlXFg7cZ_WrGDe2_YDQYGtwQj_6-jrCjv8tgoS2RcrqswcTfOMQTAXMOTzWmT60PmNX8YWFml_tYJ6GgLF2T_i6akwJFweg7tD1ixTqz2mgTPKA4IMRIDe26WbJCVJQ4KuM2OaI2JryOYyvpAskTdk5LaP368FS-nO2Yqp3ky7lLNHP2fORxo1uTAswv063DnXXxKtCmkLuA05ZdOr_SzfiHLgFgOznXS3ADPTe4dpxlOnq6zG60ecc4DVdLLr5TOFsxOKKchrOLA7XJKptQuqRXkaIU8qi05VEOZZvhJe0CbTHNdKhBucLQor0iFjVwCZQ5jIhvNAFgLUhA4gtDNlhXVTnEmeSnZKoQsKbfzRsuacEIsjL8rFjlXThI2njAZl8g-zDAR1ZrAnnfwxM57Y-H462GcybMHM-CVRqoKS0clTNTiVk8OFZ3w3fusL6EkCnkCGnPaqIseUZGHPaQmXFsf7JLtZ9fK5-W8eJrUZgzKTMrP90n9oKdWLbBukHWihGW9f_8MYTw-44FTm7RDIl9a19wOHX8Il3kEFFN6rkrWlkDe9HRB5OwhlgXwMEvKmNacmo9WcEddP6As8a7KKidkDKwoeLGNTM_AkbBh0VvSgCaN2LKJEodMBgpKCmhXBfGFCB84vEo-XFbMzJnuAKP9d2jW4gVmoGqwZ-YMD5KI7bKN2x90zQbViGTcHLS-lhIyqnozKdMJ4IQeHAviD2d0kfPQLr1f7qZOHgJmT9ScCE_PQtdmzwL6tITEECIYI3mRbWCVHaNV9I245KqZdbg3IUlcbUKkGvS3MzRhDgIFl39SgHcp-0zgBrVMGXnxqJgXTX__rglj0rYGK8OrhtahM186m5cmxBtstJpjE8i_wpSgdU4DPg";

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
