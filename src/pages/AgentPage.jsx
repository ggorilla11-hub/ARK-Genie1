import { useState, useEffect, useRef } from 'react';
import './AgentPage.css';

function AgentPage() {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [status, setStatus] = useState('대기중');
  const [timeline, setTimeline] = useState([]);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [showCallPopup, setShowCallPopup] = useState(false);
  const [callState, setCallState] = useState({ name: '', phone: '', duration: 0, status: '' });
  const [isTyping, setIsTyping] = useState(false);
  const [currentTranscript, setCurrentTranscript] = useState('');
  const [pendingAction, setPendingAction] = useState(null);
  
  const recognitionRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const callTimerRef = useRef(null);
  const chatEndRef = useRef(null);
  
  // ⭐ 핵심: useRef로 상태 관리 (리렌더링과 무관하게 유지)
  const voiceModeRef = useRef(false); // 보이스 모드 ON/OFF
  const isProcessingRef = useRef(false); // 처리 중 여부
  const keepListeningRef = useRef(null); // 지속 듣기 인터벌
  
  const SILENCE_TIMEOUT = 1500;
  const RENDER_SERVER = 'https://ark-genie-server.onrender.com';

  // 메시지 추가
  const addMessage = (text, isUser = false, card = null, buttons = null) => {
    const now = new Date();
    const time = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
    setMessages(prev => [...prev, { id: Date.now(), text, isUser, time, card, buttons }]);
  };

  // 타임라인 추가
  const addTimeline = (icon, text, tlStatus = 'done') => {
    setTimeline(prev => [...prev, { id: Date.now(), icon, text, status: tlStatus }]);
  };

  // TTS 음성 출력
  const speak = (text) => {
    return new Promise((resolve) => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'ko-KR';
        utterance.rate = 1.0;
        utterance.pitch = 1.1;
        
        const voices = window.speechSynthesis.getVoices();
        const koreanVoice = voices.find(v => v.lang.includes('ko') && v.name.includes('Female')) 
          || voices.find(v => v.lang.includes('ko'))
          || voices[0];
        if (koreanVoice) utterance.voice = koreanVoice;
        
        utterance.onend = () => {
          // 지니가 말 끝나면 다시 듣기 (보이스 모드가 켜져있을 때만)
          if (voiceModeRef.current) {
            isProcessingRef.current = false;
            setTimeout(() => forceStartRecognition(), 300);
          }
          resolve();
        };
        utterance.onerror = () => {
          if (voiceModeRef.current) {
            isProcessingRef.current = false;
            setTimeout(() => forceStartRecognition(), 300);
          }
          resolve();
        };
        window.speechSynthesis.speak(utterance);
      } else {
        if (voiceModeRef.current) {
          isProcessingRef.current = false;
          setTimeout(() => forceStartRecognition(), 300);
        }
        resolve();
      }
    });
  };

  // ⭐ 강제 음성 인식 시작 (절대 실패하지 않도록)
  const forceStartRecognition = () => {
    if (!voiceModeRef.current || isProcessingRef.current) return;
    
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
      
      setTimeout(() => {
        if (voiceModeRef.current && !isProcessingRef.current) {
          try {
            recognitionRef.current.start();
            setStatus('듣는중');
            console.log('🎤 음성 인식 시작됨');
          } catch (e) {
            console.log('음성 인식 시작 재시도:', e.message);
            // 실패해도 다시 시도
            setTimeout(() => forceStartRecognition(), 500);
          }
        }
      }, 100);
    }
  };

  // 음성 인식 초기화
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'ko-KR';
      recognitionRef.current.maxAlternatives = 1;

      recognitionRef.current.onresult = (event) => {
        if (isProcessingRef.current) return;
        
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }

        // 실시간 텍스트 표시
        if (interimTranscript) {
          setCurrentTranscript(interimTranscript);
        }

        // 무음 타이머 리셋
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
        }

        // 최종 인식 결과 처리
        if (finalTranscript.trim()) {
          setCurrentTranscript(finalTranscript);
          
          silenceTimerRef.current = setTimeout(() => {
            if (finalTranscript.trim() && voiceModeRef.current && !isProcessingRef.current) {
              handleUserInput(finalTranscript.trim());
            }
          }, SILENCE_TIMEOUT);
        }
      };

      recognitionRef.current.onerror = (event) => {
        console.log('음성 인식 오류:', event.error);
        // ⭐ 어떤 에러가 나도 보이스 모드면 다시 시작
        if (voiceModeRef.current && !isProcessingRef.current) {
          setTimeout(() => forceStartRecognition(), 500);
        }
      };

      recognitionRef.current.onend = () => {
        console.log('음성 인식 종료됨, 보이스모드:', voiceModeRef.current);
        // ⭐ 보이스 모드가 켜져있으면 무조건 다시 시작
        if (voiceModeRef.current && !isProcessingRef.current) {
          setTimeout(() => forceStartRecognition(), 300);
        }
      };
    }

    // 음성 목록 로드
    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
      };
    }

    return () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (callTimerRef.current) clearInterval(callTimerRef.current);
      if (keepListeningRef.current) clearInterval(keepListeningRef.current);
    };
  }, []);

  // 채팅 스크롤
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // ⭐ 보이스 모드 시작 (절대 꺼지지 않음)
  const startVoiceMode = () => {
    voiceModeRef.current = true;
    isProcessingRef.current = false;
    setIsListening(true);
    setStatus('듣는중');
    setCurrentTranscript('');
    
    console.log('🎤 보이스 모드 ON');
    
    // 즉시 시작
    forceStartRecognition();
    
    // ⭐ 2초마다 듣기 상태 확인 및 복구
    keepListeningRef.current = setInterval(() => {
      if (voiceModeRef.current && !isProcessingRef.current) {
        // 음성 인식이 죽어있으면 다시 시작
        try {
          if (recognitionRef.current) {
            // 상태 확인 후 필요시 재시작
            forceStartRecognition();
          }
        } catch (e) {}
      }
    }, 2000);
  };

  // ⭐ 보이스 모드 종료
  const stopVoiceMode = () => {
    console.log('🎤 보이스 모드 OFF');
    
    voiceModeRef.current = false;
    isProcessingRef.current = false;
    setIsListening(false);
    setStatus('대기중');
    setCurrentTranscript('');
    
    // 인터벌 정리
    if (keepListeningRef.current) {
      clearInterval(keepListeningRef.current);
      keepListeningRef.current = null;
    }
    
    // 타이머 정리
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
    }
    
    // 음성 인식 중지
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
    }
    
    // TTS 중지
    window.speechSynthesis.cancel();
  };

  // 사용자 입력 처리
  const handleUserInput = async (text) => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    
    // 음성 인식 일시 중지
    try {
      recognitionRef.current?.stop();
    } catch (e) {}
    
    addMessage(text, true);
    setStatus('처리중');
    setCurrentTranscript('');
    setIsTyping(true);

    // 대기 중인 명령에 대한 응답인지 확인
    if (pendingAction) {
      await handlePendingResponse(text);
      return;
    }

    // ⭐ GPT-4o로 의도 분석
    await analyzeWithGPT4o(text);
  };

  // ⭐ GPT-4o 최고 모델로 스마트 분석
  const analyzeWithGPT4o = async (text) => {
    try {
      const response = await fetch(`${RENDER_SERVER}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `당신은 보험설계사의 AI비서 "지니"입니다. 사용자 메시지를 분석하고 적절히 응답하세요.

사용자: "${text}"

[분석 방법]
1. 전화/콜/통화 관련 → intent: "call"
2. 카카오톡/카톡 관련 → intent: "kakao"  
3. 문자/SMS 관련 → intent: "sms"
4. 이메일/메일 관련 → intent: "email"
5. 시트/기록/현황판 관련 → intent: "sheet"
6. 캘린더/일정/스케줄 관련 → intent: "calendar"
7. 일반 대화/질문/인사 → intent: "chat"
8. 의도 불명확 → intent: "unclear"

[중요]
- 고객 이름이 있으면 추출 (예: "홍길동")
- 전화번호가 있으면 추출 (예: "010-1234-5678")
- 자연스럽고 친근한 응답 작성

반드시 아래 JSON 형식으로만 응답:
{"intent": "...", "name": "추출된이름 또는 빈문자열", "phone": "추출된번호 또는 빈문자열", "response": "자연스러운 한국어 응답"}`
        })
      });
      
      const data = await response.json();
      let parsed;
      
      try {
        const jsonMatch = data.reply.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No JSON');
        }
      } catch (e) {
        // JSON 파싱 실패 → 일반 대화로 처리
        setIsTyping(false);
        const reply = data.reply || '네, 무엇을 도와드릴까요?';
        addMessage(reply, false);
        await speak(reply);
        setStatus('대기중');
        isProcessingRef.current = false;
        return;
      }

      await handleIntent(parsed);
      
    } catch (error) {
      console.error('GPT-4o 분석 오류:', error);
      setIsTyping(false);
      addMessage('네, 무엇을 도와드릴까요?', false);
      await speak('네, 무엇을 도와드릴까요?');
      setStatus('대기중');
      isProcessingRef.current = false;
    }
  };

  // 의도에 따른 처리
  const handleIntent = async (parsed) => {
    const { intent, name, phone, response } = parsed;
    setIsTyping(false);

    switch (intent) {
      case 'call':
        if (!phone && !name) {
          const msg = '어느 고객님께 전화할까요? 이름이나 전화번호를 알려주세요.';
          addMessage(msg, false);
          await speak(msg);
        } else {
          const confirmMsg = phone 
            ? `${name || '고객'}님 (${phone})께 전화할까요?`
            : `${name} 고객님께 전화할까요?`;
          
          setPendingAction({ type: 'call', name: name || '고객', phone: phone || '' });
          addMessage(confirmMsg, false, null, ['예, 전화해주세요', '아니오, 취소']);
          await speak(confirmMsg);
        }
        break;

      case 'kakao':
        if (!name) {
          const msg = '어느 고객님께 카카오톡을 보낼까요?';
          addMessage(msg, false);
          await speak(msg);
        } else {
          setPendingAction({ type: 'kakao', name });
          const msg = `${name} 고객님께 카카오톡을 보낼까요?`;
          addMessage(msg, false, null, ['예, 보내주세요', '아니오, 취소']);
          await speak(msg);
        }
        break;

      case 'sms':
        if (!name && !phone) {
          const msg = '어느 고객님께 문자를 보낼까요?';
          addMessage(msg, false);
          await speak(msg);
        } else {
          setPendingAction({ type: 'sms', name: name || '고객', phone });
          const msg = `${name || '고객'}님께 문자를 보낼까요?`;
          addMessage(msg, false, null, ['예, 보내주세요', '아니오, 취소']);
          await speak(msg);
        }
        break;

      case 'email':
        if (!name) {
          const msg = '어느 고객님께 이메일을 보낼까요?';
          addMessage(msg, false);
          await speak(msg);
        } else {
          setPendingAction({ type: 'email', name });
          const msg = `${name} 고객님께 이메일을 보낼까요?`;
          addMessage(msg, false, null, ['예, 보내주세요', '아니오, 취소']);
          await speak(msg);
        }
        break;

      case 'sheet':
        setPendingAction({ type: 'sheet', name });
        const sheetMsg = '고객현황판에 기록할까요?';
        addMessage(sheetMsg, false, null, ['예, 기록해주세요', '아니오, 취소']);
        await speak(sheetMsg);
        break;

      case 'calendar':
        setPendingAction({ type: 'calendar', name });
        const calMsg = '캘린더에 일정을 등록할까요?';
        addMessage(calMsg, false, null, ['예, 등록해주세요', '아니오, 취소']);
        await speak(calMsg);
        break;

      case 'unclear':
        const unclearMsg = response || '죄송해요, 다시 한번 말씀해 주시겠어요?';
        addMessage(unclearMsg, false);
        await speak(unclearMsg);
        break;

      default: // chat - 일반 대화
        const chatMsg = response || '네, 알겠습니다!';
        addMessage(chatMsg, false);
        await speak(chatMsg);
    }

    setStatus(voiceModeRef.current ? '듣는중' : '대기중');
    isProcessingRef.current = false;
  };

  // 대기 중인 명령에 대한 응답 처리
  const handlePendingResponse = async (text) => {
    const lowerText = text.toLowerCase();
    const isYes = lowerText.includes('예') || lowerText.includes('네') || lowerText.includes('응') || 
                  lowerText.includes('좋아') || lowerText.includes('해줘') || lowerText.includes('부탁') ||
                  lowerText.includes('어') || lowerText.includes('그래');
    const isNo = lowerText.includes('아니') || lowerText.includes('취소') || lowerText.includes('됐어') ||
                 lowerText.includes('말어') || lowerText.includes('하지마');

    setIsTyping(false);

    if (isYes) {
      await executeAction(pendingAction);
    } else if (isNo) {
      addMessage('알겠습니다. 취소했어요.', false);
      await speak('알겠습니다. 취소했어요.');
    } else {
      // 불명확한 응답
      addMessage('예 또는 아니오로 답해주세요.', false);
      await speak('예 또는 아니오로 답해주세요.');
      isProcessingRef.current = false;
      return;
    }

    setPendingAction(null);
    setStatus(voiceModeRef.current ? '듣는중' : '대기중');
    isProcessingRef.current = false;
  };

  // 버튼 클릭으로 응답
  const handleButtonClick = async (buttonText) => {
    addMessage(buttonText, true);
    setIsTyping(true);
    isProcessingRef.current = true;
    
    if (buttonText.includes('예') || buttonText.includes('네')) {
      await executeAction(pendingAction);
    } else {
      setIsTyping(false);
      addMessage('알겠습니다. 취소했어요.', false);
      await speak('알겠습니다. 취소했어요.');
    }
    
    setPendingAction(null);
    isProcessingRef.current = false;
  };

  // 실제 명령 실행
  const executeAction = async (action) => {
    if (!action) return;

    const { type, name, phone } = action;

    switch (type) {
      case 'call':
        await executeCall(name, phone);
        break;
      case 'kakao':
        await executeKakao(name);
        break;
      case 'sms':
        await executeSMS(name, phone);
        break;
      case 'email':
        await executeEmail(name);
        break;
      case 'sheet':
        await executeSheet(name);
        break;
      case 'calendar':
        await executeCalendar(name);
        break;
    }
  };

  // 전화 실행
  const executeCall = async (name, phone) => {
    setIsTyping(false);
    addMessage(`네, ${name} 고객님께 전화 연결할게요.`, false);
    await speak(`네, ${name} 고객님께 전화 연결할게요.`);
    
    addTimeline('📞', `${name}님께 전화 연결 중`, 'loading');
    
    // 보이스 모드 일시 중지 (통화 중)
    const wasVoiceMode = voiceModeRef.current;
    if (wasVoiceMode) {
      stopVoiceMode();
    }
    
    setStatus('통화중');
    setCallState({ name, phone: phone || '010-0000-0000', duration: 0, status: '연결중...' });
    setShowCallPopup(true);
    
    let seconds = 0;
    callTimerRef.current = setInterval(() => {
      seconds++;
      setCallState(prev => ({ ...prev, duration: seconds }));
    }, 1000);

    try {
      const phoneNumber = phone || '010-0000-0000';
      const response = await fetch(`${RENDER_SERVER}/api/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: phoneNumber, customerName: name })
      });
      
      if (response.ok) {
        setCallState(prev => ({ ...prev, status: '통화중' }));
        addTimeline('📞', `${name}님과 통화 연결됨`, 'done');
      }
    } catch (error) {
      console.error('전화 발신 오류:', error);
      setCallState(prev => ({ ...prev, status: '통화중' }));
    }
  };

  // 통화 종료
  const endCall = async () => {
    if (callTimerRef.current) clearInterval(callTimerRef.current);
    
    const { name, duration } = callState;
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    const durationStr = `${minutes}분 ${seconds}초`;
    
    setShowCallPopup(false);
    
    addTimeline('📞', `통화 완료 (${durationStr})`, 'done');
    
    addMessage(`${name} 고객님과 통화 완료!`, false, {
      type: 'call',
      data: { name, duration: durationStr }
    });
    
    await speak(`${name} 고객님과 통화가 완료되었습니다.`);
    setStatus('대기중');
  };

  // 카카오톡 실행
  const executeKakao = async (name) => {
    setIsTyping(false);
    addTimeline('💬', `${name}님께 카카오톡 발송 중`, 'loading');
    addMessage(`네, ${name} 고객님께 카카오톡 보낼게요.`, false);
    await speak(`네, ${name} 고객님께 카카오톡 보내겠습니다.`);
    
    setTimeout(() => {
      addTimeline('💬', '카카오톡 발송 완료', 'done');
      addMessage(`${name} 고객님께 카카오톡 보냈어요.`, false, {
        type: 'kakao',
        data: { name, messageType: '안내 메시지' }
      });
    }, 1500);
  };

  // SMS 실행
  const executeSMS = async (name, phone) => {
    setIsTyping(false);
    addTimeline('📱', `${name}님께 문자 발송 중`, 'loading');
    addMessage(`네, ${name} 고객님께 문자 보낼게요.`, false);
    await speak(`네, ${name} 고객님께 문자 보내겠습니다.`);
    
    setTimeout(() => {
      addTimeline('📱', '문자 발송 완료', 'done');
      addMessage(`${name} 고객님께 문자 보냈어요.`, false, {
        type: 'sms',
        data: { name, phone }
      });
    }, 1500);
  };

  // 이메일 실행
  const executeEmail = async (name) => {
    setIsTyping(false);
    addTimeline('📧', `${name}님께 이메일 발송 중`, 'loading');
    addMessage(`네, ${name} 고객님께 이메일 보낼게요.`, false);
    await speak(`네, ${name} 고객님께 이메일 보내겠습니다.`);
    
    setTimeout(() => {
      addTimeline('📧', '이메일 발송 완료', 'done');
      addMessage(`${name} 고객님께 이메일 보냈어요.`, false, {
        type: 'email',
        data: { name, subject: '안내' }
      });
    }, 1500);
  };

  // 시트 실행
  const executeSheet = async (name) => {
    setIsTyping(false);
    addTimeline('📊', '고객현황판 기록 중', 'loading');
    addMessage(`네, 고객현황판에 기록할게요.`, false);
    await speak(`네, 고객현황판에 기록하겠습니다.`);
    
    setTimeout(() => {
      addTimeline('📊', '고객현황판 기록 완료', 'done');
      addMessage(`고객현황판에 기록했어요.`, false, {
        type: 'sheet',
        data: { name: name || '', content: '기록 완료' }
      });
    }, 1500);
  };

  // 캘린더 실행
  const executeCalendar = async (name) => {
    setIsTyping(false);
    addTimeline('📅', '캘린더 일정 등록 중', 'loading');
    addMessage(`네, 캘린더에 일정 등록할게요.`, false);
    await speak(`네, 캘린더에 일정 등록하겠습니다.`);
    
    setTimeout(() => {
      addTimeline('📅', '캘린더 일정 등록 완료', 'done');
      addMessage(`캘린더에 일정 등록했어요.`, false, {
        type: 'calendar',
        data: { date: '일정', title: name ? `${name} 고객 상담` : '일정' }
      });
    }, 1500);
  };

  // 텍스트 전송
  const handleSend = () => {
    if (inputText.trim()) {
      handleUserInput(inputText.trim());
      setInputText('');
    }
  };

  // 엔터키
  const handleKeyPress = (e) => {
    if (e.key === 'Enter') handleSend();
  };

  // 통화 시간 포맷
  const formatDuration = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // 상태 스타일
  const getStatusStyle = () => {
    switch (status) {
      case '듣는중': return 'status listening';
      case '처리중': return 'status processing';
      case '통화중': return 'status calling';
      default: return 'status';
    }
  };

  return (
    <div className="agent-page">
      {/* 헤더 */}
      <div className="agent-header">
        <div className="avatar">🧞</div>
        <div className="header-info">
          <h1>AI 지니</h1>
          <p>40만 보험설계사의 AI 비서</p>
        </div>
        <button className={getStatusStyle()}>{status}</button>
      </div>

      {/* 채팅 */}
      <div className="chat-area">
        {messages.length === 0 ? (
          <div className="welcome">
            <div className="welcome-icon">🧞‍♂️</div>
            <h2>안녕하세요, 지니입니다!</h2>
            <p>전화, 카톡, 문자, 일정관리까지<br/>제가 다 해드릴게요.</p>
            <p style={{fontSize: '12px', marginTop: '10px', opacity: 0.7}}>
              "홍길동에게 전화해줘" 처럼 말씀해주세요
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id}>
              <div className={`message ${msg.isUser ? 'user' : 'bot'}`}>
                {!msg.isUser && <div className="msg-avatar">🧞</div>}
                <div className="bubble">
                  <p>{msg.text}</p>
                  <span className="time">{msg.time}</span>
                </div>
              </div>
              
              {/* 확인 버튼 */}
              {msg.buttons && pendingAction && (
                <div className="confirm-buttons">
                  {msg.buttons.map((btn, idx) => (
                    <button
                      key={idx}
                      className={`confirm-btn ${btn.includes('예') ? 'yes' : 'no'}`}
                      onClick={() => handleButtonClick(btn)}
                    >
                      {btn}
                    </button>
                  ))}
                </div>
              )}
              
              {/* 상태 카드 */}
              {msg.card && (
                <div className="status-card">
                  <div className="card">
                    <div className="card-head">
                      <div className={`card-icon ${msg.card.type}`}>
                        {msg.card.type === 'call' && '📞'}
                        {msg.card.type === 'kakao' && '💬'}
                        {msg.card.type === 'sms' && '📱'}
                        {msg.card.type === 'email' && '📧'}
                        {msg.card.type === 'sheet' && '📊'}
                        {msg.card.type === 'calendar' && '📅'}
                      </div>
                      <div className="card-title">
                        <h4>
                          {msg.card.type === 'call' && '전화 통화 완료'}
                          {msg.card.type === 'kakao' && '카카오톡 발송 완료'}
                          {msg.card.type === 'sms' && '문자 발송 완료'}
                          {msg.card.type === 'email' && '이메일 발송 완료'}
                          {msg.card.type === 'sheet' && '고객현황판 기록 완료'}
                          {msg.card.type === 'calendar' && '캘린더 등록 완료'}
                        </h4>
                        {msg.card.data?.name && <span>{msg.card.data.name} 고객님</span>}
                      </div>
                      <div className="card-status">완료</div>
                    </div>
                    {msg.card.data?.duration && (
                      <div className="card-body">
                        <div className="card-row">
                          <span className="l">통화시간</span>
                          <span className="v">{msg.card.data.duration}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
        
        {isTyping && (
          <div className="typing">
            <div className="msg-avatar">🧞</div>
            <div className="dots">
              <div className="dot"></div>
              <div className="dot"></div>
              <div className="dot"></div>
            </div>
          </div>
        )}
        
        <div ref={chatEndRef} />
      </div>

      {/* 입력 영역 */}
      <div className="input-area">
        {isListening && currentTranscript && (
          <div className="current-transcript">
            🎤 {currentTranscript}
          </div>
        )}
        
        <div className="quick-btns">
          <button className="btn" onClick={() => handleUserInput('전화 걸어줘')}>
            📞<span>전화</span>
          </button>
          <button className="btn" onClick={() => handleUserInput('카톡 보내줘')}>
            💬<span>카톡</span>
          </button>
          <button 
            className={`btn voice ${isListening ? 'active' : ''}`}
            onClick={isListening ? stopVoiceMode : startVoiceMode}
          >
            {isListening ? '🔴' : '🎙️'}<span>{isListening ? '듣는중' : '보이스'}</span>
          </button>
          <button className="btn" onClick={() => handleUserInput('시트에 기록해줘')}>
            📊<span>시트</span>
          </button>
          <button className="btn" onClick={() => handleUserInput('일정 등록해줘')}>
            📅<span>일정</span>
          </button>
        </div>
        <div className="input-row">
          <input
            type="text"
            placeholder="지니야, 무엇을 도와드릴까요?"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyPress={handleKeyPress}
          />
          <button className="send-btn" onClick={handleSend}>➤</button>
        </div>
      </div>

      {/* 타임라인 */}
      <div className={`timeline ${timelineOpen ? 'open' : ''}`}>
        <div className="tl-head" onClick={() => setTimelineOpen(!timelineOpen)}>
          <div className="tl-title">
            <span>📋 작업 기록</span>
            <span className="tl-badge">{timeline.length}</span>
          </div>
          <span className="tl-toggle">▼</span>
        </div>
        {timelineOpen && (
          <div className="tl-content">
            {timeline.map((item) => (
              <div key={item.id} className="tl-item">
                <div className="tl-icon">{item.icon}</div>
                <span className="tl-text">{item.text}</span>
                <span className={`tl-status ${item.status}`}>
                  {item.status === 'loading' ? '진행중' : '완료'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 통화 팝업 */}
      {showCallPopup && (
        <div className="call-popup">
          <div className="call-popup-box">
            <div className="call-info">
              <div className="call-avatar">👤</div>
              <div className="call-name">{callState.name}</div>
              <div className="call-phone">{callState.phone}</div>
              <div className="call-state">{callState.status}</div>
              <div className="call-timer">{formatDuration(callState.duration)}</div>
            </div>
            <div className="call-btns">
              <button className="call-btn mute">🔇</button>
              <button className="call-btn end" onClick={endCall}>📞</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AgentPage;
