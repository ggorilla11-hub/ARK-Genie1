const { google } = require('googleapis');

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, phone, content, status, next_action } = req.body;

  if (!name) {
    return res.status(400).json({ error: '고객명이 필요합니다.' });
  }

  try {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
    
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

    const now = new Date();
    const dateStr = now.toLocaleDateString('ko-KR');
    const timeStr = now.toLocaleTimeString('ko-KR');

    const values = [[
      dateStr,
      timeStr,
      name,
      phone || '',
      content || '',
      status || '상담예약',
      next_action || '',
      '오상열'
    ]];

    const result = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'A:H',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      resource: { values }
    });

    return res.status(200).json({
      success: true,
      message: `${name} 고객 정보가 기록되었습니다.`,
      updatedRange: result.data.updates?.updatedRange
    });

  } catch (error) {
    console.error('Google Sheets Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
