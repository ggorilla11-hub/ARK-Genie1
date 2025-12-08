// OpenAI API 서비스
const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;

// AI 응답 받기
export const getAIResponse = async (message, history = [], persona = 'genie') => {
  const systemPrompt = persona === 'genie' 
    ? `당신은 ARK 지니입니다. 보험설계사를 돕는 최고의 AI 어시스턴트입니다.
역할: 보험 상품 분석, 보장 내용 설명, 고객 상담 지원, 보험증권/청구서/설계서 등 모든 보험 서류 분석
응답 원칙: 친절하고 전문적으로, 핵심을 먼저 말하고 부연 설명, 한국어로 명확하게 답변`
    : `당신은 오상열 교수입니다. CFP(국제공인재무설계사)이자 대한민국 최고의 보험업계 멘토입니다.
역할: 보험설계사의 성장과 성공을 돕는 코치, 영업 기술, 고객 상담법, 거절 처리 화법 전문가
응답 원칙: 따뜻하고 격려하는 말투, 실전 경험에서 우러나온 조언, "자네", "~하게" 등 교수님 말투 사용`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          ...history,
          { role: 'user', content: message }
        ],
        max_tokens: 1000,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      throw new Error('API 오류: ' + response.status);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error('getAIResponse Error:', error);
    throw error;
  }
};

// 문서 분석 (이미지)
export const analyzeDocument = async (base64Image, userRequest = '') => {
  const analysisPrompt = userRequest 
    ? `사용자 요청: ${userRequest}\n\n위 요청에 맞춰 이 보험 관련 서류를 분석해주세요.`
    : `이 보험 관련 서류를 전문가 수준으로 분석해주세요. 서류 종류, 기본 정보, 보장 내용, 보험료, 중요 수치, 주의사항, 총평을 포함해주세요.`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: '당신은 보험 서류 분석 전문가입니다. 어떤 보험 관련 서류든 정확하게 분석할 수 있습니다.'
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: analysisPrompt },
              { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Image}` } }
            ]
          }
        ],
        max_tokens: 2000
      })
    });

    if (!response.ok) {
      throw new Error('문서 분석 오류: ' + response.status);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error('analyzeDocument Error:', error);
    throw error;
  }
};

// OpenAI TTS - 페르소나별 목소리 (지니=nova여성, 교수=onyx남성)
export const textToSpeech = async (text, persona = 'genie') => {
  try {
    const voice = persona === 'professor' ? 'onyx' : 'nova';
    
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: text,
        voice: voice,
        speed: 1.0
      })
    });

    if (!response.ok) {
      throw new Error('TTS 오류: ' + response.status);
    }

    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    return audioUrl;
    
  } catch (error) {
    console.error('textToSpeech Error:', error);
    throw error;
  }
};

// 음성 재생
let currentAudio = null;

export const speakText = async (text, persona = 'genie') => {
  try {
    const audioUrl = await textToSpeech(text, persona);
    currentAudio = new Audio(audioUrl);
    
    return new Promise((resolve) => {
      currentAudio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        currentAudio = null;
        resolve();
      };
      
      currentAudio.onerror = () => {
        URL.revokeObjectURL(audioUrl);
        currentAudio = null;
        resolve();
      };
      
      currentAudio.play().catch(() => resolve());
    });
  } catch (error) {
    console.error('speakText Error:', error);
  }
};

export const stopSpeaking = () => {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
};
