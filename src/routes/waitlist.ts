import { Hono } from 'hono';
import { google } from 'googleapis';

const waitlistRouter = new Hono();

function getSheets() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

waitlistRouter.post('/', async (c) => {
  let email: string;
  try {
    const body = await c.req.json();
    email = (body.email ?? '').toString().trim().toLowerCase();
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return c.json({ error: 'Invalid email' }, 400);
  }

  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  if (!spreadsheetId || !process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
    console.error('Waitlist: missing Google Sheets env vars');
    return c.json({ error: 'Waitlist unavailable' }, 503);
  }

  try {
    const sheets = getSheets();
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Sheet1!A:B',
      valueInputOption: 'RAW',
      requestBody: {
        values: [[email, new Date().toISOString()]],
      },
    });
    return c.json({ ok: true });
  } catch (err) {
    console.error('Waitlist Google Sheets error:', err);
    return c.json({ error: 'Failed to save email' }, 500);
  }
});

export default waitlistRouter;
