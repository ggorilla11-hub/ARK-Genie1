import { useState, useRef, useEffect } from 'react';
import './AIGeniePage.css';

function AIGeniePage({ user }) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [timeline, setTimeline] = useState([]);
  const messagesEndRef = useRef(null);
  const recognitionRef = useRef(null);

  const userName = user?.displayName?.split(' ')[0] || '팀장';

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.lang = 'ko-KR';
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;

      recognitionRef.current.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        handleUserMessage(transcript);
        setIsListening(false);
      };

      recognitionRef.current.onerror = () => setIsListening(false);
      recognitionRef.current.onend = () => setIsListening(false);
    }
  }, []);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      recognitionRef.current?.start();
      setIsListening(true);
    }
  };

  const handleUserMessage = async (text) => {
    if (!text.trim()) return;

    const userMsg = {
      type: 'user',
      text: text,
      time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
    };
    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsProcessing(true);

    setTimeout(() => {
      const response = generateResponse(text);
      const aiMsg = {
        type: 'ai',
        text: response.text,
        time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, aiMsg]);
      
      if (response.actions) {
        setTimeline(prev => [...prev, ...response.actions]);
      }
      
      setIsProcessing(false);
      
      if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(response.text);
        utterance.lang = 'ko-KR';
        utterance.rate = 1.1;
        window.speechSynthesis.speak(utterance);
      }
    }, 1000);
  };

  const generateResponse = (text) => {
    const lowerText = text.toLowerCase();
    
    if (lowerText.includes('지니') && (lowerText.includes('야') || lowerText.length < 10)) {
      return { text: `네 ${userName}님, 말씀하세요. 무엇을 도와드릴까요?`, actions: [] };
    }
    
    if ((lowerText.includes('전화') || lowerText.includes('연결')) && (lowerText.includes('고객') || lowerText.includes('님'))) {
      const customerName = extractCustomerName(text) || '홍길동';
      return {
        text: `네, ${customerName} 고객님께 전화 연결하겠습니다. 상담 예약 진행할게요.`,
        actions: [
          { icon: '🔍', text: `${customerName} 고객 정보 조회 완료`, status: 'done' },
          { icon: '📞', text: '010-1234-5678 전화 발신', status: 'done' },
          { icon: '📱', text: '통화 중... (1분 23초)', status: 'progress' },
          { icon: '📅', text: '캘린더 등록 대기', status: 'waiting' }
        ]
      };
    }
    
    if (lowerText.includes('일정') || lowerText.includes('캘린더') || lowerText.includes('스케줄')) {
      return {
        text: `오늘 일정을 확인해드릴게요. 오후 2시에 김철수 고객님 상담, 4시에 팀 미팅이 있습니다.`,
        actions: [{ icon: '📅', text: '구글 캘린더 조회 완료', status: 'done' }]
      };
    }
    
    if (lowerText.includes('리모델링') || lowerText.includes('제안')) {
      return {
        text: `네, 리모델링 제안도 함께 진행하겠습니다.`,
        actions: [{ icon: '📄', text: '보험 현황 분석 중', status: 'progress' }]
      };
    }
    
    return { text: `네 알겠습니다, ${userName}님. 처리하겠습니다.`, actions: [] };
  };

  const extractCustomerName = (text) => {
    const match = text.match(/([가-힣]{2,4})\s*(고객|님|씨|에게|한테)/);
    return match ? match[1] : null;
  };

  const handleSend = () => {
    if (inputText.trim()) handleUserMessage(inputText);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="aigenie-page-v2">
      <div className="genie-header">
        <div className="genie-avatar-small"><span>🤖</span></div>
        <div className="genie-info">
          <h1>AI 지니</h1>
          <p>음성 에이전트</p>
        </div>
        <div className="genie-status"><span className="status-badge">대기중</span></div>
      </div>

      <div className="chat-container">
        <div className="chat-label">— 실시간 대화 —</div>
        
        <div className="messages-area">
          {messages.length === 0 && (
            <div className="empty-state">
              <p>"지니야"라고 불러보세요</p>
              <p className="sub">또는 아래 버튼을 눌러 대화를 시작하세요</p>
            </div>
          )}
          
          {messages.map((msg, idx) => (
            <div key={idx} className={`message ${msg.type}`}>
              {msg.type === 'ai' && <div className="ai-avatar">🤖</div>}
              <div className="message-bubble">
                <p>{msg.text}</p>
                <span className="message-time">{msg.time}</span>
              </div>
            </div>
          ))}
          
          {isProcessing && (
            <div className="message ai">
              <div className="ai-avatar">🤖</div>
              <div className="message-bubble typing"><span></span><span></span><span></span></div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {timeline.length > 0 && (
          <div className="timeline-section">
            <h4>📋 지니 활동 타임라인</h4>
            <div className="timeline-list">
              {timeline.map((item, idx) => (
                <div key={idx} className={`timeline-item ${item.status}`}>
                  <span className="timeline-icon">{item.icon}</span>
                  <span className="timeline-text">{item.text}</span>
                  {item.status === 'done' && <span className="timeline-check">✓</span>}
                  {item.status === 'progress' && <span className="timeline-dot">●</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="input-area">
        <div className="input-row">
          <button className="input-btn">📷</button>
          <button className="input-btn">📎</button>
          <button className="input-btn">✏️</button>
          <button className={`input-btn record ${isListening ? 'active' : ''}`} onClick={toggleListening}>
            {isListening ? '⏹️' : '🔴'}
          </button>
          <button className="voice-btn" onClick={toggleListening}>
            <span>🎤</span>
            <span>{isListening ? '듣는 중...' : '보이스'}</span>
          </button>
        </div>
        
        <div className="text-input-row">
          <input
            type="text"
            placeholder="텍스트로 명령 입력..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyPress={handleKeyPress}
          />
          <button className="send-btn" onClick={handleSend}>▶</button>
        </div>
      </div>
    </div>
  );
}

export default AIGeniePage;
