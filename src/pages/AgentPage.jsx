import React, { useState, useRef, useEffect } from 'react';
import './AgentPage.css';

const RENDER_SERVER = 'https://ark-genie-server.onrender.com';
const WS_SERVER = 'wss://ark-genie-server.onrender.com';

function AgentPage() {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [status, setStatus] = useState('대기중');
  const [currentCall, setCurrentCall] = useState(null);
  const [callDuration, setCallDuration] = useState(0);
  const [showCallPopup, setShowCallPopup] = useState(false);
  const [callTranscript, setCallTranscript] = useState([]);
  
  const chatAreaRef = useRef(null);
  const wsRef = useRef(null);
  const audioContextRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const processorRef = useRef(null);
  const callTimerRef = useRef(null);
  const audioQueueRef = useRef([]);
  const isPlayingRef = useRef(false);
  const isConnectedRef = useRef(false);
  const userMessageQueueRef = useRef([]);
  const assistantMessageQueueRef = useRef([]);

  useEffect(() => {
    if (chatAreaRef.current) {
      chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    return () => {
      cleanupVoiceMode();
      if (callTimerRef.current) clearInterval(callTimerRef.current);
    };
  }, []);

  const addMessage = (text, isUser) => {
    setMessages(prev => {
      // 중복 체크
      const lastMsg = prev[prev.length - 1];
      if (lastMsg && lastMsg.text === text && lastMsg.isUser === isUser) {
        return prev;
      }
      return [...prev, {
        id: Date.now() + Math.random(),
        text,
        isUser,
        time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
      }];
    });
  };

  // 순서 보장 메시지 추가
  const addOrderedMessage = (text, isUser) => {
    if (isUser) {
      userMessageQueueRef.current.push(text);
      // 사용자 메시지는 즉시 추가
      addMessage(text, true);
    } else {
      // 지니 메시지는 사용자 메시지 후에 추가
      setTimeout(() => {
        addMessage(text, false);
      }, 100);
    }
  };

  const playBeep = (type = 'start') => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      oscillator.frequency.value = type === 'start' ? 880 : 440;
      gainNode.gain.value = 0.2;
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.15);
    } catch (e) {}
  };

  const playAudio = async (base64Audio) => {
    audioQueueRef.current.push(base64Audio);
    if (!isPlayingRef.current) {
      processAudioQueue();
    }
  };

  const processAudioQueue = async () => {
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      return;
    }
    
    isPlayingRef.current = true;
    const base64Audio = audioQueueRef.current.shift();
    
    try {
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
      }
      
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      
      const audioData = atob(base64Audio);
      const arrayBuffer = new ArrayBuffer(audioData.length);
      const view = new Uint8Array(arrayBuffer);
      for (let i = 0; i < audioData.length; i++) {
        view[i] = audioData.charCodeAt(i);
      }
      
      const pcm16 = new Int16Array(arrayBuffer);
      const float32 = new Float32Array(pcm16.length);
      for (let i = 0; i < pcm16.length; i++) {
        float32[i] = pcm16[i] / 32768;
      }
      
      const audioBuffer = audioContextRef.current.createBuffer(1, float32.length, 24000);
      audioBuffer.getChannelData(0).set(float32);
      
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current.destination);
      source.onended = () => processAudioQueue();
      source.start();
    } catch (e) {
      processAudioQueue();
    }
  };

  const cleanupVoiceMode = () => {
    if (wsRef.current) {
      try {
        wsRef.current.send(JSON.stringify({ type: 'stop' }));
        wsRef.current.close();
      } catch (e) {}
      wsRef.current = null;
    }
    
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    
    if (processorRef.current) {
      try {
        const { processor, source, audioContext } = processorRef.current;
        processor.disconnect();
        source.disconnect();
        audioContext.close();
      } catch (e) {}
      processorRef.current = null;
    }
    
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    isConnectedRef.current = false;
  };

  // 전화번호 감지 (전화번호 + 아무 글자)
  const checkCallCommand = (text) => {
    const phoneMatch = text.match(/\d{2,4}[-\s]?\d{3,4}[-\s]?\d{4}/);
    
    if (!phoneMatch) return null;
    
    const phone = phoneMatch[0];
    const textWithoutPhone = text.replace(phone, '').trim();
    
    // 전화번호만 있으면 무시 (최소 1글자 이상 있어야 함)
    if (textWithoutPhone.length < 1) return null;
    
    // 이름 추출
    let name = '고객';
    const nameMatch = text.match(/([가-힣]{2,4})/g);
    if (nameMatch) {
      const excludeWords = ['전화', '통화', '연결', '해줘', '해주세요', '부탁', '입니다', '에게', '한테', '번호', '연락', '고객'];
      for (const n of nameMatch) {
        if (!excludeWords.includes(n)) {
          name = n;
          break;
        }
      }
    }
    
    return { name, phone };
  };

  const startVoiceMode = async () => {
    if (isConnectedRef.current) return;
    
    try {
      setStatus('연결중...');
      setIsVoiceMode(true);
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { sampleRate: 24000, channelCount: 1, echoCancellation: true, noiseSuppression: true } 
      });
      mediaStreamRef.current = stream;
      
      const ws = new WebSocket(`${WS_SERVER}?mode=app`);
      wsRef.current = ws;
      
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'start_app' }));
      };
      
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          
          if (msg.type === 'session_started') {
            isConnectedRef.current = true;
            setStatus('듣는중...');
            playBeep('start');
            startAudioCapture(stream, ws);
          }
          
          if (msg.type === 'audio' && msg.data) {
            playAudio(msg.data);
          }
          
          // 사용자 메시지 (먼저)
          if (msg.type === 'transcript' && msg.role === 'user') {
            addOrderedMessage(msg.text, true);
            
            // 전화 명령 감지
            const callInfo = checkCallCommand(msg.text);
            if (callInfo) {
              setTimeout(() => {
                makeCall(callInfo.name, callInfo.phone);
              }, 2000);
            }
          }
          
          // 지니 메시지 (나중)
          if (msg.type === 'transcript' && msg.role === 'assistant') {
            addOrderedMessage(msg.text, false);
          }
          
          if (msg.type === 'interrupt') {
            audioQueueRef.current = [];
            isPlayingRef.current = false;
          }
        } catch (e) {}
      };
      
      ws.onerror = () => {
        setStatus('연결 실패');
        cleanupVoiceMode();
        setIsVoiceMode(false);
      };
      
      ws.onclose = () => {
        isConnectedRef.current = false;
        setStatus('대기중');
        setIsVoiceMode(false);
      };
      
    } catch (error) {
      alert('마이크 권한이 필요합니다.');
      cleanupVoiceMode();
      setIsVoiceMode(false);
      setStatus('대기중');
    }
  };

  const startAudioCapture = (stream, ws) => {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      
      processor.onaudioprocess = (e) => {
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        
        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          pcm16[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
        }
        
        const base64 = btoa(String.fromCharCode(...new Uint8Array(pcm16.buffer)));
        ws.send(JSON.stringify({ type: 'audio', data: base64 }));
      };
      
      source.connect(processor);
      processor.connect(audioContext.destination);
      processorRef.current = { processor, source, audioContext };
    } catch (e) {}
  };

  const stopVoiceMode = () => {
    playBeep('stop');
    cleanupVoiceMode();
    setIsVoiceMode(false);
    setStatus('대기중');
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
        setShowCallPopup(true);
        setCallTranscript([]);
        
        callTimerRef.current = setInterval(() => {
          setCallDuration(prev => prev + 1);
        }, 1000);
        
        addMessage(`📞 ${name}님 통화 연결됨`, false);
        
        // 통화 상태 폴링 (자동 종료 감지)
        pollCallStatus(data.callSid);
      } else {
        addMessage(`❌ 연결 실패: ${data.error}`, false);
        setStatus('대기중');
      }
    } catch (error) {
      addMessage('⏳ 잠시 후 다시 시도해주세요.', false);
      setStatus('대기중');
    }
  };

  // 통화 상태 폴링 (자동 종료)
  const pollCallStatus = (callSid) => {
    const checkStatus = async () => {
      try {
        const response = await fetch(`${RENDER_SERVER}/api/call-status/${callSid}`);
        const data = await response.json();
        
        if (data.status === 'completed' || data.status === 'failed' || data.status === 'busy' || data.status === 'no-answer') {
          endCall(true);
        } else if (currentCall) {
          setTimeout(checkStatus, 3000);
        }
      } catch (e) {
        setTimeout(checkStatus, 5000);
      }
    };
    
    setTimeout(checkStatus, 5000);
  };

  // 전화 종료
  const endCall = (auto = false) => {
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }
    
    const name = currentCall?.name || '고객';
    const duration = formatDuration(callDuration);
    
    setCurrentCall(null);
    setCallDuration(0);
    setStatus('대기중');
    setShowCallPopup(false);
    setCallTranscript([]);
    setIsVoiceMode(false);
    
    cleanupVoiceMode();
    
    addMessage(`📴 ${name}님 통화 종료 (${duration})${auto ? ' - 자동' : ''}`, false);
  };

  const formatDuration = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handleSend = async () => {
    if (!inputText.trim()) return;
    const text = inputText;
    setInputText('');
    
    addMessage(text, true);
    
    const callInfo = checkCallCommand(text);
    if (callInfo) {
      addMessage(`네, ${callInfo.name}님께 전화합니다.`, false);
      await makeCall(callInfo.name, callInfo.phone);
      return;
    }
    
    setStatus('생각중...');
    
    try {
      const response = await fetch(`${RENDER_SERVER}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      });
      const data = await response.json();
      addMessage(data.reply, false);
    } catch (error) {
      addMessage('네, 대표님!', false);
    }
    
    setStatus('대기중');
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

      {isVoiceMode && !currentCall && (
        <div className="voice-banner">
          <div className="voice-info">
            <span className="voice-icon">🎙️</span>
            <span>AI 지니와 대화중</span>
          </div>
          <button className="stop-voice-btn" onClick={stopVoiceMode}>종료</button>
        </div>
      )}

      {/* 통화 팝업 UI */}
      {showCallPopup && currentCall && (
        <div className="call-popup-overlay">
          <div className="call-popup">
            <div className="call-popup-header">
              <h3>📞 통화중</h3>
            </div>
            <div className="call-popup-body">
              <div className="call-avatar">👤</div>
              <div className="call-name">{currentCall.name}</div>
              <div className="call-number">{currentCall.phone}</div>
              <div className="call-timer">{formatDuration(callDuration)}</div>
              <div className="call-status-text">통화중...</div>
            </div>
            <div className="call-popup-actions">
              <button className="call-end-btn" onClick={() => endCall(false)}>
                📴 통화 종료
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="chat-area" ref={chatAreaRef}>
        {messages.length === 0 ? (
          <div className="welcome-message">
            <div className="welcome-icon">🧞</div>
            <h2>안녕하세요, 지니입니다!</h2>
            <p>🎙️ 버튼 누르고 자유롭게 말씀하세요.</p>
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
        <button onClick={() => { if (!isVoiceMode) startVoiceMode(); }}>🧞 지니야</button>
        <button disabled={!currentCall} onClick={() => endCall(false)}>📴 통화종료</button>
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
          placeholder="텍스트로 입력..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSend()}
          disabled={isVoiceMode}
        />
        <button className="send-btn" onClick={handleSend} disabled={isVoiceMode}>➤</button>
      </div>
    </div>
  );
}

export default AgentPage;
