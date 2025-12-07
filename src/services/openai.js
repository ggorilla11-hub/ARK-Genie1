// OpenAI API 서비스
const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;

// AI 응답 받기
export const getAIResponse = async (message, history = [], persona = 'genie') => {
  const systemPrompt = persona === 'genie' 
    ? `당신은 ARK 지니입니다. 보험설계사를 돕는 AI 어시스턴트입니다. 친절하고 전문적으로 답변합니다. 한국어로 간결하게 2-3문장으로 답변합니다.`
    : `당신은 오상열 교수입니다. MDRT 전문가이자 보험업계의 멘토입니다. 따뜻하고 격려하는 말투로 답변합니다. 한국어로 간결하게 2-3문장으로 답변합니다.`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          ...history,
          { role: 'user', content: message }
        ],
        max_tokens: 300,
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
export const analyzeDocument = async (base64Image) => {
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
            role: 'user',
            content: [
              {
                type: 'text',
                text: '이 보험 서류를 분석해주세요. 서류 종류, 주요 내용, 중요 수치, 주의사항을 알려주세요.'
              },
              {
                type: 'image_url',
                image_url: { url: `data:image/jpeg;base64,${base64Image}` }
              }
            ]
          }
        ],
        max_tokens: 1000
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

// 브라우저 TTS - 가장 단순한 버전
export const speakText = (text) => {
  return new Promise((resolve) => {
    // TTS 지원 안 하면 바로 종료
    if (!window.speechSynthesis) {
      resolve();
      return;
    }

    // 기존 음성 모두 취소
    window.speechSynthesis.cancel();

    // 잠시 대기 후 실행 (모바일 버그 방지)
    setTimeout(() => {
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = 'ko-KR';
      utter.rate = 1;
      utter.pitch = 1;
      utter.volume = 1;
      
      utter.onend = () => {
        resolve();
      };
      
      utter.onerror = (e) => {
        console.log('TTS 오류:', e);
        resolve();
      };

      window.speechSynthesis.speak(utter);
      
      // 모바일 Chrome 버그 해결: 15초마다 resume 호출
      const keepAlive = setInterval(() => {
        if (window.speechSynthesis.speaking) {
          window.speechSynthesis.pause();
          window.speechSynthesis.resume();
        } else {
          clearInterval(keepAlive);
        }
      }, 10000);
      
      // 최대 60초 후 자동 종료
      setTimeout(() => {
        clearInterval(keepAlive);
        resolve();
      }, 60000);
      
    }, 100);
  });
};

// 음성 중지
export const stopSpeaking = () => {
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
};
