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
  const [currentTranscript, setCurrentTranscript] = useState('');
  
  const chatAreaRef = useRef(null);
  const wsRef = useRef(null);
  const audioContextRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const processorRef = useRef(null);
  const callTimerRef = useRef(null);
  const audioQueueRef = useRef([]);
  const isPlayingRef = useRef(false);

  useEffect(() => {
    if (chatAreaRef.current) {
      chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight;
    }
  }, [messages]);

  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      stopVoiceMode();
      if (callTimerRef.current) clearInterval(callTimerRef.current);
    };
  }, []);

  const addMessage = (text, isUser) => {
    setMessages(prev => [...prev, {
      id: Date.now() + Math.random(),
      text,
      isUser,
      time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
    }]);
  };

  // Base64 오디오 재생
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
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
      }
      
      const audioData = atob(base64Audio);
      const arrayBuffer = new ArrayBuffer(audioData.length);
      const view = new Uint8Array(arrayBuffer);
      for (let i = 0; i < audioData.length; i++) {
        view[i] = audioData.charCodeAt(i);
      }
      
      // PCM16 to Float32
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
      console.error('오디오 재생 에러:', e);
      processAudioQueue();
    }
  };

  // WebSocket 연결 및 Realtime API 시작
  const startVoiceMode = async () => {
    try {
      setStatus('연결중...');
      setIsVoiceMode(true);
      
      // 마이크 권한 요청
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 24000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        } 
      });
      mediaStreamRef.current = stream;
      
      // WebSocket 연결
      const ws = new WebSocket(`${WS_SERVER}?mode=app`);
      wsRef.current = ws;
      
      ws.onopen = () => {
        console.log('✅ WebSocket 연결됨');
        ws.send(JSON.stringify({ type: 'start_app' }));
        setStatus('듣는중...');
        startAudioCapture(stream, ws);
      };
      
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          
          // 오디오 수신
          if (msg.type === 'audio' && msg.data) {
            playAudio(msg.data);
          }
          
          // 지니 응답 텍스트
          if (msg.type === 'transcript' && msg.role === 'assistant') {
            addMessage(msg.text, false);
            setCurrentTranscript('');
          }
          
          // 사용자 음성 텍스트
          if (msg.type === 'transcript' && msg.role === 'user') {
            addMessage(msg.text, true);
            setCurrentTranscript('');
            
            // 전화 명령 감지
            checkCallCommand(msg.text);
          }
          
          // AI 중단 (Barge-in)
          if (msg.type === 'interrupt') {
            audioQueueRef.current = [];
            isPlayingRef.current = false;
          }
          
        } catch (e) {
          console.error('메시지 파싱 에러:', e);
        }
      };
      
      ws.onerror = (error) => {
        console.error('❌ WebSocket 에러:', error);
        setStatus('연결 실패');
      };
      
      ws.onclose = () => {
        console.log('🔌 WebSocket 종료');
        if (isVoiceMode) {
          setStatus('대기중');
          setIsVoiceMode(false);
        }
      };
      
    } catch (error) {
      console.error('마이크 에러:', error);
      alert('마이크 권한이 필요합니다.');
      setIsVoiceMode(false);
      setStatus('대기중');
    }
  };

  // 마이크 오디오 캡처 및 전송
  const startAudioCapture = (stream, ws) => {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
    const source = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    
    processor.onaudioprocess = (e) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      
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
  };

  // 전화 명령 감지
  const checkCallCommand = (text) => {
    if (text.includes('전화') || text.includes('콜') || text.includes('통화')) {
      const phoneMatch = text.match(/\d{2,4}[-\s]?\d{3,4}[-\s]?\d{4}/);
      const namePatterns = [
        /([가-힣]{2,4})\s*(교수|선생|님|씨|고객|대표|사장|부장|과장|차장|팀장)?/,
        /([가-힣]{2,4})(에게|한테|께)/
      ];
      
      let name = '';
      for (const pattern of namePatterns) {
        const match = text.match(pattern);
        if (match && !['전화', '통화', '연결', '고객'].includes(match[1])) {
          name = match[1];
          break;
        }
      }
      
      const phone = phoneMatch ? phoneMatch[0] : '';
      
      if (phone) {
        setTimeout(() => {
          makeCall(name || '고객', phone);
        }, 2000);
      }
    }
  };

  // 보이스 모드 종료
  const stopVoiceMode = () => {
    // WebSocket 종료
    if (wsRef.current) {
      wsRef.current.send(JSON.stringify({ type: 'stop' }));
      wsRef.current.close();
      wsRef.current = null;
    }
    
    // 마이크 종료
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    
    // 오디오 프로세서 종료
    if (processorRef.current) {
      const { processor, source, audioContext } = processorRef.current;
      processor.disconnect();
      source.disconnect();
      audioContext.close();
      processorRef.current = null;
    }
    
    // 오디오 큐 초기화
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    
    setIsVoiceMode(false);
    setStatus('대기중');
    setCurrentTranscript('');
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
        addMessage(`❌ 연결 실패: ${data.error}`, false);
        setStatus('대기중');
      }
    } catch (error) {
      console.error('전화 에러:', error);
      addMessage('⏳ 잠시 후 다시 시도해주세요.', false);
      setStatus('대기중');
    }
  };

  // 전화 종료
  const endCall = () => {
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }
    
    const name = currentCall?.name || '고객';
    const duration = formatDuration(callDuration);
    
    setCurrentCall(null);
    setCallDuration(0);
    setStatus('대기중');
    
    addMessage(`📴 ${name}님 통화 종료 (${duration})`, false);
  };

  const formatDuration = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}분 ${s}초`;
  };

  // 텍스트 전송 (백업용)
  const handleSend = async () => {
    if (!inputText.trim()) return;
    const text = inputText;
    setInputText('');
    
    addMessage(text, true);
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
            <span>AI 지니와 대화중</span>
          </div>
          <button className="stop-voice-btn" onClick={stopVoiceMode}>종료</button>
        </div>
      )}

      <div className="chat-area" ref={chatAreaRef}>
        {messages.length === 0 ? (
          <div className="welcome-message">
            <div className="welcome-icon">🧞</div>
            <h2>안녕하세요, 지니입니다!</h2>
            <p>🎙️ 버튼 누르고 자유롭게 말씀하세요.</p>
            <p className="welcome-hint">말 끝나면 지니가 바로 응답해요</p>
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
        <button onClick={() => {
          if (!isVoiceMode) startVoiceMode();
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
