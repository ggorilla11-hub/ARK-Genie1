import React, { useState, useRef, useEffect } from 'react';
import './AgentPage.css';

function AgentPage() {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState('대기중');
  const chatAreaRef = useRef(null);
  const recognitionRef = useRef(null);

  // 스크롤 자동 이동
  useEffect(() => {
    if (chatAreaRef.current) {
      chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight;
    }
  }, [messages]);

  // 메시지 추가
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

  // 음성 인식
  const toggleVoice = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('음성 인식을 지원하지 않는 브라우저입니다.');
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognitionRef.current = new SpeechRecognition();
    recognitionRef.current.lang = 'ko-KR';
    recognitionRef.current.continuous = false;

    recognitionRef.current.onstart = () => {
      setIsListening(true);
      setStatus('듣는중');
    };

    recognitionRef.current.onresult = (e) => {
      const text = e.results[0][0].transcript;
      setInputText(text);
      handleSend(text);
    };

    recognitionRef.current.onend = () => {
      setIsListening(false);
      setStatus('대기중');
    };

    recognitionRef.current.start();
  };

  // 명령어 분석
  const analyzeCommand = (text) => {
    const lower = text.toLowerCase();
    
    // 고객명 추출
    const nameMatch = text.match(/([가-힣]{2,4})(?:에게|한테|고객|님)/);
    const customerName = nameMatch ? nameMatch[1] : null;
    
    // 전화번호 추출
    const phoneMatch = text.match(/(\d{2,3}[-\s]?\d{3,4}[-\s]?\d{4})/);
    const phoneNumber = phoneMatch ? phoneMatch[1].replace(/[-\s]/g, '') : null;

    if (lower.includes('전화') || lower.includes('콜')) {
      return { action: 'call', customerName, phoneNumber };
    }
    if (lower.includes('기록') || lower.includes('시트') || lower.includes('저장')) {
      return { action: 'sheet', customerName };
    }
    if (lower.includes('일정') || lower.includes('캘린더') || lower.includes('예약')) {
      return { action: 'calendar', customerName };
    }
    if (lower.includes('카톡') || lower.includes('카카오') || lower.includes('문자')) {
      return { action: 'message', customerName, phoneNumber };
    }
    
    return { action: 'chat', customerName };
  };

  // API 호출: 전화
  const makeCall = async (name, phone) => {
    try {
      const res = await fetch('/api/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone })
      });
      const data = await res.json();
      return data;
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  // API 호출: 시트 기록
  const recordSheet = async (name, phone, content) => {
    try {
      const res = await fetch('/api/sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name, 
          phone, 
          content, 
          status: '상담예약',
          next_action: '방문상담'
        })
      });
      const data = await res.json();
      return data;
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  // API 호출: 캘린더
  const createCalendarEvent = async (name) => {
    try {
      const res = await fetch('/api/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          title: `${name} 고객 상담`,
          description: '보험 상담'
        })
      });
      const data = await res.json();
      return data;
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  // API 호출: AI 채팅
  const chatWithAI = async (message) => {
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      });
      const data = await res.json();
      return data;
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  // 메시지 전송 처리
  const handleSend = async (voiceText = null) => {
    const text = voiceText || inputText.trim();
    if (!text) return;

    setInputText('');
    addMessage(text, true);
    setIsProcessing(true);
    setStatus('처리중');

    const command = analyzeCommand(text);

    try {
      if (command.action === 'call') {
        if (!command.phoneNumber) {
          addMessage('전화번호를 말씀해주세요. 예: "홍길동 010-1234-5678에게 전화해줘"', false);
        } else {
          addMessage(`${command.customerName || '고객'}님께 전화를 연결합니다...`, false);
          const result = await makeCall(command.customerName, command.phoneNumber);
          if (result.success) {
            addMessage(`✅ 전화 연결 완료!`, false, {
              type: 'call',
              name: command.customerName,
              phone: command.phoneNumber,
              status: '연결됨'
            });
          } else {
            addMessage(`❌ 전화 연결 실패: ${result.error}`, false);
          }
        }
      } 
      else if (command.action === 'sheet') {
        if (!command.customerName) {
          addMessage('고객명을 말씀해주세요. 예: "홍길동 고객 기록해줘"', false);
        } else {
          addMessage(`${command.customerName} 고객 정보를 기록합니다...`, false);
          const result = await recordSheet(command.customerName, command.phoneNumber, '상담 진행');
          if (result.success) {
            addMessage(`✅ 고객현황판에 기록 완료!`, false, {
              type: 'sheet',
              name: command.customerName,
              status: '저장됨'
            });
          } else {
            addMessage(`❌ 기록 실패: ${result.error}`, false);
          }
        }
      }
      else if (command.action === 'calendar') {
        if (!command.customerName) {
          addMessage('고객명을 말씀해주세요. 예: "홍길동 고객 일정 잡아줘"', false);
        } else {
          addMessage(`${command.customerName} 고객 상담 일정을 등록합니다...`, false);
          const result = await createCalendarEvent(command.customerName);
          if (result.success) {
            addMessage(`✅ 캘린더에 일정 등록 완료!`, false, {
              type: 'calendar',
              name: command.customerName,
              status: '등록됨'
            });
          } else {
            addMessage(`❌ 일정 등록 실패: ${result.error}`, false);
          }
        }
      }
      else if (command.action === 'message') {
        addMessage('카카오톡/문자 발송 기능은 준비 중입니다.', false);
      }
      else {
        // AI 대화
        const result = await chatWithAI(text);
        if (result.success) {
          addMessage(result.message, false);
        } else {
          addMessage('죄송해요, 오류가 발생했어요.', false);
        }
      }
    } catch (error) {
      addMessage(`오류가 발생했습니다: ${error.message}`, false);
    }

    setIsProcessing(false);
    setStatus('대기중');
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !isProcessing) {
      handleSend();
    }
  };

  return (
    <div className="agent-page">
      {/* 헤더 */}
      <div className="agent-header">
        <div className="agent-avatar">🧞</div>
        <div className="agent-info">
          <h1>AI 지니</h1>
          <p>실제 작동 • 전화/시트/캘린더</p>
        </div>
        <div className={`agent-status ${status === '듣는중' ? 'listening' : status === '처리중' ? 'processing' : ''}`}>
          {status}
        </div>
      </div>

      {/* 채팅 영역 */}
      <div className="chat-area" ref={chatAreaRef}>
        {messages.length === 0 ? (
          <div className="welcome-message">
            <div className="welcome-icon">🧞‍♂️</div>
            <h2>안녕하세요, 지니입니다!</h2>
            <p>실제로 전화를 걸고, 시트에 기록하고,<br/>캘린더에 일정을 등록합니다.</p>
            <div className="example-commands">
              <p>💡 이렇게 말해보세요:</p>
              <span>"홍길동 010-1234-5678에게 전화해줘"</span>
              <span>"김철수 고객 시트에 기록해줘"</span>
              <span>"박영희 고객 일정 잡아줘"</span>
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`message ${msg.isUser ? 'user' : 'bot'}`}>
              {!msg.isUser && <div className="msg-avatar">🧞</div>}
              <div className="msg-content">
                <div className="msg-bubble">{msg.text}</div>
                {msg.cardData && (
                  <div className={`action-card ${msg.cardData.type}`}>
                    <div className="card-icon">
                      {msg.cardData.type === 'call' && '📞'}
                      {msg.cardData.type === 'sheet' && '📊'}
                      {msg.cardData.type === 'calendar' && '📅'}
                    </div>
                    <div className="card-info">
                      <span className="card-title">{msg.cardData.name}</span>
                      <span className="card-status">{msg.cardData.status}</span>
                    </div>
                  </div>
                )}
                <div className="msg-time">{msg.time}</div>
              </div>
            </div>
          ))
        )}
        {isProcessing && (
          <div className="message bot">
            <div className="msg-avatar">🧞</div>
            <div className="typing-indicator">
              <span></span><span></span><span></span>
            </div>
          </div>
        )}
      </div>

      {/* 입력 영역 */}
      <div className="input-area">
        <div className="quick-buttons">
          <button onClick={() => setInputText('홍길동 010-1234-5678에게 전화해줘')}>📞 전화</button>
          <button onClick={() => setInputText('홍길동 고객 시트에 기록해줘')}>📊 기록</button>
          <button onClick={() => setInputText('홍길동 고객 일정 잡아줘')}>📅 일정</button>
        </div>
        <div className="input-row">
          <button 
            className={`voice-btn ${isListening ? 'active' : ''}`} 
            onClick={toggleVoice}
            disabled={isProcessing}
          >
            🎤
          </button>
          <input
            type="text"
            placeholder="지니야, 홍길동에게 전화해줘..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={isProcessing}
          />
          <button 
            className="send-btn" 
            onClick={() => handleSend()}
            disabled={isProcessing || !inputText.trim()}
          >
            ▶
          </button>
        </div>
      </div>
    </div>
  );
}

export default AgentPage;
