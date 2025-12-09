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

  try {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
    
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

    const headers = [['날짜', '시간', '고객명', '연락처', '상담내용', '상태', '다음액션', '담당자']];

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'A1:H1',
      valueInputOption: 'RAW',
      resource: { values: headers }
    });

    return res.status(200).json({
      success: true,
      message: '헤더가 설정되었습니다.'
    });

  } catch (error) {
    console.error('Google Sheets Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
