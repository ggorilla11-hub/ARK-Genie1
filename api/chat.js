const OpenAI = require('openai');

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

  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ error: '메시지가 필요합니다.' });
  }

  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: `당신은 ARK 보험컨설팅의 AI 비서 "지니"입니다.
보험설계사 오상열 CFP를 도와주는 친절한 AI 에이전트입니다.

역할:
1. 고객에게 전화 걸기
2. 카카오톡 메시지 발송
3. 고객현황판(구글 시트) 기록
4. 캘린더 일정 등록
5. 보험 증권 분석

항상 한국어로 친절하고 전문적으로 응답하세요.
간결하게 핵심만 답변하세요.`
        },
        {
          role: 'user',
          content: message
        }
      ],
      max_tokens: 500,
      temperature: 0.7
    });

    const aiMessage = completion.choices[0].message.content;

    return res.status(200).json({
      success: true,
      message: aiMessage
    });

  } catch (error) {
    console.error('OpenAI Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
