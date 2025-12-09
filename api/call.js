const twilio = require('twilio');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

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

  const { name, phone } = req.body;

  if (!phone) {
    return res.status(400).json({ error: '전화번호가 필요합니다.' });
  }

  let formattedPhone = phone.replace(/-/g, '').replace(/\s/g, '');
  if (!formattedPhone.startsWith('+')) {
    if (formattedPhone.startsWith('0')) {
      formattedPhone = '+82' + formattedPhone.slice(1);
    } else {
      formattedPhone = '+82' + formattedPhone;
    }
  }

  try {
    const client = twilio(accountSid, authToken);
    
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Seoyeon" language="ko-KR">안녕하세요, ${name || '고객'}님. ARK 보험컨설팅의 AI 비서 지니입니다. 오상열 설계사님께서 상담 일정을 잡아달라고 하셨는데요, 편하신 시간이 있으실까요?</Say>
    <Pause length="3"/>
    <Say voice="Polly.Seoyeon" language="ko-KR">네, 알겠습니다. 확인 후 다시 연락드리겠습니다. 감사합니다.</Say>
</Response>`;

    const call = await client.calls.create({
      to: formattedPhone,
      from: twilioPhone,
      twiml: twiml
    });

    return res.status(200).json({
      success: true,
      callSid: call.sid,
      status: call.status,
      message: `${name || '고객'}님께 전화를 연결했습니다.`
    });

  } catch (error) {
    console.error('Twilio Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
