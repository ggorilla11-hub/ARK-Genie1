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
  
  const recognitionRef = useRef(null);
  const callTimerRef = useRef(null);
  const chatEndRef = useRef(null);
  const isProcessingRef = useRef(false);
  const accumulatedTextRef = useRef(''); // 누적 텍스트
  const silenceTimerRef = useRef(null);
  const isListeningRef = useRef(false);
  
  const RENDER_SERVER = 'https://ark-genie-server.onrender.com';
  const SILENCE_TIMEOUT = 2500; // 2.5초 무음 후 처리 (길게 설정)

  // 메시지 추가
  const addMessage = (text, isUser = false, card = null) => {
    const now = new Date();
    const time = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
    setMessages(prev => [...prev, { id: Date.now(), text, isUser, time, card }]);
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
        
        setTimeout(() => {
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.lang = 'ko-KR';
          utterance.rate = 1.0;
          utterance.pitch = 1.0;
          
          const voices = window.speechSynthesis.getVoices();
          const koreanVoice = voices.find(v => v.lang.includes('ko'));
          if (koreanVoice) utterance.voice = koreanVoice;
          
          utterance.onend = resolve;
          utterance.onerror = resolve;
          window.speechSynthesis.speak(utterance);
        }, 100);
      } else {
        resolve();
      }
    });
  };

  // 음성 인식 초기화
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true; // 계속 듣기
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'ko-KR';

      recognitionRef.current.onresult = (event) => {
        if (isProcessingRef.current) return;
        
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }

        // 최종 인식된 텍스트 누적
        if (finalTranscript) {
          accumulatedTextRef.current += ' ' + finalTranscript;
          accumulatedTextRef.current = accumulatedTextRef.current.trim();
        }

        // 화면에 표시 (누적 + 현재 인식중)
        const displayText = (accumulatedTextRef.current + ' ' + interimTranscript).trim();
        if (displayText) {
          setCurrentTranscript(displayText);
        }

        // 무음 타이머 리셋 - 말할 때마다 타이머 재시작
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
        }

        // 2.5초 동안 추가 입력 없으면 처리 시작
        silenceTimerRef.current = setTimeout(() => {
          const fullText = accumulatedTextRef.current.trim();
          if (fullText && isListeningRef.current && !isProcessingRef.current) {
            processUserInput(fullText);
            accumulatedTextRef.current = '';
          }
        }, SILENCE_TIMEOUT);
      };

      recognitionRef.current.onend = () => {
        // 보이스 모드 중이면 다시 시작 (조용히)
        if (isListeningRef.current && !isProcessingRef.current) {
          setTimeout(() => {
            if (isListeningRef.current && !isProcessingRef.current) {
              try {
                recognitionRef.current.start();
              } catch (e) {}
            }
          }, 300);
        }
      };

      recognitionRef.current.onerror = (event) => {
        console.log('음성 인식 오류:', event.error);
        // 보이스 모드 중이면 다시 시작
        if (isListeningRef.current && !isProcessingRef.current && event.error !== 'aborted') {
          setTimeout(() => {
            if (isListeningRef.current && !isProcessingRef.current) {
              try {
                recognitionRef.current.start();
              } catch (e) {}
            }
          }, 1000);
        }
      };
    }

    // 음성 목록 로드
    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
    }

    return () => {
      if (callTimerRef.current) clearInterval(callTimerRef.current);
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };
  }, []);

  // 채팅 스크롤
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // 보이스 모드 시작
  const startVoiceMode = async () => {
    isListeningRef.current = true;
    isProcessingRef.current = false;
    accumulatedTextRef.current = '';
    
    setIsListening(true);
    setStatus('듣는중');
    setCurrentTranscript('');
    
    // 시작 알림
    await speak('네, 말씀하세요.');
    
    // 음성 인식 시작
    setTimeout(() => {
      if (recognitionRef.current && isListeningRef.current) {
        try {
          recognitionRef.current.start();
        } catch (e) {}
      }
    }, 300);
  };

  // 보이스 모드 종료
  const stopVoiceMode = () => {
    isListeningRef.current = false;
    isProcessingRef.current = false;
    accumulatedTextRef.current = '';
    
    setIsListening(false);
    setStatus('대기중');
    setCurrentTranscript('');
    
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
    }
    
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
    }
    
    window.speechSynthesis.cancel();
  };

  // 사용자 입력 처리
  const processUserInput = async (text) => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    
    // 음성 인식 일시 정지
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
    }
    
    addMessage(text, true);
    setStatus('처리중');
    setCurrentTranscript('');
    setIsTyping(true);

    // 키워드 분석
    const lowerText = text.toLowerCase();
    
    // 전화 요청 감지
    if (lowerText.includes('전화') || lowerText.includes('콜') || lowerText.includes('통화')) {
      // 전화번호 추출
      const phoneMatch = text.match(/\d{2,4}[-\s]?\d{3,4}[-\s]?\d{4}/);
      // 이름 추출
      const nameMatch = text.match(/([가-힣]{2,4})\s*(에게|한테|님|께|교수|선생|고객|씨)?/);
      
      const phone = phoneMatch ? phoneMatch[0] : '';
      const name = nameMatch ? nameMatch[1] : '';
      
      if (phone || name) {
        await executeCallDirect(name || '고객', phone);
      } else {
        setIsTyping(false);
        const reply = '어느 분께 전화할까요? 이름이나 전화번호를 알려주세요.';
        addMessage(reply, false);
        await speak(reply);
        finishProcessing();
      }
      return;
    }
    
    // 일반 대화 - GPT-4o 호출
    await chatWithGPT(text);
  };

  // GPT-4o 대화
  const chatWithGPT = async (text) => {
    try {
      const response = await fetch(`${RENDER_SERVER}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      });
      
      const data = await response.json();
      const reply = data.reply || '네, 알겠습니다!';
      
      setIsTyping(false);
      addMessage(reply, false);
      await speak(reply);
      
    } catch (error) {
      console.error('GPT 에러:', error);
      setIsTyping(false);
      addMessage('네, 무엇을 도와드릴까요?', false);
      await speak('네, 무엇을 도와드릴까요?');
    }
    
    finishProcessing();
  };

  // 전화 바로 실행 (복명복창 후 바로 전화)
  const executeCallDirect = async (name, phone) => {
    setIsTyping(false);
    
    // 복명복창
    const confirmMsg = phone 
      ? `네, ${name}님(${phone})께 바로 전화하겠습니다.`
      : `네, ${name}님께 바로 전화하겠습니다.`;
    
    addMessage(confirmMsg, false);
    await speak(confirmMsg);
    
    if (!phone) {
      addMessage('전화번호를 알려주세요.', false);
      await speak('전화번호를 알려주세요.');
      finishProcessing();
      return;
    }
    
    // 전화 실행
    addTimeline('📞', `${name}님께 전화 연결 중`, 'loading');
    
    // 보이스 모드 끄기
    stopVoiceMode();
    
    setStatus('통화중');
    setCallState({ name, phone, duration: 0, status: '연결중...' });
    setShowCallPopup(true);
    
    let seconds = 0;
    callTimerRef.current = setInterval(() => {
      seconds++;
      setCallState(prev => ({ ...prev, duration: seconds }));
    }, 1000);

    try {
      const response = await fetch(`${RENDER_SERVER}/api/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: phone, customerName: name })
      });
      
      const result = await response.json();
      
      if (result.success) {
        setCallState(prev => ({ ...prev, status: '통화중' }));
        addTimeline('📞', `${name}님과 통화 연결됨`, 'done');
      } else {
        setCallState(prev => ({ ...prev, status: '연결 실패' }));
        addTimeline('📞', '전화 연결 실패', 'done');
      }
    } catch (error) {
      console.error('전화 에러:', error);
      setCallState(prev => ({ ...prev, status: '연결 실패' }));
    }
    
    isProcessingRef.current = false;
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
    addMessage(`${name}님과 통화 완료! (${durationStr})`, false, {
      type: 'call',
      data: { name, duration: durationStr }
    });
    
    await speak(`${name}님과 통화가 완료되었습니다.`);
    setStatus('대기중');
  };

  // 처리 완료 후 다시 듣기
  const finishProcessing = () => {
    isProcessingRef.current = false;
    accumulatedTextRef.current = '';
    
    if (isListeningRef.current) {
      setStatus('듣는중');
      setTimeout(() => {
        if (isListeningRef.current && recognitionRef.current) {
          try {
            recognitionRef.current.start();
          } catch (e) {}
        }
      }, 500);
    } else {
      setStatus('대기중');
    }
  };

  // 텍스트 전송
  const handleSend = () => {
    if (inputText.trim()) {
      processUserInput(inputText.trim());
      setInputText('');
    }
  };

  // 엔터키
  const handleKeyPress = (e) => {
    if (e.key === 'Enter') handleSend();
  };

  // 퀵버튼 핸들러
  const handleQuickButton = (action) => {
    switch(action) {
      case 'call':
        processUserInput('전화 걸어줘');
        break;
      case 'kakao':
        processUserInput('카톡 보내줘');
        break;
      case 'sheet':
        processUserInput('시트에 기록해줘');
        break;
      case 'calendar':
        processUserInput('일정 등록해줘');
        break;
    }
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
              "홍길동 010-1234-5678 전화해줘"
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
              
              {msg.card && (
                <div className="status-card">
                  <div className="card">
                    <div className="card-head">
                      <div className="card-icon call">📞</div>
                      <div className="card-title">
                        <h4>전화 통화 완료</h4>
                        <span>{msg.card.data.name}님</span>
                      </div>
                      <div className="card-status">완료</div>
                    </div>
                    <div className="card-body">
                      <div className="card-row">
                        <span className="l">통화시간</span>
                        <span className="v">{msg.card.data.duration}</span>
                      </div>
                    </div>
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
          <button className="btn" onClick={() => handleQuickButton('call')}>
            📞<span>전화</span>
          </button>
          <button className="btn" onClick={() => handleQuickButton('kakao')}>
            💬<span>카톡</span>
          </button>
          <button 
            className={`btn voice ${isListening ? 'active' : ''}`}
            onClick={isListening ? stopVoiceMode : startVoiceMode}
          >
            {isListening ? '🔴' : '🎙️'}<span>{isListening ? '중지' : '보이스'}</span>
          </button>
          <button className="btn" onClick={() => handleQuickButton('sheet')}>
            📊<span>시트</span>
          </button>
          <button className="btn" onClick={() => handleQuickButton('calendar')}>
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
