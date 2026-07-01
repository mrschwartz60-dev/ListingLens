const express = require('express');
const cron = require('node-cron');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const nodemailer = require('nodemailer');
const apn = require('@parse/node-apn');
const path = require('path');

const app = express();
app.use(express.json());

const SUPA_URL = "https://oclulyqimtapjndravjm.supabase.co";
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jbHVseXFpbXRhcGpuZHJhdmptIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njk4NTQwNCwiZXhwIjoyMDkyNTYxNDA0fQ.fydqfT0fgW5CRX5GxsPXyF7r9KtpghO7jGcjLWbR34Y";
const DBX_APP_KEY = "shzg8cbnj7cd01b";
const DBX_APP_SECRET = "fq9a7ijyameh784";
const DBX_REFRESH_TOKEN = "1k3ZsJ9ovDUAAAAAAAAAAcTP5R4B2KpWVlLVQ9IG_5-Z44YOzoIjVnjZQjI-QCXz";

const STUDIO12_EMAIL = "Photos@chattrboxstudios.com";
const FROM_EMAIL     = "listinglenssubmission@gmail.com";
const GMAIL_PASSWORD = "nupt kfet rxdb xluw";

const APNs_KEY_ID  = "F5PSXYZAY9";
const APNs_TEAM_ID = "84CTAPBPFF";
const BUNDLE_ID    = "com.nicholasschwartz.listinglens";

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: FROM_EMAIL, pass: GMAIL_PASSWORD },
});

// APNs provider
const apnProvider = new apn.Provider({
  token: {
    key: path.join(__dirname, '..', 'AuthKey_F5PSXYZAY9.p8'),
    keyId: APNs_KEY_ID,
    teamId: APNs_TEAM_ID,
  },
  production: false, // Change to true when submitting to App Store
});

const supa = createClient(SUPA_URL, SUPA_KEY);
const emailedSubmissions = new Set();

let cachedAccessToken = null;
let tokenExpiry = 0;

async function getAccessToken() {
  if (cachedAccessToken && Date.now() < tokenExpiry) return cachedAccessToken;
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
  return cachedAccessToken;
}

// ── Send push notification ────────────────────────────────────────────────────
async function sendPushNotification(agentId, title, body) {
  try {
    const { data: profile } = await supa
      .from('profiles')
      .select('device_token')
      .eq('id', agentId)
      .single();

    if (!profile?.device_token) {
      console.log('No device token for agent:', agentId);
      return;
    }

    const notification = new apn.Notification();
    notification.expiry = Math.floor(Date.now() / 1000) + 3600;
    notification.badge = 1;
    notification.sound = 'default';
    notification.alert = { title, body };
    notification.topic = BUNDLE_ID;

    const result = await apnProvider.send(notification, profile.device_token);
    if (result.sent.length > 0) {
      console.log('✅ Push sent to agent:', agentId);
    } else {
      console.log('❌ Push failed:', result.failed);
    }
  } catch (e) {
    console.error('Push notification error:', e.message);
  }
}

// ── Send spec sheet email ─────────────────────────────────────────────────────
async function sendSpecSheetEmail(sub) {
  try {
    const token = await getAccessToken();
    const cleanAddr = sub.address.replace(/[^a-zA-Z0-9 ]/g, '').trim().replace(/\s+/g, '_');
    const rawPath = `/AutoHDR/${cleanAddr}/01-RAW-Photos`;

    let photos = [];
    try {
      const res = await axios.post('https://api.dropboxapi.com/2/files/list_folder',
        { path: rawPath },
        { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } }
      );
      photos = res.data.entries
        .filter(e => e['.tag'] === 'file')
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (e) {
      console.log('Could not list photos:', e.message);
    }

    const photoRows = photos.length > 0
      ? photos.map((p, i) => {
          const name = p.name.replace(/\.[^.]+$/, '');
          const dashParts = name.split('-');
          const hasUpgrade = dashParts.length > 2;
          const upgradeRaw = hasUpgrade ? dashParts.slice(2).join(' ').replace(/_/g, ' ') : '';
          const upgrade = hasUpgrade ? upgradeRaw : 'Standard';
          return `
            <tr style="background:${i % 2 === 0 ? '#f9f9f9' : '#fff'}">
              <td style="padding:10px 14px;border-bottom:1px solid #eee;font-weight:700;color:#111;">${i + 1}</td>
              <td style="padding:10px 14px;border-bottom:1px solid #eee;color:#333;">${name}</td>
              <td style="padding:10px 14px;border-bottom:1px solid #eee;">
                <span style="background:${hasUpgrade ? '#A32135' : '#e5e5e3'};color:${hasUpgrade ? '#fff' : '#555'};padding:3px 8px;border-radius:4px;font-size:11px;font-weight:700;text-transform:uppercase;">
                  ${upgrade}
                </span>
              </td>
            </tr>`;
        }).join('')
      : `<tr><td colspan="3" style="padding:20px;text-align:center;color:#999;">Check Dropbox directly for photos.</td></tr>`;

    const submittedAt = new Date(sub.created_at).toLocaleString('en-US', {
      dateStyle: 'medium', timeStyle: 'short'
    });

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f2f2f1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f2f2f1;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
        <tr><td style="background:#111312;padding:24px 28px;">
          <span style="font-size:22px;font-weight:900;color:#fff;text-transform:uppercase;">Listing<span style="color:#A32135;">Lens</span></span>
          <span style="display:block;font-size:10px;color:rgba(255,255,255,.4);letter-spacing:2px;margin-top:2px;">BY STUDIO12</span>
        </td></tr>
        <tr><td style="background:#A32135;height:3px;"></td></tr>
        <tr><td style="padding:28px 28px 8px;">
          <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#A32135;">New Submission</p>
          <h1 style="margin:0;font-size:24px;font-weight:900;color:#111;text-transform:uppercase;">${sub.address}</h1>
        </td></tr>
        <tr><td style="padding:12px 28px 24px;">
          <table cellpadding="0" cellspacing="0"><tr>
            <td style="padding-right:24px;">
              <p style="margin:0;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#999;">Property Type</p>
              <p style="margin:4px 0 0;font-size:14px;font-weight:600;color:#333;">${sub.property_type || 'Not specified'}</p>
            </td>
            <td style="padding-right:24px;">
              <p style="margin:0;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#999;">Photo Count</p>
              <p style="margin:4px 0 0;font-size:14px;font-weight:600;color:#333;">${sub.photo_count} photos</p>
            </td>
            <td>
              <p style="margin:0;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#999;">Submitted</p>
              <p style="margin:4px 0 0;font-size:14px;font-weight:600;color:#333;">${submittedAt}</p>
            </td>
          </tr></table>
        </td></tr>
        ${sub.notes ? `<tr><td style="padding:0 28px 24px;">
          <div style="background:#f9f9f9;border-left:3px solid #A32135;border-radius:4px;padding:14px 16px;">
            <p style="margin:0 0 4px;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#999;">Agent Notes</p>
            <p style="margin:0;font-size:14px;color:#333;">${sub.notes}</p>
          </div>
        </td></tr>` : ''}
        <tr><td style="padding:0 28px 28px;">
          <p style="margin:0 0 12px;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#A32135;">Photo Spec Sheet</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eee;border-radius:8px;overflow:hidden;">
            <thead><tr style="background:#111312;">
              <th style="padding:10px 14px;text-align:left;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:rgba(255,255,255,.7);width:40px;">#</th>
              <th style="padding:10px 14px;text-align:left;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:rgba(255,255,255,.7);">File Name</th>
              <th style="padding:10px 14px;text-align:left;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:rgba(255,255,255,.7);">Edit Type</th>
            </tr></thead>
            <tbody>${photoRows}</tbody>
          </table>
        </td></tr>
        <tr><td style="padding:0 28px 32px;">
          <a href="https://www.dropbox.com/home/AutoHDR/${cleanAddr}"
             style="display:inline-block;background:#A32135;color:#fff;text-decoration:none;padding:14px 24px;border-radius:8px;font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:1px;">
            View in Dropbox →
          </a>
        </td></tr>
        <tr><td style="background:#f9f9f9;border-top:1px solid #eee;padding:16px 28px;">
          <p style="margin:0;font-size:11px;color:#999;text-align:center;">ListingLens Studio by Studio12 · Automated Spec Sheet</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

    await transporter.sendMail({
      from: `"ListingLens Studio" <${FROM_EMAIL}>`,
      to: STUDIO12_EMAIL,
      subject: `📋 New Submission: ${sub.address}`,
      html,
    });
    console.log('✅ Spec sheet email sent for:', sub.address);
  } catch (e) {
    console.error('❌ Failed to send spec sheet email:', e.message);
  }
}

// ── Check for finals ──────────────────────────────────────────────────────────
async function checkForFinals() {
  console.log('[' + new Date().toISOString() + '] Checking Dropbox for finals...');
  try {
    const token = await getAccessToken();
    const { data: subs } = await supa
      .from('submissions')
      .select('*')
      .neq('status', 'Draft')
      .neq('status', 'Editing');

    if (!subs || !subs.length) { console.log('No submissions to check.'); return; }

    for (const sub of subs) {
      const cleanAddr = sub.address.replace(/[^a-zA-Z0-9 ]/g, '').trim().replace(/\s+/g, '_');
      const finalPath = '/AutoHDR/' + cleanAddr + '/04-FINAL-Photos';
      try {
        const res = await axios.post('https://api.dropboxapi.com/2/files/list_folder',
          { path: finalPath },
          { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } }
        );
        if (res.data.entries && res.data.entries.length > 0) {
          const fileCount = res.data.entries.filter(e => e['.tag'] === 'file').length;
          if (sub.status !== 'Delivered') {
            console.log('Finals found for:', sub.address, '— marking Delivered');
            await supa.from('submissions').update({
              status: 'Delivered',
              final_photo_count: fileCount,
              upgrades_ready: false,
            }).eq('id', sub.id);
            // Send push notification to agent
            await sendPushNotification(
              sub.agent_id,
              '📸 Photos Ready!',
              `Your edited photos for ${sub.address} are ready to download.`
            );
          } else if (sub.final_photo_count && fileCount > sub.final_photo_count && !sub.upgrades_ready) {
            console.log('Upgrades detected for:', sub.address);
            await supa.from('submissions').update({
              upgrades_ready: true,
              final_photo_count: fileCount,
            }).eq('id', sub.id);
            // Send push notification for upgrades
            await sendPushNotification(
              sub.agent_id,
              '⭐ Upgrades Ready!',
              `Your upgraded photos for ${sub.address} have been added.`
            );
          }
        }
      } catch (e) {
        console.log('No finals yet for:', sub.address);
      }
    }
  } catch (e) {
    console.error('Error in checkForFinals:', e.message);
  }
}

// ── Check for new submissions ─────────────────────────────────────────────────
async function checkForNewSubmissions() {
  try {
    const { data: newSubs } = await supa
      .from('submissions')
      .select('*')
      .eq('status', 'Submitted');

    if (newSubs && newSubs.length > 0) {
      for (const sub of newSubs) {
        if (emailedSubmissions.has(sub.id)) continue;
        console.log('New submission:', sub.address, '— sending spec sheet');
        await sendSpecSheetEmail(sub);
        emailedSubmissions.add(sub.id);
        await supa.from('submissions').update({ status: 'Editing' }).eq('id', sub.id);
      }
    } else {
      console.log('No pending submissions.');
    }
  } catch (e) {
    console.error('Error checking submissions:', e.message);
  }
}

cron.schedule('*/5 * * * *', checkForFinals);
cron.schedule('*/2 * * * *', checkForNewSubmissions);

app.get('/check', async (req, res) => {
  await checkForFinals();
  res.json({ message: 'Check complete' });
});

app.get('/check-submissions', async (req, res) => {
  await checkForNewSubmissions();
  res.json({ message: 'Submission check complete' });
});

app.get('/', (req, res) => res.json({ status: 'ListingLens sync server running' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server running on port', PORT));
