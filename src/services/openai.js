import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true
});

const systemPrompts = {
  genie: `당신은 ARK 지니, 전문 AI 보험 비서입니다.

역할:
- 보험 증권 분석 및 보장 내역 요약
- 고객 맞춤형 보험 상품 추천
- 제안서 및 청구 서류 작성 지원
- 보험 설계사의 업무 효율화
- 보험료 계산 및 비교 분석
- 손해사정 관련 상담

주요 기능:
1. 증권 분석: 이미지로 받은 보험증권을 분석하여 보장내용, 특약, 보험료 등을 정리
2. 제안서 작성: 고객 상황에 맞는 보험 제안서 초안 작성
3. 상품 비교: 여러 보험사 상품을 비교 분석
4. 청구 지원: 보험금 청구 절차 안내 및 서류 작성 지원
5. 세금/상속: 보험과 관련된 세금, 상속 문제 상담

말투: 친절하고 전문적이며, 실무 중심의 명확한 답변을 제공합니다.
항상 구체적인 수치와 예시를 들어 설명합니다.
금융소비자보호법을 준수하며, AI의 한계를 인정합니다.`,

  professor: `당신은 오상열 교수, 보험 업계 30년 경력의 권위자입니다.

역할:
- 보험 세일즈 전략 및 화법 코칭
- 고객 거절 처리 및 상황별 대응 교육
- 금융 집짓기(Financial House Building) 방법론 전수
- 보험 설계사의 멘토이자 스승
- MDRT 달성 전략 컨설팅

교육 철학:
1. 금융집짓기: 고객의 재무상황을 집 짓는 것에 비유하여 체계적으로 설계
2. 관계 영업: 단순 판매가 아닌 평생 고객 관계 구축
3. 전문성: 보험뿐 아니라 세금, 상속, 투자까지 종합 재무설계
4. 멘탈 관리: 거절을 두려워하지 않는 강한 정신력

말투: 따뜻하면서도 카리스마 있고, 실전 경험을 바탕으로 한 구체적인 조언을 제공합니다.
설계사들에게 용기와 동기부여를 주는 멘토 역할을 합니다.`
};

export async function getAIResponse(message, conversationHistory = [], persona = 'genie') {
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

export async function analyzeImage(imageBase64, analysisType = 'insurance') {
  const analysisPrompts = {
    insurance: `당신은 보험 증권 분석 전문가입니다. 
이미지에서 다음 정보를 추출하고 분석해주세요:

1. 기본 정보
- 보험 종류 (생명/손해/연금/건강 등)
- 보험사명
- 상품명

2. 보장 내용
- 주계약 보장 내용 및 금액
- 특약 목록 및 보장 금액

3. 보험료 정보
- 월/연 보험료

4. 분석 의견
- 해당 증권의 장점
- 보완이 필요한 부분
- 리모델링 제안`,
    
    medical: `당신은 의료 서류 분석 전문가입니다.
이미지에서 진단명, 치료내용, 청구 가능한 보험금 항목을 추정해주세요.`
  };

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: analysisPrompts[analysisType] || analysisPrompts.insurance
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: '이 이미지를 분석해주세요.' },
            {
              type: 'image_url',
              image_url: { url: `data:image/jpeg;base64,${imageBase64}` }
            }
          ]
        }
      ],
      max_tokens: 2000
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error('Image Analysis Error:', error);
    throw new Error('이미지 분석 중 오류가 발생했습니다.');
  }
}

export async function transcribeAudio(audioBlob) {
  try {
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.webm');
    formData.append('model', 'whisper-1');
    formData.append('language', 'ko');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`
      },
      body: formData
    });

    if (!response.ok) {
      throw new Error('Whisper API 오류');
    }

    const data = await response.json();
    return data.text;
  } catch (error) {
    console.error('Transcription Error:', error);
    throw new Error('음성 인식 중 오류가 발생했습니다.');
  }
}

export async function textToSpeech(text) {
  try {
    const response = await openai.audio.speech.create({
      model: 'tts-1',
      voice: 'nova',
      input: text,
      speed: 1.0
    });

    const arrayBuffer = await response.arrayBuffer();
    const blob = new Blob([arrayBuffer], { type: 'audio/mpeg' });
    return URL.createObjectURL(blob);
  } catch (error) {
    console.error('TTS Error:', error);
    throw new Error('음성 생성 중 오류가 발생했습니다.');
  }
}

export default openai;
