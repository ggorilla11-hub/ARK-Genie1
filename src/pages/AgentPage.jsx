import React, { useState, useRef, useEffect } from 'react';
import './AgentPage.css';

const RENDER_SERVER = 'https://ark-genie-server.onrender.com';

function AgentPage() {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [status, setStatus] = useState('대기중');
  const [currentCall, setCurrentCall] = useState(null);
  const [callDuration, setCallDuration] = useState(0);
  const [currentTranscript, setCurrentTranscript] = useState('');
  
  const chatAreaRef = useRef(null);
  const recognitionRef = useRef(null);
  const voiceModeRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const callTimerRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const transcriptRef = useRef('');

  useEffect(() => {
    if (chatAreaRef.current) {
      chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight;
    }
  }, [messages]);

  // 음성 합성 초기화 (성숙한 목소리 선택)
  useEffect(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
      };
    }
  }, []);

  const addMessage = (text, isUser) => {
    setMessages(prev => [...prev, {
      id: Date.now() + Math.random(),
      text,
      isUser,
      time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
    }]);
  };

  // 지니 음성 응답 (성숙한 여성 목소리)
  const speakGenie = (text) => {
    return new Promise((resolve) => {
      isSpeakingRef.current = true;
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch(e) {}
      }
      
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ko-KR';
      utterance.rate = 0.95; // 약간 천천히
      utterance.pitch = 0.9; // 낮은 톤 (성숙한 느낌)
      utterance.volume = 1.0;
      
      // 성숙한 여성 목소리 선택
      const voices = window.speechSynthesis.getVoices();
      const koreanFemale = voices.find(v => 
        v.lang.includes('ko') && (v.name.includes('Female') || v.name.includes('여'))
      ) || voices.find(v => v.lang.includes('ko')) || voices[0];
      
      if (koreanFemale) utterance.voice = koreanFemale;
      
      utterance.onend = () => {
        isSpeakingRef.current = false;
        // 1초 대기 후 다시 듣기
        setTimeout(() => {
          if (voiceModeRef.current && !isSpeakingRef.current) {
            startRecognition();
          }
          resolve();
        }, 2000);
      };
      utterance.onerror = () => {
        isSpeakingRef.current = false;
        setTimeout(() => {
          if (voiceModeRef.current && !isSpeakingRef.current) {
            startRecognition();
          }
          resolve();
        }, 2000);
      };
      
      window.speechSynthesis.speak(utterance);
    });
  };

  // GPT-4o 대화
  const askGenie = async (userMessage) => {
    try {
      const response = await fetch(`${RENDER_SERVER}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage })
      });
      const data = await response.json();
      return data.reply || '네, 대표님! 다시 말씀해주세요.';
    } catch (error) {
      console.error('GPT 에러:', error);
      return '네, 대표님! 잠시 연결이 불안정합니다.';
    }
  };

  // 음성 인식 시작 (긴 말 끝까지 듣기)
  const startRecognition = () => {
    if (isSpeakingRef.current) {
      setTimeout(() => {
        if (voiceModeRef.current) startRecognition();
      }, 500);
      return;
    }

    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('음성 인식을 지원하지 않는 브라우저입니다.');
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.lang = 'ko-KR';
    recognition.continuous = true; // 계속 듣기
    recognition.interimResults = true; // 중간 결과 표시

    recognition.onstart = () => {
      setStatus('듣는중...');
      transcriptRef.current = '';
    };

    recognition.onresult = (event) => {
      if (isSpeakingRef.current) return;
      
      let interimTranscript = '';
      let finalTranscript = '';
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' ';
        } else {
          interimTranscript = transcript;
        }
      }
      
      // 최종 인식된 텍스트 누적
      if (finalTranscript) {
        transcriptRef.current += finalTranscript;
      }
      
      // 화면에 실시간 표시
      const displayText = (transcriptRef.current + interimTranscript).trim();
      setCurrentTranscript(displayText);
      
      // 무음 타이머 리셋 - 말할 때마다 1초 재시작
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
      
      // 1초 동안 추가 입력 없으면 처리
      silenceTimerRef.current = setTimeout(() => {
        const fullText = transcriptRef.current.trim();
        if (fullText && voiceModeRef.current && !isSpeakingRef.current) {
          processUserMessage(fullText);
          transcriptRef.current = '';
          setCurrentTranscript('');
        }
      }, 2000);
    };

    recognition.onerror = (event) => {
      console.log('음성 인식 에러:', event.error);
      if (voiceModeRef.current && !isSpeakingRef.current && event.error !== 'aborted') {
        setTimeout(() => {
          if (voiceModeRef.current && !isSpeakingRef.current) {
            startRecognition();
          }
        }, 2000);
      }
    };

    recognition.onend = () => {
      if (voiceModeRef.current && !isSpeakingRef.current) {
        setTimeout(() => {
          if (voiceModeRef.current && !isSpeakingRef.current) {
            startRecognition();
          }
        }, 500);
      } else if (!voiceModeRef.current) {
        setStatus('대기중');
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  // 사용자 메시지 처리 (전화 감지 포함)
  const processUserMessage = async (text) => {
    // 음성 인식 중지
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch(e) {}
    }
    
    addMessage(text, true);
    setStatus('생각중...');
    
    // 전화 요청 감지
    if (text.includes('전화') || text.includes('콜') || text.includes('통화')) {
      // 전화번호 추출
      const phoneMatch = text.match(/\d{2,4}[-\s]?\d{3,4}[-\s]?\d{4}/);
      // 이름 추출
      const namePatterns = [
        /([가-힣]{2,4})\s*(교수|선생|님|씨|고객|대표|사장|부장|과장|차장|팀장)?/,
        /([가-힣]{2,4})(에게|한테|께)/
      ];
      
      let name = '';
      for (const pattern of namePatterns) {
        const match = text.match(pattern);
        if (match) {
          name = match[1];
          break;
        }
      }
      
      const phone = phoneMatch ? phoneMatch[0] : '';
      
      if (phone && name) {
        // 복명복창 후 전화 연결
        const confirmMsg = `네, ${name}님(${phone})께 바로 전화하겠습니다.`;
        addMessage(confirmMsg, false);
        await speakGenie(confirmMsg);
        await makeCall(name, phone);
        return;
      } else if (name) {
        const askPhone = `${name}님 전화번호를 알려주세요.`;
        addMessage(askPhone, false);
        await speakGenie(askPhone);
        return;
      } else if (phone) {
        const confirmMsg = `네, ${phone}로 바로 전화하겠습니다.`;
        addMessage(confirmMsg, false);
        await speakGenie(confirmMsg);
        await makeCall('고객', phone);
        return;
      } else {
        const askInfo = '어느 분께 전화할까요? 이름과 전화번호를 알려주세요.';
        addMessage(askInfo, false);
        await speakGenie(askInfo);
        return;
      }
    }
    
    // 일반 대화
    const reply = await askGenie(text);
    addMessage(reply, false);
    await speakGenie(reply);
  };

  // 보이스 모드 시작
  const startVoiceMode = () => {
    voiceModeRef.current = true;
    isSpeakingRef.current = false;
    transcriptRef.current = '';
    setCurrentTranscript('');
    setIsVoiceMode(true);
    setStatus('듣는중...');
    startRecognition();
  };

  // 보이스 모드 종료
  const stopVoiceMode = () => {
    voiceModeRef.current = false;
    isSpeakingRef.current = false;
    transcriptRef.current = '';
    setCurrentTranscript('');
    setIsVoiceMode(false);
    setStatus('대기중');
    
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
    }
    
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch(e) {}
    }
    window.speechSynthesis.cancel();
  };

  // 전화 걸기 (UI 전환)
  const makeCall = async (name, phone) => {
    // 보이스 모드 중지
    stopVoiceMode();
    
    setStatus('전화 연결중...');
    
    try {
      const formattedPhone = phone.replace(/[-\s]/g, '');
      const fullPhone = formattedPhone.startsWith('0') ? '+82' + formattedPhone.slice(1) : formattedPhone;
      
      const response = await fetch(`${RENDER_SERVER}/api/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: fullPhone, customerName: name })
      });
      const data = await response.json();
      
      if (data.success) {
        setCurrentCall({ name, phone, callSid: data.callSid });
        setCallDuration(0);
        setStatus('통화중');
        
        // 통화 시간 카운터
        callTimerRef.current = setInterval(() => {
          setCallDuration(prev => prev + 1);
        }, 2000);
        
        addMessage(`📞 ${name}님과 통화 연결됨`, false);
      } else {
        addMessage(`❌ 연결 실패: ${data.error}`, false);
        await speakGenie('전화 연결에 실패했습니다.');
        setStatus('대기중');
      }
    } catch (error) {
      console.error('전화 에러:', error);
      addMessage('⏳ 서버 연결 중... 잠시 후 다시 시도해주세요.', false);
      await speakGenie('서버 연결 중입니다. 잠시 후 다시 시도해주세요.');
      setStatus('대기중');
    }
  };

  // 전화 종료
  const endCall = async () => {
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
    }
    
    const name = currentCall?.name || '고객';
    const duration = formatDuration(callDuration);
    
    setCurrentCall(null);
    setCallDuration(0);
    setStatus('대기중');
    
    addMessage(`📴 ${name}님과의 통화 종료 (${duration})`, false);
    await speakGenie(`${name}님과의 통화가 종료되었습니다.`);
  };

  // 통화 시간 포맷
  const formatDuration = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}분 ${s}초`;
  };

  // 텍스트 전송
  const handleSend = async () => {
    if (!inputText.trim()) return;
    const text = inputText;
    setInputText('');
    await processUserMessage(text);
  };

  return (
    <div className="agent-page">
      <header className="agent-header">
        <div className="header-left">
          <div className="header-icon">🧞</div>
          <div className="header-info">
            <h1>AI 지니</h1>
            <span className="header-subtitle">40만 보험설계사의 AI 비서</span>
          </div>
        </div>
        <div className={`status-badge ${isVoiceMode ? 'voice-mode' : currentCall ? 'oncall' : ''}`}>
          {status}
        </div>
      </header>

      {/* 통화중 배너 */}
      {currentCall && (
        <div className="call-banner">
          <div className="call-info">
            <span className="call-icon">📞</span>
            <span>{currentCall.name}님과 통화중</span>
            <span className="call-duration">{formatDuration(callDuration)}</span>
          </div>
          <button className="end-call-btn" onClick={endCall}>종료</button>
        </div>
      )}

      {/* 보이스 모드 배너 */}
      {isVoiceMode && !currentCall && (
        <div className="voice-banner">
          <div className="voice-info">
            <span className="voice-icon">🎙️</span>
            <span>듣고 있어요</span>
          </div>
          <button className="stop-voice-btn" onClick={stopVoiceMode}>종료</button>
        </div>
      )}

      {/* 현재 인식 중인 텍스트 */}
      {isVoiceMode && currentTranscript && (
        <div className="transcript-banner">
          🎤 {currentTranscript}
        </div>
      )}

      {/* 채팅 영역 */}
      <div className="chat-area" ref={chatAreaRef}>
        {messages.length === 0 ? (
          <div className="welcome-message">
            <div className="welcome-icon">🧞</div>
            <h2>안녕하세요, 지니입니다!</h2>
            <p>🎙️ 버튼을 누르고 말씀해주세요.</p>
            <p className="welcome-hint">"홍길동 010-1234-5678 전화해줘"</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`message ${msg.isUser ? 'user' : 'ai'}`}>
              <div className="message-content">
                <p>{msg.text}</p>
                <span className="message-time">{msg.time}</span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 퀵 액션 */}
      <div className="quick-actions">
        <button onClick={async () => {
          addMessage('🧞 네, 대표님! 무엇을 도와드릴까요?', false);
          await speakGenie('네, 대표님! 무엇을 도와드릴까요?');
        }}>🧞 지니야</button>
        <button disabled={!currentCall} onClick={endCall}>📴 통화종료</button>
      </div>

      {/* 입력 영역 */}
      <div className="input-area">
        <button 
          className={`voice-btn ${isVoiceMode ? 'active' : ''}`}
          onClick={isVoiceMode ? stopVoiceMode : startVoiceMode}
        >
          {isVoiceMode ? '🔴' : '🎙️'}
        </button>
        <input
          type="text"
          placeholder="지니야... (예: 홍길동 010-1234-5678 전화해줘)"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSend()}
        />
        <button className="send-btn" onClick={handleSend}>➤</button>
      </div>
    </div>
  );
}

export default AgentPage;
