const express = require('express');
const cron = require('node-cron');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const app = express();
app.use(express.json());

const SUPA_URL = "https://oclulyqimtapjndravjm.supabase.co";
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jbHVseXFpbXRhcGpuZHJhdmptIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njk4NTQwNCwiZXhwIjoyMDkyNTYxNDA0fQ.fydqfT0fgW5CRX5GxsPXyF7r9KtpghO7jGcjLWbR34Y";
const DBX_APP_KEY = "shzg8cbnj7cd01b";
const DBX_APP_SECRET = "fq9a7ijyameh784";
const DBX_REFRESH_TOKEN = "1k3ZsJ9ovDUAAAAAAAAAAcTP5R4B2KpWVlLVQ9IG_5-Z44YOzoIjVnjZQjI-QCXz";

const supa = createClient(SUPA_URL, SUPA_KEY);

// Get a fresh access token using the refresh token
let cachedAccessToken = null;
let tokenExpiry = 0;

async function getAccessToken() {
  if (cachedAccessToken && Date.now() < tokenExpiry) {
    return cachedAccessToken;
  }
  const response = await axios.post('https://api.dropbox.com/oauth2/token',
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: DBX_REFRESH_TOKEN,
      client_id: DBX_APP_KEY,
      client_secret: DBX_APP_SECRET,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  cachedAccessToken = response.data.access_token;
  tokenExpiry = Date.now() + (response.data.expires_in - 300) * 1000;
  console.log('Got fresh Dropbox token, expires in', response.data.expires_in, 'seconds');
  return cachedAccessToken;
}

async function checkForFinals() {
  console.log('[' + new Date().toISOString() + '] Checking Dropbox for finals...');
  try {
    const token = await getAccessToken();
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
        const res = await axios.post('https://api.dropboxapi.com/2/files/list_folder',
          { path: finalPath },
          { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } }
        );
        if (res.data.entries && res.data.entries.length > 0) {
          console.log('Finals found for:', sub.address, '— marking Delivered');
          await supa.from('submissions').update({
            status: 'Delivered',
            final_photo_count: res.data.entries.filter(e => e['.tag'] === 'file').length,
          }).eq('id', sub.id);
        }
      } catch (e) {
        if (e.response?.data?.error?.['.tag'] !== 'path') {
          console.log('No finals yet for:', sub.address);
        }
      }
    }
  } catch (e) {
    console.error('Error in checkForFinals:', e.message);
  }
}

// Check every 5 minutes
cron.schedule('*/5 * * * *', checkForFinals);

// Manual check endpoint
app.get('/check', async (req, res) => {
  await checkForFinals();
  res.json({ message: 'Check complete' });
});

app.get('/', (req, res) => res.json({ status: 'ListingLens sync server running' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server running on port', PORT));
