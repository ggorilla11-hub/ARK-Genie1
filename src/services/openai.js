// OpenAI API 서비스
const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;

// AI 응답 받기
export const getAIResponse = async (message, history = [], persona = 'genie') => {
  const systemPrompt = persona === 'genie' 
    ? `당신은 ARK 지니입니다. 보험설계사를 돕는 AI 어시스턴트입니다.
       - 친절하고 전문적으로 답변합니다
       - 보험, 재무설계, 고객상담에 대해 조언합니다
       - 한국어로 답변합니다
       - 답변은 간결하고 명확하게 합니다`
    : `당신은 오상열 교수입니다. MDRT 전문가이자 보험업계의 멘토입니다.
       - 따뜻하고 격려하는 말투로 답변합니다
       - 실전 경험을 바탕으로 조언합니다
       - 보험설계사의 성장을 돕습니다
       - 한국어로 답변합니다`;

  try {
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: message }
    ];

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4
