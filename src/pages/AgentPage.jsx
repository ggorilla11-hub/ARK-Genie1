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
  const isProcessingRef = useRef(false);
  const callTimerRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const lastTranscriptRef = useRef('');

  useEffect(() => {
    if (chatAreaRef.current) {
      chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight;
    }
  }, [messages]);

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

  // 지니 음성 응답
  const speakGenie = (text, isQuickResponse = false) => {
    return new Promise((resolve) => {
      isSpeakingRef.current = true;
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch(e) {}
      }
      
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ko-KR';
      utterance.rate = 0.95;
      utterance.pitch = 0.9;
      utterance.volume = 1.0;
      
      const voices = window.speechSynthesis.getVoices();
      const koreanVoice = voices.find(v => v.lang.includes('ko')) || voices[0];
      if (koreanVoice) utterance.voice = koreanVoice;
      
      utterance.onend = () => {
        isSpeakingRef.current = false;
        isProcessingRef.current = false;
        const delay = isQuickResponse ? 300 : 1000;
        setTimeout(() => {
          if (voiceModeRef.current && !isSpeakingRef.current && !isProcessingRef.current) {
            startRecognition();
          }
          resolve();
        }, delay);
      };
      utterance.onerror = () => {
        isSpeakingRef.current = false;
        isProcessingRef.current = false;
        setTimeout(() => {
          if (voiceModeRef.current && !isSpeakingRef.current && !isProcessingRef.current) {
            startRecognition();
          }
          resolve();
        }, 500);
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
    if (isSpeakingRef.current || isProcessingRef.current) {
      setTimeout(() => {
        if (voiceModeRef.current && !isSpeakingRef.current && !isProcessingRef.current) {
          startRecognition();
        }
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
    recognition.continuous = true;  // 계속 듣기
    recognition.interimResults = true;

    recognition.onstart = () => {
      setStatus('듣는중...');
      lastTranscriptRef.current = '';
      setCurrentTranscript('');
    };

    recognition.onresult = (event) => {
      if (isSpeakingRef.current || isProcessingRef.current) return;
      
      let currentText = '';
      
      for (let i = 0; i < event.results.length; i++) {
        currentText += event.results[i][0].transcript;
      }
      
      setCurrentTranscript(currentText);
      lastTranscriptRef.current = currentText;
      
      // 무음 타이머 리셋
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
      
      // 2초 무음 후 처리
      silenceTimerRef.current = setTimeout(() => {
        const finalText = lastTranscriptRef.current.trim();
        if (finalText && voiceModeRef.current && !isSpeakingRef.current && !isProcessingRef.current) {
          lastTranscriptRef.current = '';
          setCurrentTranscript('');
          processUserMessage(finalText);
        }
      }, 2000);
    };

    recognition.onerror = (event) => {
      console.log('음성 인식 에러:', event.error);
      if (voiceModeRef.current && !isSpeakingRef.current && !isProcessingRef.current && event.error !== 'aborted') {
        setTimeout(() => {
          if (voiceModeRef.current && !isSpeakingRef.current && !isProcessingRef.current) {
            startRecognition();
          }
        }, 500);
      }
    };

    recognition.onend = () => {
      if (voiceModeRef.current && !isSpeakingRef.current && !isProcessingRef.current) {
        setTimeout(() => {
          if (voiceModeRef.current && !isSpeakingRef.current && !isProcessingRef.current) {
            startRecognition();
          }
        }, 300);
      } else if (!voiceModeRef.current) {
        setStatus('대기중');
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  // 사용자 메시지 처리
  const processUserMessage = async (text) => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch(e) {}
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
    }
    
    addMessage(text, true);
    setStatus('생각중...');
    
    // "지니야" 호출 감지
    const isGenieCall = /지니|진희|진이|지은|지연/.test(text);
    const cleanText = text.replace(/지니야?|진희야?|진이야?|지은아?|지연아?/g, '').trim();
    
    if (isGenieCall && cleanText.length < 5) {
      addMessage('네, 대표님!', false);
      await speakGenie('네, 대표님!', true);
      return;
    }
    
    const commandText = cleanText.length >= 5 ? cleanText : text;
    
    // 전화 요청 감지
    if (commandText.includes('전화') || commandText.includes('콜') || commandText.includes('통화')) {
      const phoneMatch = commandText.match(/\d{2,4}[-\s]?\d{3,4}[-\s]?\d{4}/);
      const namePatterns = [
        /([가-힣]{2,4})\s*(교수|선생|님|씨|고객|대표|사장|부장|과장|차장|팀장)?/,
        /([가-힣]{2,4})(에게|한테|께)/
      ];
      
      let name = '';
      for (const pattern of namePatterns) {
        const match = commandText.match(pattern);
        if (match && !['전화', '통화', '연결'].includes(match[1])) {
          name = match[1];
          break;
        }
      }
      
      const phone = phoneMatch ? phoneMatch[0] : '';
      
      if (phone && name) {
        const confirmMsg = `네, ${name}님께 전화합니다.`;
        addMessage(confirmMsg, false);
        await speakGenie(confirmMsg);
        await makeCall(name, phone);
        return;
      } else if (name) {
        const askPhone = `${name}님 전화번호요?`;
        addMessage(askPhone, false);
        await speakGenie(askPhone, true);
        return;
      } else if (phone) {
        addMessage('네, 전화합니다.', false);
        await speakGenie('네, 전화합니다.');
        await makeCall('고객', phone);
        return;
      } else {
        addMessage('누구에게 전화할까요?', false);
        await speakGenie('누구에게 전화할까요?', true);
        return;
      }
    }
    
    // 일반 대화
    const reply = await askGenie(commandText);
    addMessage(reply, false);
    await speakGenie(reply);
  };

  // 보이스 모드 시작
  const startVoiceMode = () => {
    voiceModeRef.current = true;
    isSpeakingRef.current = false;
    isProcessingRef.current = false;
    lastTranscriptRef.current = '';
    setCurrentTranscript('');
    setIsVoiceMode(true);
    setStatus('듣는중...');
    startRecognition();
  };

  // 보이스 모드 종료
  const stopVoiceMode = () => {
    voiceModeRef.current = false;
    isSpeakingRef.current = false;
    isProcessingRef.current = false;
    lastTranscriptRef.current = '';
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

  // 전화 걸기
  const makeCall = async (name, phone) => {
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
        
        callTimerRef.current = setInterval(() => {
          setCallDuration(prev => prev + 1);
        }, 1000);
        
        addMessage(`📞 ${name}님 통화 연결됨`, false);
      } else {
        addMessage(`❌ 연결 실패`, false);
        await speakGenie('연결 실패했습니다.', true);
        setStatus('대기중');
      }
    } catch (error) {
      console.error('전화 에러:', error);
      addMessage('⏳ 잠시 후 다시 시도해주세요.', false);
      await speakGenie('잠시 후 다시요.', true);
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
    
    addMessage(`📴 통화 종료 (${duration})`, false);
    await speakGenie('통화 종료했습니다.', true);
  };

  const formatDuration = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}분 ${s}초`;
  };

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

      {currentCall && (
        <div className="call-banner">
          <div className="call-info">
            <span className="call-icon">📞</span>
            <span>{currentCall.name}님 통화중</span>
            <span className="call-duration">{formatDuration(callDuration)}</span>
          </div>
          <button className="end-call-btn" onClick={endCall}>종료</button>
        </div>
      )}

      {isVoiceMode && !currentCall && (
        <div className="voice-banner">
          <div className="voice-info">
            <span className="voice-icon">🎙️</span>
            <span>듣고 있어요</span>
          </div>
          <button className="stop-voice-btn" onClick={stopVoiceMode}>종료</button>
        </div>
      )}

      {isVoiceMode && currentTranscript && (
        <div className="transcript-banner">
          🎤 {currentTranscript}
        </div>
      )}

      <div className="chat-area" ref={chatAreaRef}>
        {messages.length === 0 ? (
          <div className="welcome-message">
            <div className="welcome-icon">🧞</div>
            <h2>안녕하세요, 지니입니다!</h2>
            <p>🎙️ 버튼 누르고 "지니야" 불러주세요.</p>
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
          addMessage('지니야', true);
          addMessage('네, 대표님!', false);
          await speakGenie('네, 대표님!', true);
        }}>🧞 지니야</button>
        <button disabled={!currentCall} onClick={endCall}>📴 통화종료</button>
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
