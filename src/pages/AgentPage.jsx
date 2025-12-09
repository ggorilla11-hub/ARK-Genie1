import React, { useState, useRef, useEffect } from 'react';
import './AgentPage.css';

const RENDER_SERVER = 'https://ark-genie-server.onrender.com';

function AgentPage() {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState('대기중');
  const chatAreaRef = useRef(null);
  const recognitionRef = useRef(null);

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

  // 전화 걸기
  const makeCall = async (name, phone) => {
    setIsProcessing(true);
    setStatus('전화 연결중...');
    addMessage(`${name}님께 전화를 연결합니다...`, false);

    try {
      const formattedPhone = phone.replace(/-/g, '');
      const fullPhone = formattedPhone.startsWith('0') 
        ? '+82' + formattedPhone.slice(1) 
        : formattedPhone;

      const response = await fetch(`${RENDER_SERVER}/make-call?to=${fullPhone}`);
      const data = await response.json();

      if (data.success) {
        addMessage(`✅ ${name}님께 전화 연결 성공!`, false, {
          type: 'call',
          name,
          phone,
          status: '연결됨',
          callSid: data.callSid
        });
        setStatus('통화중');
      } else {
        addMessage(`❌ 전화 연결 실패: ${data.error}`, false);
        setStatus('대기중');
      }
    } catch (error) {
      addMessage(`❌ 전화 연결 실패: ${error.message}`, false);
      setStatus('대기중');
    }
    setIsProcessing(false);
  };

  // 음성 인식 시작
  const startListening = () => {
    if (!('webkitSpeechRecognition' in window)) {
      alert('이 브라우저는 음성 인식을 지원하지 않습니다.');
      return;
    }

    const recognition = new window.webkitSpeechRecognition();
    recognition.lang = 'ko-KR';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
      setIsListening(true);
      setStatus('듣는중...');
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      processVoiceCommand(transcript);
    };

    recognition.onerror = () => {
      setIsListening(false);
      setStatus('대기중');
    };

    recognition.onend = () => {
      setIsListening(false);
      setStatus('대기중');
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  // 음성 명령 처리
  const processVoiceCommand = (command) => {
    addMessage(command, true);

    if (!customerName || !customerPhone) {
      addMessage('먼저 고객 정보(이름, 연락처)를 입력해주세요.', false);
      return;
    }

    if (command.includes('전화') || command.includes('콜') || command.includes('연결')) {
      makeCall(customerName, customerPhone);
    } else if (command.includes('예약') || command.includes('일정') || command.includes('약속')) {
      addMessage(`📅 ${customerName}님 일정 등록 기능 준비중...`, false);
    } else if (command.includes('기록') || command.includes('시트') || command.includes('저장')) {
      addMessage(`📊 ${customerName}님 정보 기록 기능 준비중...`, false);
    } else if (command.includes('문자') || command.includes('카톡') || command.includes('메시지')) {
      addMessage(`💬 ${customerName}님께 메시지 발송 기능 준비중...`, false);
    } else {
      addMessage(`네, 교수님. "${command}" 명령을 처리하겠습니다.`, false);
    }
  };

  // 텍스트 전송
  const handleSend = () => {
    if (!inputText.trim()) return;
    processVoiceCommand(inputText);
    setInputText('');
  };

  return (
    <div className="agent-page">
      <header className="agent-header">
        <div className="header-icon">🧞</div>
        <div className="header-info">
          <h1>AI 지니</h1>
          <p>실제 작동 • 전화/시트/캘린더</p>
        </div>
        <div className={`status-badge ${isListening ? 'listening' : isProcessing ? 'processing' : ''}`}>
          {status}
        </div>
      </header>

      {/* 고객 정보 입력 */}
      <div className="customer-input-section">
        <h3>📋 고객 정보</h3>
        <div className="customer-inputs">
          <input
            type="text"
            placeholder="고객 이름"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
          />
          <input
            type="tel"
            placeholder="연락처 (010-1234-5678)"
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
          />
        </div>
        {customerName && customerPhone && (
          <div className="customer-ready">
            ✅ {customerName}님 ({customerPhone}) 준비됨
          </div>
        )}
      </div>

      {/* 채팅 영역 */}
      <div className="chat-area" ref={chatAreaRef}>
        {messages.length === 0 ? (
          <div className="welcome-message">
            <div className="welcome-icon">🧞</div>
            <h2>안녕하세요, 지니입니다!</h2>
            <p>고객 정보를 입력하고 음성으로 명령해주세요.</p>
            <div className="example-commands">
              <p>💡 이렇게 말해보세요:</p>
              <span>"전화 연결해줘"</span>
              <span>"일정 잡아줘"</span>
              <span>"시트에 기록해줘"</span>
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`message ${msg.isUser ? 'user' : 'ai'}`}>
              <div className="message-content">
                <p>{msg.text}</p>
                {msg.cardData && (
                  <div className={`action-card ${msg.cardData.type}`}>
                    {msg.cardData.type === 'call' && (
                      <>
                        <span className="card-icon">📞</span>
                        <span>{msg.cardData.name}님 통화</span>
                        <span className="card-status">{msg.cardData.status}</span>
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

      {/* 빠른 액션 버튼 */}
      <div className="quick-actions">
        <button onClick={() => customerName && customerPhone && makeCall(customerName, customerPhone)} 
                disabled={!customerName || !customerPhone || isProcessing}>
          📞 전화
        </button>
        <button disabled>📊 기록</button>
        <button disabled>📅 일정</button>
      </div>

      {/* 입력 영역 */}
      <div className="input-area">
        <button 
          className={`voice-btn ${isListening ? 'listening' : ''}`}
          onClick={startListening}
          disabled={isProcessing}
        >
          🎤
        </button>
        <input
          type="text"
          placeholder="지니야, 전화 연결해줘..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSend()}
        />
        <button className="send-btn" onClick={handleSend} disabled={isProcessing}>
          ▶
        </button>
      </div>
    </div>
  );
}

export default AgentPage;
