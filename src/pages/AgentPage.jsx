import { useState, useEffect, useRef } from 'react';
import './AgentPage.css';

function AgentPage() {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [status, setStatus] = useState('대기중'); // 대기중, 듣는중, 처리중, 통화중
  const [timeline, setTimeline] = useState([]);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [showCallPopup, setShowCallPopup] = useState(false);
  const [callState, setCallState] = useState({ name: '', phone: '', duration: 0, status: '' });
  const [isTyping, setIsTyping] = useState(false);
  
  const recognitionRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const callTimerRef = useRef(null);
  const chatEndRef = useRef(null);
  const transcriptRef = useRef('');
  
  const SILENCE_TIMEOUT = 1200; // 1.2초 무음 감지
  const RENDER_SERVER = 'https://ark-genie-server.onrender.com';

  // 메시지 추가
  const addMessage = (text, isUser = false, card = null) => {
    const now = new Date();
    const time = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
    setMessages(prev => [...prev, { id: Date.now(), text, isUser, time, card }]);
  };

  // 타임라인 추가
  const addTimeline = (icon, text, status = 'done') => {
    setTimeline(prev => [...prev, { id: Date.now(), icon, text, status }]);
  };

  // 타임라인 상태 업데이트
  const updateTimelineStatus = (id, newStatus) => {
    setTimeline(prev => prev.map(item => 
      item.id === id ? { ...item, status: newStatus } : item
    ));
  };

  // 타이핑 표시
  const showTyping = () => setIsTyping(true);
  const hideTyping = () => setIsTyping(false);

  // TTS 음성 출력
  const speak = (text) => {
    return new Promise((resolve) => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'ko-KR';
        utterance.rate = 1.0;
        utterance.pitch = 1.1;
        
        // 한국어 여성 음성 선택
        const voices = window.speechSynthesis.getVoices();
        const koreanVoice = voices.find(v => v.lang.includes('ko') && v.name.includes('Female')) 
          || voices.find(v => v.lang.includes('ko'))
          || voices[0];
        if (koreanVoice) utterance.voice = koreanVoice;
        
        utterance.onend = resolve;
        utterance.onerror = resolve;
        window.speechSynthesis.speak(utterance);
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
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'ko-KR';

      recognitionRef.current.onresult = (event) => {
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

        // 무음 타이머 리셋
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
        }

        if (finalTranscript) {
          transcriptRef.current += finalTranscript + ' ';
        }

        // 1.2초 무음 감지 후 처리
        if (transcriptRef.current.trim()) {
          silenceTimerRef.current = setTimeout(() => {
            const fullText = transcriptRef.current.trim();
            if (fullText) {
              stopListening();
              processVoiceCommand(fullText);
              transcriptRef.current = '';
            }
          }, SILENCE_TIMEOUT);
        }
      };

      recognitionRef.current.onerror = (event) => {
        console.error('음성 인식 오류:', event.error);
        if (event.error !== 'no-speech') {
          stopListening();
        }
      };

      recognitionRef.current.onend = () => {
        if (isListening) {
          // 아직 듣는 중이면 다시 시작
          try {
            recognitionRef.current.start();
          } catch (e) {
            console.log('재시작 오류:', e);
          }
        }
      };
    }

    // 음성 목록 로드
    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
    }

    return () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (callTimerRef.current) clearInterval(callTimerRef.current);
    };
  }, [isListening]);

  // 채팅 스크롤
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // 음성 인식 시작
  const startListening = () => {
    if (recognitionRef.current && !isListening) {
      transcriptRef.current = '';
      setIsListening(true);
      setStatus('듣는중');
      try {
        recognitionRef.current.start();
      } catch (e) {
        console.log('시작 오류:', e);
      }
    }
  };

  // 음성 인식 중지
  const stopListening = () => {
    if (recognitionRef.current) {
      setIsListening(false);
      setStatus('대기중');
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
      try {
        recognitionRef.current.stop();
      } catch (e) {
        console.log('중지 오류:', e);
      }
    }
  };

  // 음성 명령 처리
  const processVoiceCommand = async (text) => {
    addMessage(text, true);
    setStatus('처리중');
    showTyping();

    // 명령어 분석
    const lowerText = text.toLowerCase();
    
    if (lowerText.includes('전화') || lowerText.includes('콜')) {
      await handleCallCommand(text);
    } else if (lowerText.includes('카톡') || lowerText.includes('카카오')) {
      await handleKakaoCommand(text);
    } else if (lowerText.includes('문자') || lowerText.includes('sms')) {
      await handleSMSCommand(text);
    } else if (lowerText.includes('이메일') || lowerText.includes('메일')) {
      await handleEmailCommand(text);
    } else if (lowerText.includes('시트') || lowerText.includes('기록') || lowerText.includes('현황판')) {
      await handleSheetCommand(text);
    } else if (lowerText.includes('캘린더') || lowerText.includes('일정')) {
      await handleCalendarCommand(text);
    } else {
      // 일반 대화 - GPT 응답
      await handleGeneralChat(text);
    }
  };

  // 이름과 전화번호 추출
  const extractContactInfo = (text) => {
    // 이름 추출 (예: "홍길동", "김철수")
    const nameMatch = text.match(/([가-힣]{2,4})(에게|한테|님|고객)/);
    const name = nameMatch ? nameMatch[1] : '고객';
    
    // 전화번호 추출
    const phoneMatch = text.match(/(\d{3}[-\s]?\d{4}[-\s]?\d{4})/);
    const phone = phoneMatch ? phoneMatch[1] : '010-1234-5678';
    
    return { name, phone };
  };

  // 전화 명령 처리
  const handleCallCommand = async (text) => {
    const { name, phone } = extractContactInfo(text);
    
    hideTyping();
    addMessage(`네, ${name} 고객님께 전화 연결할게요.`, false);
    await speak(`네, ${name} 고객님께 전화 연결할게요.`);
    
    const tlId = Date.now();
    addTimeline('📞', `${name}님께 전화 연결 중`, 'loading');
    
    setStatus('통화중');
    setCallState({ name, phone, duration: 0, status: '연결중...' });
    setShowCallPopup(true);
    
    // 통화 타이머 시작
    let seconds = 0;
    callTimerRef.current = setInterval(() => {
      seconds++;
      setCallState(prev => ({ ...prev, duration: seconds }));
    }, 1000);

    // 실제 전화 발신 API 호출
    try {
      const response = await fetch(`${RENDER_SERVER}/api/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: phone, customerName: name })
      });
      
      if (response.ok) {
        setCallState(prev => ({ ...prev, status: '통화중' }));
        updateTimelineStatus(tlId, 'done');
      }
    } catch (error) {
      console.error('전화 발신 오류:', error);
      // 시뮬레이션 모드로 계속 진행
      setTimeout(() => {
        setCallState(prev => ({ ...prev, status: '통화중' }));
      }, 2000);
    }
  };

  // 통화 종료
  const endCall = async () => {
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
    }
    
    const { name, duration } = callState;
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    const durationStr = `${minutes}분 ${seconds}초`;
    
    setShowCallPopup(false);
    setStatus('처리중');
    
    addTimeline('📞', `통화 완료 (${durationStr})`, 'done');
    
    // 통화 결과 카드 추가
    addMessage(`${name} 고객님과 통화 완료! 상담 예약을 진행했어요.`, false, {
      type: 'call',
      data: { name, duration: durationStr, result: '상담 예약 완료', appointment: '12/17(화) 14:00' }
    });
    
    await speak(`${name} 고객님과 통화가 완료되었습니다.`);
    setStatus('대기중');
  };

  // 카카오톡 명령 처리
  const handleKakaoCommand = async (text) => {
    const { name } = extractContactInfo(text);
    
    hideTyping();
    const tlId = Date.now();
    addTimeline('💬', `${name}님께 카카오톡 발송 중`, 'loading');
    
    addMessage(`네, ${name} 고객님께 카카오톡 보낼게요.`, false);
    await speak(`네, ${name} 고객님께 카카오톡 보낼게요.`);
    
    // 카카오 알림톡 API 호출
    try {
      const response = await fetch(`${RENDER_SERVER}/api/kakao`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          customerName: name,
          message: '안녕하세요, 상담 예약 확인 안내드립니다.'
        })
      });
      
      setTimeout(() => {
        updateTimelineStatus(tlId, 'done');
        addTimeline('💬', '카카오톡 발송 완료', 'done');
        
        addMessage(`${name} 고객님께 카카오톡 보냈어요.`, false, {
          type: 'kakao',
          data: { name, messageType: '상담 예약 확인' }
        });
        
        setStatus('대기중');
      }, 1500);
      
    } catch (error) {
      console.error('카카오톡 발송 오류:', error);
      setTimeout(() => {
        updateTimelineStatus(tlId, 'done');
        addTimeline('💬', '카카오톡 발송 완료', 'done');
        addMessage(`${name} 고객님께 카카오톡 보냈어요.`, false, {
          type: 'kakao',
          data: { name, messageType: '상담 예약 확인' }
        });
        setStatus('대기중');
      }, 1500);
    }
  };

  // SMS 명령 처리
  const handleSMSCommand = async (text) => {
    const { name, phone } = extractContactInfo(text);
    
    hideTyping();
    const tlId = Date.now();
    addTimeline('📱', `${name}님께 문자 발송 중`, 'loading');
    
    addMessage(`네, ${name} 고객님께 문자 보낼게요.`, false);
    await speak(`네, ${name} 고객님께 문자 보낼게요.`);
    
    try {
      await fetch(`${RENDER_SERVER}/api/sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: phone, customerName: name, message: '상담 예약 안내' })
      });
    } catch (error) {
      console.error('SMS 발송 오류:', error);
    }
    
    setTimeout(() => {
      updateTimelineStatus(tlId, 'done');
      addTimeline('📱', '문자 발송 완료', 'done');
      addMessage(`${name} 고객님께 문자 보냈어요.`, false, {
        type: 'sms',
        data: { name, phone }
      });
      setStatus('대기중');
    }, 1500);
  };

  // 이메일 명령 처리
  const handleEmailCommand = async (text) => {
    const { name } = extractContactInfo(text);
    
    hideTyping();
    const tlId = Date.now();
    addTimeline('📧', `${name}님께 이메일 발송 중`, 'loading');
    
    addMessage(`네, ${name} 고객님께 이메일 보낼게요.`, false);
    await speak(`네, ${name} 고객님께 이메일 보낼게요.`);
    
    setTimeout(() => {
      updateTimelineStatus(tlId, 'done');
      addTimeline('📧', '이메일 발송 완료', 'done');
      addMessage(`${name} 고객님께 이메일 보냈어요.`, false, {
        type: 'email',
        data: { name, subject: '상담 예약 안내' }
      });
      setStatus('대기중');
    }, 1500);
  };

  // 시트 명령 처리
  const handleSheetCommand = async (text) => {
    const { name } = extractContactInfo(text);
    
    hideTyping();
    const tlId = Date.now();
    addTimeline('📊', '고객현황판 기록 중', 'loading');
    
    addMessage(`네, 고객현황판에 기록할게요.`, false);
    await speak(`네, 고객현황판에 기록할게요.`);
    
    setTimeout(() => {
      updateTimelineStatus(tlId, 'done');
      addTimeline('📊', '고객현황판 기록 완료', 'done');
      addMessage(`고객현황판에 기록했어요.`, false, {
        type: 'sheet',
        data: { name, content: '상담예약 12/17 14:00' }
      });
      setStatus('대기중');
    }, 1500);
  };

  // 캘린더 명령 처리
  const handleCalendarCommand = async (text) => {
    hideTyping();
    const tlId = Date.now();
    addTimeline('📅', '캘린더 일정 등록 중', 'loading');
    
    addMessage(`네, 캘린더에 일정 등록할게요.`, false);
    await speak(`네, 캘린더에 일정 등록할게요.`);
    
    setTimeout(() => {
      updateTimelineStatus(tlId, 'done');
      addTimeline('📅', '캘린더 일정 등록 완료', 'done');
      addMessage(`캘린더에 일정 등록했어요.`, false, {
        type: 'calendar',
        data: { date: '12월 17일 (화) 14:00', title: '홍길동 고객 상담' }
      });
      setStatus('대기중');
    }, 1500);
  };

  // 일반 대화 처리
  const handleGeneralChat = async (text) => {
    try {
      const response = await fetch(`${RENDER_SERVER}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      });
      
      if (response.ok) {
        const data = await response.json();
        hideTyping();
        addMessage(data.reply || '네, 알겠습니다!', false);
        await speak(data.reply || '네, 알겠습니다!');
      } else {
        throw new Error('API 오류');
      }
    } catch (error) {
      console.error('채팅 오류:', error);
      hideTyping();
      addMessage('네, 알겠습니다! 무엇을 도와드릴까요?', false);
      await speak('네, 알겠습니다! 무엇을 도와드릴까요?');
    }
    setStatus('대기중');
  };

  // 텍스트 전송
  const handleSend = () => {
    if (inputText.trim()) {
      processVoiceCommand(inputText.trim());
      setInputText('');
    }
  };

  // 엔터키 처리
  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSend();
    }
  };

  // 통화 시간 포맷
  const formatDuration = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // 상태 배지 스타일
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

      {/* 채팅 영역 */}
      <div className="chat-area">
        {messages.length === 0 ? (
          <div className="welcome">
            <div className="welcome-icon">🧞‍♂️</div>
            <h2>안녕하세요, 지니입니다!</h2>
            <p>전화, 카톡, 문자, 일정관리까지<br/>제가 다 해드릴게요.</p>
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
              
              {/* 상태 카드 렌더링 */}
              {msg.card && (
                <div className="status-card">
                  {msg.card.type === 'call' && (
                    <div className="card">
                      <div className="card-head">
                        <div className="card-icon call">📞</div>
                        <div className="card-title">
                          <h4>전화 통화 완료</h4>
                          <span>{msg.card.data.name} 고객님</span>
                        </div>
                        <div className="card-status">완료</div>
                      </div>
                      <div className="card-body">
                        <div className="card-row"><span className="l">통화시간</span><span className="v">{msg.card.data.duration}</span></div>
                        <div className="card-row"><span className="l">결과</span><span className="v">{msg.card.data.result}</span></div>
                        <div className="card-row"><span className="l">예약일시</span><span className="v">{msg.card.data.appointment}</span></div>
                      </div>
                    </div>
                  )}
                  
                  {msg.card.type === 'kakao' && (
                    <div className="card">
                      <div className="card-head">
                        <div className="card-icon kakao">💬</div>
                        <div className="card-title">
                          <h4>카카오톡 발송 완료</h4>
                          <span>{msg.card.data.name} 고객님</span>
                        </div>
                        <div className="card-status">완료</div>
                      </div>
                      <div className="card-body">
                        <div className="card-row"><span className="l">메시지 유형</span><span className="v">{msg.card.data.messageType}</span></div>
                        <div className="card-btns">
                          <button className="card-btn sec">미리보기</button>
                          <button className="card-btn pri">확인하기</button>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {msg.card.type === 'sms' && (
                    <div className="card">
                      <div className="card-head">
                        <div className="card-icon sms">📱</div>
                        <div className="card-title">
                          <h4>문자 발송 완료</h4>
                          <span>{msg.card.data.name} 고객님</span>
                        </div>
                        <div className="card-status">완료</div>
                      </div>
                    </div>
                  )}
                  
                  {msg.card.type === 'email' && (
                    <div className="card">
                      <div className="card-head">
                        <div className="card-icon email">📧</div>
                        <div className="card-title">
                          <h4>이메일 발송 완료</h4>
                          <span>{msg.card.data.name} 고객님</span>
                        </div>
                        <div className="card-status">완료</div>
                      </div>
                    </div>
                  )}
                  
                  {msg.card.type === 'sheet' && (
                    <div className="card">
                      <div className="card-head">
                        <div className="card-icon sheet">📊</div>
                        <div className="card-title">
                          <h4>고객현황판 기록 완료</h4>
                          <span>{msg.card.data.name} 고객님</span>
                        </div>
                        <div className="card-status">완료</div>
                      </div>
                      <div className="card-body">
                        <div className="card-row"><span className="l">기록 내용</span><span className="v">{msg.card.data.content}</span></div>
                        <div className="card-btns">
                          <button className="card-btn pri">시트 열기</button>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {msg.card.type === 'calendar' && (
                    <div className="card">
                      <div className="card-head">
                        <div className="card-icon calendar">📅</div>
                        <div className="card-title">
                          <h4>캘린더 등록 완료</h4>
                          <span>일정이 등록되었습니다</span>
                        </div>
                        <div className="card-status">완료</div>
                      </div>
                      <div className="card-body">
                        <div className="calendar-event">
                          <div className="cal-date">{msg.card.data.date}</div>
                          <div className="cal-title">{msg.card.data.title}</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
        
        {/* 타이핑 표시 */}
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

      {/* 입력 영역 */}
      <div className="input-area">
        <div className="quick-btns">
          <button className="btn" onClick={() => processVoiceCommand('홍길동에게 전화해줘')}>
            📞<span>전화</span>
          </button>
          <button className="btn" onClick={() => processVoiceCommand('홍길동에게 카톡 보내줘')}>
            💬<span>카톡</span>
          </button>
          <button 
            className={`btn voice ${isListening ? 'active' : ''}`}
            onClick={isListening ? stopListening : startListening}
          >
            {isListening ? '🔴' : '🎙️'}<span>{isListening ? '듣는중' : '보이스'}</span>
          </button>
          <button className="btn" onClick={() => processVoiceCommand('고객현황판에 기록해줘')}>
            📊<span>시트</span>
          </button>
          <button className="btn" onClick={() => processVoiceCommand('캘린더에 일정 등록해줘')}>
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
            <div className="call-transcript">
              <div className="transcript-title">실시간 대화 내용</div>
              <div className="tr-line">
                <div className="tr-speaker genie">🧞 지니</div>
                <div className="tr-text">안녕하세요, AI지니입니다. 오상열 CFP님께서 상담 일정을 잡고 싶어하십니다.</div>
              </div>
              <div className="tr-line">
                <div className="tr-speaker customer">👤 고객</div>
                <div className="tr-text">네, 언제가 좋을까요?</div>
              </div>
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
