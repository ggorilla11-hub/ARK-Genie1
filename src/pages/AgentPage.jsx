import React, { useState, useRef, useEffect } from 'react';
import './AgentPage.css';

const RENDER_SERVER = 'https://ark-genie-server.onrender.com';

function AgentPage() {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [status, setStatus] = useState('대기중');
  const [currentCall, setCurrentCall] = useState(null);
  const chatAreaRef = useRef(null);
  const recognitionRef = useRef(null);
  const voiceModeRef = useRef(false);

  useEffect(() => {
    if (chatAreaRef.current) {
      chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight;
    }
  }, [messages]);

  const addMessage = (text, isUser) => {
    setMessages(prev => [...prev, {
      id: Date.now() + Math.random(),
      text,
      isUser,
      time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
    }]);
  };

  // 지니 음성 응답
  const speakGenie = (text) => {
    return new Promise((resolve) => {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ko-KR';
      utterance.rate = 1.0;
      utterance.pitch = 1.2;
      utterance.volume = 1.0;
      
      const voices = window.speechSynthesis.getVoices();
      const koreanVoice = voices.find(v => v.lang.includes('ko'));
      if (koreanVoice) utterance.voice = koreanVoice;
      
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      
      window.speechSynthesis.speak(utterance);
    });
  };

  // GPT-4o 대화
  const askGenie = async (userMessage) => {
    try {
      const response = await fetch(`${RENDER_SERVER}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage })
      });
      const data = await response.json();
      return data.reply || '죄송합니다, 다시 말씀해주세요.';
    } catch (error) {
      console.error('GPT 에러:', error);
      return '네, 대표님! 잠시 연결이 불안정합니다.';
    }
  };

  // 음성 인식 시작 (계속 켜져있음)
  const startRecognition = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('음성 인식을 지원하지 않는 브라우저입니다.');
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.lang = 'ko-KR';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = async (event) => {
      const transcript = event.results[0][0].transcript.trim();
      
      if (transcript) {
        console.log('인식됨:', transcript);
        addMessage(`🗣️ ${transcript}`, true);
        
        setStatus('생각중...');
        const reply = await askGenie(transcript);
        
        addMessage(`🧞 ${reply}`, false);
        await speakGenie(reply);
        
        // 음성 응답 후 다시 듣기 시작
        if (voiceModeRef.current) {
          setStatus('듣는중...');
          setTimeout(() => {
            if (voiceModeRef.current) {
              startRecognition();
            }
          }, 300);
        }
      }
    };

    recognition.onerror = (event) => {
      console.log('음성 인식 에러:', event.error);
      // 에러 나도 보이스 모드면 다시 시작
      if (voiceModeRef.current && event.error !== 'aborted') {
        setTimeout(() => {
          if (voiceModeRef.current) {
            startRecognition();
          }
        }, 500);
      }
    };

    recognition.onend = () => {
      console.log('음성 인식 종료');
      // 보이스 모드면 다시 시작
      if (voiceModeRef.current) {
        setTimeout(() => {
          if (voiceModeRef.current) {
            setStatus('듣는중...');
            startRecognition();
          }
        }, 300);
      } else {
        setStatus('대기중');
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  // 보이스 모드 시작
  const startVoiceMode = async () => {
    voiceModeRef.current = true;
    setIsVoiceMode(true);
    setStatus('듣는중...');
    addMessage('🎙️ 보이스 모드 시작 - 말씀하세요!', false);
    
    startRecognition();
  };

  // 보이스 모드 종료
  const stopVoiceMode = () => {
    voiceModeRef.current = false;
    setIsVoiceMode(false);
    setStatus('대기중');
    
    if (recognitionRef.current) {
      recognitionRef.current.abort();
    }
    window.speechSynthesis.cancel();
    addMessage('🔇 보이스 모드 종료', false);
  };

  // 전화 걸기
  const makeCall = async (name, phone) => {
    setStatus('전화 연결중...');
    addMessage(`📞 ${name}님께 전화 연결중...`, false);
    await speakGenie(`${name}님께 전화를 연결합니다.`);
    
    try {
      const formattedPhone = phone.replace(/[-\s]/g, '');
      const fullPhone = formattedPhone.startsWith('0') ? '+82' + formattedPhone.slice(1) : formattedPhone;
      const response = await fetch(`${RENDER_SERVER}/make-call?to=${fullPhone}`);
      const data = await response.json();
      
      if (data.success) {
        setCurrentCall({ name, phone });
        addMessage(`✅ ${name}님과 통화중`, false);
        setStatus('통화중');
        await speakGenie(`${name}님과 연결되었습니다.`);
      } else {
        addMessage(`❌ 연결 실패: ${data.error}`, false);
        setStatus('대기중');
      }
    } catch (error) {
      addMessage('⏳ 서버 준비중...', false);
      setStatus('대기중');
    }
  };

  // 전화 종료
  const endCall = () => {
    if (currentCall) {
      addMessage(`📴 ${currentCall.name}님과의 통화 종료`, false);
      speakGenie('통화가 종료되었습니다.');
      setCurrentCall(null);
      setStatus('대기중');
    }
  };

  // 텍스트 전송
  const handleSend = async () => {
    if (!inputText.trim()) return;
    const text = inputText;
    setInputText('');
    addMessage(`🗣️ ${text}`, true);

    setStatus('생각중...');
    const reply = await askGenie(text);
    addMessage(`🧞 ${reply}`, false);
    setStatus('대기중');
    await speakGenie(reply);
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
        <div className={`status-badge ${isVoiceMode ? 'voice-mode' : currentCall ? 'oncall' : ''}`}>
          {status}
        </div>
      </header>

      {currentCall && (
        <div className="call-banner">
          <div className="call-info">
            <span className="call-icon">📞</span>
            <span>{currentCall.name}님과 통화중</span>
          </div>
          <button className="end-call-btn" onClick={endCall}>종료</button>
        </div>
      )}

      {isVoiceMode && !currentCall && (
        <div className="voice-banner">
          <div className="voice-info">
            <span className="voice-icon">🎙️</span>
            <span>듣고 있어요 - 말씀하세요</span>
          </div>
          <button className="stop-voice-btn" onClick={stopVoiceMode}>종료</button>
        </div>
      )}

      <div className="chat-area" ref={chatAreaRef}>
        {messages.length === 0 ? (
          <div className="welcome-message">
            <div className="welcome-icon">🧞</div>
            <h2>안녕하세요, 지니입니다!</h2>
            <p>🎙️ 버튼을 누르고 말씀해주세요.</p>
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

      <div className="quick-actions">
        <button onClick={async () => {
          addMessage('🧞 네, 대표님! 무엇을 도와드릴까요?', false);
          await speakGenie('네, 대표님! 무엇을 도와드릴까요?');
        }}>🧞 지니야</button>
        <button disabled={!currentCall} onClick={endCall}>📴 종료</button>
      </div>

      <div className="input-area">
        <button 
          className={`voice-btn ${isVoiceMode ? 'active' : ''}`}
          onClick={isVoiceMode ? stopVoiceMode : startVoiceMode}
        >
          {isVoiceMode ? '🔴' : '🎙️'}
        </button>
        <input
          type="text"
          placeholder="지니야..."
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
