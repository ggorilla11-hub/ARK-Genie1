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
  const chatAreaRef = useRef(null);
  const wsRef = useRef(null);
  const audioContextRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const processorRef = useRef(null);

  useEffect(() => {
    if (chatAreaRef.current) {
      chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight;
    }
  }, [messages]);

  const addMessage = (text, isUser) => {
    setMessages(prev => [...prev, {
      id: Date.now(),
      text,
      isUser,
      time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
    }]);
  };

  // 보이스 모드 시작 (OpenAI Realtime API 연결)
  const startVoiceMode = async () => {
    try {
      setStatus('연결중...');
      addMessage('🎙️ 음성 연결중...', false);

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
      const ws = new WebSocket(WS_SERVER);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket 연결됨');
        setStatus('듣는중...');
        setIsVoiceMode(true);
        addMessage('🎙️ 연결됨! "지니야"라고 불러주세요.', false);
        
        // 서버에 시작 알림
        ws.send(JSON.stringify({ type: 'start' }));

        // 오디오 처리 시작
        startAudioProcessing(stream, ws);
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        
        // 텍스트 응답 처리
        if (msg.type === 'transcript') {
          if (msg.role === 'user') {
            addMessage(msg.text, true);
          } else {
            addMessage(`🧞 ${msg.text}`, false);
          }
        }

        // 오디오 응답 재생
        if (msg.type === 'audio' && msg.data) {
          playAudio(msg.data);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket 에러:', error);
        setStatus('연결 실패');
        addMessage('❌ 연결 실패. 다시 시도해주세요.', false);
      };

      ws.onclose = () => {
        console.log('WebSocket 종료');
        setIsVoiceMode(false);
        setStatus('대기중');
      };

    } catch (error) {
      console.error('마이크 에러:', error);
      setStatus('대기중');
      addMessage('❌ 마이크 권한이 필요합니다.', false);
    }
  };

  // 오디오 처리 (마이크 → 서버)
  const startAudioProcessing = (stream, ws) => {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)({
      sampleRate: 24000
    });
    audioContextRef.current = audioContext;

    const source = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    processorRef.current = processor;

    processor.onaudioprocess = (e) => {
      if (ws.readyState === WebSocket.OPEN) {
        const inputData = e.inputBuffer.getChannelData(0);
        
        // Float32 → PCM16 변환
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          pcm16[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
        }
        
        // Base64 인코딩
        const base64 = btoa(String.fromCharCode(...new Uint8Array(pcm16.buffer)));
        
        ws.send(JSON.stringify({
          type: 'audio',
          data: base64
        }));
      }
    };

    source.connect(processor);
    processor.connect(audioContext.destination);
  };

  // 오디오 재생 (서버 → 스피커)
  const playAudio = async (base64Data) => {
    try {
      const audioContext = audioContextRef.current || new (window.AudioContext || window.webkitAudioContext)();
      
      // Base64 → ArrayBuffer
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      // PCM16 → Float32
      const pcm16 = new Int16Array(bytes.buffer);
      const float32 = new Float32Array(pcm16.length);
      for (let i = 0; i < pcm16.length; i++) {
        float32[i] = pcm16[i] / 32768;
      }

      // AudioBuffer 생성 및 재생
      const audioBuffer = audioContext.createBuffer(1, float32.length, 24000);
      audioBuffer.getChannelData(0).set(float32);
      
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      source.start();
    } catch (error) {
      console.error('오디오 재생 에러:', error);
    }
  };

  // 보이스 모드 종료
  const stopVoiceMode = () => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
    }
    
    setIsVoiceMode(false);
    setStatus('대기중');
    addMessage('🔇 보이스 모드 종료', false);
  };

  // 전화 걸기
  const makeCall = async (name, phone) => {
    setStatus('전화 연결중...');
    addMessage(`📞 ${name}님께 전화 연결중...`, false);

    try {
      const formattedPhone = phone.replace(/[-\s]/g, '');
      const fullPhone = formattedPhone.startsWith('0') ? '+82' + formattedPhone.slice(1) : formattedPhone;
      
      const response = await fetch(`${RENDER_SERVER}/make-call?to=${fullPhone}`);
      const data = await response.json();
      
      if (data.success) {
        setCurrentCall({ name, phone });
        addMessage(`✅ ${name}님과 통화중`, false);
        setStatus('통화중');
      } else {
        addMessage(`❌ 연결 실패: ${data.error}`, false);
        setStatus('대기중');
      }
    } catch (error) {
      addMessage('⏳ 서버 준비중... 잠시 후 다시 시도해주세요.', false);
      setStatus('대기중');
    }
  };

  // 전화 종료
  const endCall = () => {
    if (currentCall) {
      addMessage(`📴 ${currentCall.name}님과의 통화 종료`, false);
      setCurrentCall(null);
      setStatus('대기중');
    }
  };

  // 텍스트 명령 처리
  const handleSend = async () => {
    if (!inputText.trim()) return;
    
    const text = inputText;
    setInputText('');
    addMessage(text, true);

    // 지니야 호출
    const isGenie = text.includes('지니');
    if (isGenie && text.length < 10) {
      addMessage('🧞 네, 대표님! 무엇을 도와드릴까요?', false);
      speakLocal('네, 대표님! 무엇을 도와드릴까요?');
      return;
    }

    // 전화 명령
    const phoneMatch = text.match(/(\d{2,3}[-\s]?\d{3,4}[-\s]?\d{4})/);
    if (text.includes('전화') && phoneMatch) {
      const nameMatch = text.match(/([가-힣]{2,4})/);
      const name = nameMatch ? nameMatch[1] : '고객';
      makeCall(name, phoneMatch[0]);
      return;
    }

    addMessage('🧞 네, 대표님. 확인했습니다.', false);
    speakLocal('네, 대표님. 확인했습니다.');
  };

  // 로컬 TTS (텍스트 입력용)
  const speakLocal = (text) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ko-KR';
    utterance.rate = 1.0;
    utterance.pitch = 1.2;
    window.speechSynthesis.speak(utterance);
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
            <span>"지니야" 라고 불러주세요</span>
          </div>
          <button className="stop-voice-btn" onClick={stopVoiceMode}>종료</button>
        </div>
      )}

      <div className="chat-area" ref={chatAreaRef}>
        {messages.length === 0 ? (
          <div className="welcome-message">
            <div className="welcome-icon">🧞</div>
            <h2>안녕하세요, 지니입니다!</h2>
            <p>🎙️ 버튼을 누르고 "지니야"라고 불러주세요.</p>
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
          addMessage('🧞 네, 대표님! 무엇을 도와드릴까요?', false);
          speakLocal('네, 대표님! 무엇을 도와드릴까요?');
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
