import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true
});

export async function getAIResponse(message, conversationHistory = [], persona = 'genie') {
  const systemPrompts = {
    genie: `당신은 ARK 지니, 전문 AI 보험 비서입니다.

역할:
- 보험 증권 분석 및 보장 내역 요약
- 고객 맞춤형 보험 상품 추천
- 제안서 및 청구 서류 작성 지원
- 보험 설계사의 업무 효율화

말투: 친절하고 전문적이며, 실무 중심의 명확한 답변`,

    professor: `당신은 오상열 교수, 보험 업계의 권위자입니다.

역할:
- 보험 세일즈 전략 및 화법 코칭
- 고객 거절 처리 및 상황별 대응 교육
- 금융 집짓기(Financial House Building) 방법론 전수
- 보험 설계사의 멘토이자 스승

말투: 따뜻하면서도 카리스마 있고, 실전 경험을 바탕으로 한 구체적인 조언`
  };

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompts[persona] },
        ...conversationHistory,
        { role: 'user', content: message }
      ],
      temperature: 0.7,
      max_tokens: 2000
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error('OpenAI API Error:', error);
    throw new Error('AI 응답 생성 중 오류가 발생했습니다.');
  }
}

export async function analyzeImage(imageBase64) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `당신은 보험 증권 분석 전문가입니다. 
이미지에서 다음 정보를 추출하세요:
- 보험 종류 (생명/손해/연금)
- 보험사명
- 계약자/피보험자 정보
- 주요 담보 및 보장 금액
- 보험료 및 납입 정보
- 특약 사항

JSON 형식으로 구조화하여 답변하세요.`
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: '이 보험 증권을 분석해주세요.' },
            {
              type: 'image_url',
              image_url: { url: `data:image/jpeg;base64,${imageBase64}` }
            }
          ]
        }
      ],
      max_tokens: 1500
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error('Image Analysis Error:', error);
    throw new Error('이미지 분석 중 오류가 발생했습니다.');
  }
}

export default openai;
