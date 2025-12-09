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

  const { title, description, start_time, end_time } = req.body;

  if (!title) {
    return res.status(400).json({ error: '일정 제목이 필요합니다.' });
  }

  try {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
    
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/calendar']
    });

    const calendar = google.calendar({ version: 'v3', auth });

    let startDateTime = start_time;
    let endDateTime = end_time;

    if (!startDateTime) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(14, 0, 0, 0);
      startDateTime = tomorrow.toISOString();
      
      const endTime = new Date(tomorrow);
      endTime.setHours(15, 0, 0, 0);
      endDateTime = endTime.toISOString();
    }

    const event = {
      summary: title,
      description: description || '',
      start: {
        dateTime: startDateTime,
        timeZone: 'Asia/Seoul'
      },
      end: {
        dateTime: endDateTime,
        timeZone: 'Asia/Seoul'
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 30 }
        ]
      }
    };

    const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';

    const result = await calendar.events.insert({
      calendarId,
      resource: event
    });

    return res.status(200).json({
      success: true,
      message: '캘린더에 일정이 등록되었습니다.',
      eventId: result.data.id,
      htmlLink: result.data.htmlLink
    });

  } catch (error) {
    console.error('Google Calendar Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
