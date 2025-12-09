import React, { useState, useRef, useEffect } from 'react';
import './AgentPage.css';

const RENDER_SERVER = 'https://ark-genie-server.onrender.com';

function AgentPage() {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState('대기중');
  const [currentCall, setCurrentCall] = useState(null);
  const chatAreaRef = useRef(null);
  const recognitionRef = useRef(null);
  const voiceModeRef = useRef(false);

  // 음성 합성 (지니 목소리)
  const speak = (text, callback) => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ko-KR';
    utterance.rate = 1.0;
    utterance.pitch = 1.2;
    if (callback) {
      utterance.onend = callback;
    }
    window.speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    if (chatAreaRef.current) {
      chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight;
    }
  }, [messages]);

  const addMessage = (text, isUser, cardData = null) => {
    const newMsg = {
      id: Date.now(),
      text,
      isUser,
      time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
      cardData
    };
    setMessages(prev => [...prev, newMsg]);
  };

  // 지니야 호출 감지 (유사 발음 포함)
  const isGenieCall = (text) => {
    const lower = text.toLowerCase().replace(/\s/g, '');
    const patterns = ['지니야', '지니아', '지니', '진희야', '진희아', '진이야', '진이아', '지은아', '지은이', '지니님', '진짜', '진이'];
    return patterns.some(p => lower.includes(p));
  };

  // 전화 걸기
  const makeCall = async (name, phone) => {
    setIsProcessing(true);
    setStatus('전화 연결중...');
    addMessage(`${name}님께 전화를 연결합니다...`, false, { type: 'calling', name, phone });
    speak(`${name}님께 전화를 연결합니다.`);

    try {
      const formattedPhone = phone.replace(/[-\s]/g, '');
      const fullPhone = formattedPhone.startsWith('0') 
        ? '+82' + formattedPhone.slice(1) 
        : formattedPhone;

      const response = await fetch(`${RENDER_SERVER}/make-call?to=${fullPhone}`, {
        method: 'GET',
        mode: 'cors'
      });
      const data = await response.json();

      if (data.success) {
        setCurrentCall({ name, phone, callSid: data.callSid });
        addMessage(`✅ ${name}님과 통화중입니다.`, false, {
          type: 'call-connected',
          name,
          phone,
          callSid: data.callSid
        });
        setStatus('통화중');
        speak(`${name}님과 연결되었습니다.`);
      } else {
        addMessage(`❌ 전화 연결 실패: ${data.error}`, false);
        setStatus('대기중');
        speak('전화 연결에 실패했습니다.');
      }
    } catch (error) {
      addMessage(`⏳ 서버 준비중... 10초 후 다시 시도해주세요.`, false);
      setStatus('대기중');
      speak('서버가 준비중입니다. 잠시 후 다시 시도해주세요.');
    }
    setIsProcessing(false);
  };

  // 전화 종료
  const endCall = () => {
    if (currentCall) {
      addMessage(`📞 ${currentCall.name}님과의 통화가 종료되었습니다.`, false, {
        type: 'call-ended',
        name: currentCall.name
      });
      speak(`${currentCall.name}님과의 통화가 종료되었습니다.`);
      setCurrentCall(null);
      setStatus('대기중');
    }
  };

  // 단일 음성 인식 (모바일 호환)
  const startSingleRecognition = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('이 브라우저는 음성 인식을 지원하지 않습니다.');
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'ko-KR';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setStatus('듣는중...');
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript.trim();
      if (transcript) {
        processVoiceCommand(transcript);
      }
      // 보이스 모드면 다시 시작
      if (voiceModeRef.current) {
        setTimeout(() => startSingleRecognition(), 500);
      }
    };

    recognition.onerror = (event) => {
      console.log('음성 인식 에러:', event.error);
      // 보이스 모드면 다시 시작
      if (voiceModeRef.current && event.error !== 'aborted') {
        setTimeout(() => startSingleRecognition(), 500);
      }
    };

    recognition.onend = () => {
      if (!voiceModeRef.current) {
        setStatus('대기중');
      } else {
        // 보이스 모드면 다시 시작
        setTimeout(() => {
          if (voiceModeRef.current) {
            startSingleRecognition();
          }
        }, 300);
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  // 보이스 모드 시작
  const startVoiceMode = () => {
    voiceModeRef.current = true;
    setIsVoiceMode(true);
    setStatus('듣는중...');
    
    addMessage('🎙️ 보이스 모드 시작! "지니야"라고 불러주세요.', false);
    speak('네, 대표님! 무엇을 도와드릴까요?', () => {
      startSingleRecognition();
    });
  };

  // 보이스 모드 종료
  const stopVoiceMode = () => {
    voiceModeRef.current = false;
    setIsVoiceMode(false);
    setStatus('대기중');
    if (recognitionRef.current) {
      recognitionRef.current.abort();
    }
    addMessage('🔇 보이스 모드가 종료되었습니다.', false);
    speak('보이스 모드를 종료합니다.');
  };

  // 음성 명령 처리
  const processVoiceCommand = (command) => {
    addMessage(command, true);

    // "지니야" 호출 감지
    if (isGenieCall(command)) {
      const cleanCommand = command.replace(/지니야?|진희야?|진이야?|지은아?|지니?/gi, '').trim();
      
      if (cleanCommand.length < 3) {
        speak('네, 대표님! 무엇을 도와드릴까요?');
        addMessage('네, 대표님! 무엇을 도와드릴까요? 🧞', false);
        return;
      } else {
        processActualCommand(cleanCommand);
        return;
      }
    }

    processActualCommand(command);
  };

  // 실제 명령 처리
  const processActualCommand = (command) => {
    const lowerCommand = command.toLowerCase();

    const phoneMatch = command.match(/(\d{2,3}[-\s]?\d{3,4}[-\s]?\d{4})/);
    const nameMatch = command.match(/([가-힣]{2,4})(?:에게|한테|님|씨|고객)?/);

    if (lowerCommand.includes('전화') || lowerCommand.includes('콜') || lowerCommand.includes('연결')) {
      if (phoneMatch) {
        const name = nameMatch ? nameMatch[1] : '고객';
        makeCall(name, phoneMatch[0]);
      } else if (inputText.match(/\d{2,3}[-\s]?\d{3,4}[-\s]?\d{4}/)) {
        const phone = inputText.match(/(\d{2,3}[-\s]?\d{3,4}[-\s]?\d{4})/)[0];
        const name = nameMatch ? nameMatch[1] : '고객';
        makeCall(name, phone);
        setInputText('');
      } else {
        speak('전화번호를 말씀해주시거나 입력창에 입력해주세요, 대표님.');
        addMessage('📱 전화번호를 말씀해주시거나 입력창에 입력해주세요.', false);
      }
    } else if (lowerCommand.includes('종료') || lowerCommand.includes('끊어') || lowerCommand.includes('그만')) {
      if (currentCall) {
        endCall();
      } else if (isVoiceMode) {
        stopVoiceMode();
      }
    } else if (lowerCommand.includes('카톡') || lowerCommand.includes('문자') || lowerCommand.includes('메시지')) {
      speak('카카오톡 발송 기능은 준비중입니다, 대표님.');
      addMessage('💬 카카오톡/문자 발송 기능 준비중...', false, { type: 'pending', feature: '카톡/문자' });
    } else if (lowerCommand.includes('일정') || lowerCommand.includes('예약') || lowerCommand.includes('약속')) {
      speak('일정 등록 기능은 준비중입니다, 대표님.');
      addMessage('📅 일정 등록 기능 준비중...', false, { type: 'pending', feature: '캘린더' });
    } else if (lowerCommand.includes('기록') || lowerCommand.includes('저장') || lowerCommand.includes('시트')) {
      speak('고객현황판 기록 기능은 준비중입니다, 대표님.');
      addMessage('📊 고객현황판 기록 기능 준비중...', false, { type: 'pending', feature: '시트' });
    } else {
      speak(`네, 대표님. 말씀하신 내용을 확인했습니다.`);
      addMessage(`🧞 네, 대표님. "${command}" 확인했습니다.`, false);
    }
  };

  // 텍스트 전송
  const handleSend = () => {
    if (!inputText.trim()) return;
    processVoiceCommand(inputText);
    setInputText('');
  };

  // 파일 업로드
  const handleFileUpload = () => {
    speak('파일 업로드 기능은 준비중입니다, 대표님.');
    addMessage('📁 파일 업로드 기능 준비중...', false);
  };

  return (
    <div className="agent-page">
      <header className="agent-header">
        <div className="header-left">
          <div className="header-icon">🧞</div>
          <div className="header-info">
            <h1>AI 지니</h1>
            <span className="header-subtitle">음성 비서</span>
          </div>
        </div>
        <div className={`status-badge ${isVoiceMode ? 'voice-mode' : isProcessing ? 'processing' : currentCall ? 'oncall' : ''}`}>
          {status}
        </div>
      </header>

      {currentCall && (
        <div className="call-banner">
          <div className="call-info">
            <span className="call-icon">📞</span>
            <span>{currentCall.name}님과 통화중</span>
          </div>
          <button className="end-call-btn" onClick={endCall}>통화 종료</button>
        </div>
      )}

      {isVoiceMode && !currentCall && (
        <div className="voice-banner">
          <div className="voice-info">
            <span className="voice-icon">🎙️</span>
            <span>보이스 모드 - "지니야"</span>
          </div>
          <button className="stop-voice-btn" onClick={stopVoiceMode}>종료</button>
        </div>
      )}

      <div className="chat-area" ref={chatAreaRef}>
        {messages.length === 0 ? (
          <div className="welcome-message">
            <div className="welcome-icon">🧞</div>
            <h2>안녕하세요, 지니입니다!</h2>
            <p>보이스 버튼을 눌러 대화를 시작하세요.</p>
            <div className="example-commands">
              <p>💡 이렇게 말해보세요:</p>
              <span>"지니야"</span>
              <span>"홍길동 010-1234-5678 전화해줘"</span>
              <span>"종료"</span>
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`message ${msg.isUser ? 'user' : 'ai'}`}>
              <div className="message-content">
                <p>{msg.text}</p>
                {msg.cardData && (
                  <div className={`action-card ${msg.cardData.type}`}>
                    {msg.cardData.type === 'calling' && (
                      <>
                        <span className="card-icon">📞</span>
                        <span>연결중: {msg.cardData.name}님</span>
                        <div className="card-loading"></div>
                      </>
                    )}
                    {msg.cardData.type === 'call-connected' && (
                      <>
                        <span className="card-icon">✅</span>
                        <span>통화중: {msg.cardData.name}님</span>
                      </>
                    )}
                    {msg.cardData.type === 'call-ended' && (
                      <>
                        <span className="card-icon">📴</span>
                        <span>통화종료: {msg.cardData.name}님</span>
                      </>
                    )}
                    {msg.cardData.type === 'pending' && (
                      <>
                        <span className="card-icon">🔧</span>
                        <span>{msg.cardData.feature} 준비중</span>
                      </>
                    )}
                  </div>
                )}
                <span className="message-time">{msg.time}</span>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="quick-actions">
        <button onClick={() => { 
          speak('네, 대표님! 무엇을 도와드릴까요?'); 
          addMessage('네, 대표님! 무엇을 도와드릴까요? 🧞', false); 
        }}>
          🧞 지니야
        </button>
        <button onClick={handleFileUpload}>📁 파일</button>
        <button disabled={!currentCall} onClick={endCall}>📴 종료</button>
      </div>

      <div className="input-area">
        <button className="icon-btn" onClick={handleFileUpload}>📎</button>
        <button 
          className={`voice-btn ${isVoiceMode ? 'active' : ''}`}
          onClick={isVoiceMode ? stopVoiceMode : startVoiceMode}
        >
          {isVoiceMode ? '🔴' : '🎙️'}
        </button>
        <input
          type="text"
          placeholder="번호 입력 또는 명령어..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSend()}
        />
        <button className="send-btn" onClick={handleSend} disabled={isProcessing}>
          ➤
        </button>
      </div>
    </div>
  );
}

export default AgentPage;
