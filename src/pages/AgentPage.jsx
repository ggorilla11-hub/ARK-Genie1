import { useState, useRef, useEffect } from 'react';
import './AgentPage.css';

function AgentPage({ user }) {
  const [isActive, setIsActive] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [status, setStatus] = useState('대기중');
  const [logs, setLogs] = useState([]);
  const [messages, setMessages] = useState([]);
  const [textInput, setTextInput] = useState('');
  const [timeline, setTimeline] = useState([]);
  
  const wsRef = useRef(null);
  const audioContextRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const playbackContextRef = useRef(null);
  const messagesEndRef = useRef(null);
  const timelineRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (timelineRef.current) {
      timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
    }
  }, [timeline]);

  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLogs(prev => [...prev.slice(-50), { message, type, timestamp }]);
  };

  const addMessage = (text, isUser = false) => {
    const time = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    setMessages(prev => [...prev, { text, isUser, time }]);
  };

  const addTimeline = (text, icon = '📋', statusVal = 'pending') => {
    const id = Date.now();
    setTimeline(prev => [...prev, { id, text, icon, status: statusVal }]);
    return id;
  };

  const updateTimeline = (id, newStatus) => {
    setTimeline(prev => prev.map(item => 
      item.id === id ? { ...item, status: newStatus } : item
    ));
  };

  const startAgent = async () => {
    try {
      setStatus('마이크 연결 중...');
      addLog('에이전트 시작...', 'info');
      addTimeline('에이전트 초기화', '🚀', 'loading');

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { sampleRate: 24000, channelCount: 1, echoCancellation: true, noiseSuppression: true }
      });
      mediaStreamRef.current = stream;
      addLog('마이크 연결됨', 'success');

      setStatus('서버 연결 중...');
      const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;
      
      const ws = new WebSocket(
        'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01',
        ['realtime', `openai-insecure-api-key.${OPENAI_API_KEY}`, 'openai-beta.realtime-v1']
      );

      ws.onopen = () => {
        setIsConnected(true);
        setStatus('설정 중...');
        addLog('OpenAI 연결 성공', 'success');

        ws.send(JSON.stringify({
          type: 'session.update',
          session: {
            modalities: ['text', 'audio'],
            instructions: `당신은 ARK 지니입니다. ${user?.displayName || '보험설계사'}님을 돕는 AI 음성 에이전트입니다. 항상 한국어로 짧게 응답하세요.`,
            voice: 'shimmer',
            input_audio_format: 'pcm16',
            output_audio_format: 'pcm16',
            input_audio_transcription: { model: 'whisper-1' },
            turn_detection: {
              type: 'server_vad',
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 1500
            }
          }
        }));
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleServerEvent(data);
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        addLog('연결 오류', 'error');
        setStatus('오류 발생');
      };

      ws.onclose = () => {
        setIsConnected(false);
        setIsActive(false);
        setStatus('대기중');
        addLog('연결 종료됨', 'info');
      };

      wsRef.current = ws;
      setIsActive(true);

    } catch (error) {
      console.error('Start error:', error);
      addLog(`오류: ${error.message}`, 'error');
      setStatus('시작 실패');
    }
  };

  const stopAgent = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (playbackContextRef.current) {
      playbackContextRef.current.close();
      playbackContextRef.current = null;
    }
    setIsActive(false);
    setIsConnected(false);
    setIsListening(false);
    setIsSpeaking(false);
    setStatus('대기중');
    addLog('에이전트 종료', 'info');
  };

  const handleServerEvent = async (data) => {
    console.log('서버 이벤트:', data.type);
    
    switch (data.type) {
      case 'session.created':
        addLog('세션 생성됨', 'success');
        break;

      case 'session.updated':
        setStatus('준비완료');
        addLog('설정 완료!', 'success');
        addTimeline('음성 인식 준비 완료', '✅', 'done');
        startAudioCapture();
        break;

      case 'input_audio_buffer.speech_started':
        setIsListening(true);
        setIsSpeaking(false);
        setStatus('듣는중');
        addLog('음성 감지됨', 'info');
        break;

      case 'input_audio_buffer.speech_stopped':
        setIsListening(false);
        setStatus('처리중');
        addLog('음성 종료 - 처리 시작', 'info');
        break;

      case 'conversation.item.input_audio_transcription.completed':
        if (data.transcript) {
          addLog(`🗣️ "${data.transcript}"`, 'user');
          addMessage(data.transcript, true);
          addTimeline(`음성 인식: "${data.transcript.slice(0, 20)}..."`, '🎤', 'done');
        }
        break;

      case 'response.created':
        addLog('응답 생성 시작', 'info');
        addTimeline('AI 응답 생성 중...', '🧠', 'loading');
        break;

      case 'response.audio_transcript.delta':
        if (data.delta) {
          console.log('응답 텍스트:', data.delta);
        }
        break;

      case 'response.audio_transcript.done':
        if (data.transcript) {
          addLog(`🧞 "${data.transcript}"`, 'assistant');
          addMessage(data.transcript, false);
        }
        break;

      case 'response.audio.delta':
        setIsSpeaking(true);
        setStatus('말하는중');
        playAudio(data.delta);
        break;

      case 'response.audio.done':
        setTimeout(() => {
          setIsSpeaking(false);
          setStatus('준비완료');
        }, 500);
        break;

      case 'response.done':
        addLog('응답 완료', 'success');
        setTimeline(prev => prev.map(item => 
          item.status === 'loading' ? { ...item, status: 'done' } : item
        ));
        break;

      case 'error':
        const errorMsg = data.error?.message || '알 수 없는 오류';
        addLog(`❌ 오류: ${errorMsg}`, 'error');
        setStatus('오류 발생');
        addTimeline(`오류: ${errorMsg}`, '❌', 'error');
        break;

      default:
        console.log('기타 이벤트:', data.type);
    }
  };

  const startAudioCapture = async () => {
    try {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
      await audioContextRef.current.resume();
      
      const source = audioContextRef.current.createMediaStreamSource(mediaStreamRef.current);
      const processor = audioContextRef.current.createScriptProcessor(4096, 1, 1);
      
      processor.onaudioprocess = (e) => {
        if (wsRef.current?.readyState === WebSocket.OPEN && !isSpeaking) {
          const inputData = e.inputBuffer.getChannelData(0);
          const pcm16 = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            const s = Math.max(-1, Math.min(1, inputData[i]));
            pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
          }
          const base64 = btoa(String.fromCharCode(...new Uint8Array(pcm16.buffer)));
          wsRef.current.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: base64 }));
        }
      };
      
      source.connect(processor);
      processor.connect(audioContextRef.current.destination);
      addLog('오디오 캡처 시작', 'success');
      
    } catch (error) {
      console.error('Audio capture error:', error);
      addLog('오디오 캡처 실패', 'error');
    }
  };

  const playAudio = async (base64Audio) => {
    try {
      if (!playbackContextRef.current) {
        playbackContextRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
      }
      await playbackContextRef.current.resume();

      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      const pcm16 = new Int16Array(bytes.buffer);
      const float32 = new Float32Array(pcm16.length);
      for (let i = 0; i < pcm16.length; i++) {
        float32[i] = pcm16[i] / 0x8000;
      }

      const buffer = playbackContextRef.current.createBuffer(1, float32.length, 24000);
      buffer.getChannelData(0).set(float32);
      const source = playbackContextRef.current.createBufferSource();
      source.buffer = buffer;
      source.connect(playbackContextRef.current.destination);
      source.start();
      
    } catch (error) {
      console.error('Playback error:', error);
    }
  };

  const handleTextSubmit = () => {
    if (!textInput.trim()) return;
    
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      addMessage(textInput, true);
      addTimeline(`텍스트 전송: "${textInput.slice(0, 15)}..."`, '💬', 'done');
      
      wsRef.current.send(JSON.stringify({
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: textInput }]
        }
      }));
      wsRef.current.send(JSON.stringify({ type: 'response.create' }));
      setTextInput('');
    } else {
      addMessage(textInput, true);
      setTextInput('');
    }
  };

  useEffect(() => {
    return () => stopAgent();
  }, []);

  return (
    <div className="agent-page">
      {/* 1. 헤더 */}
      <div className="agent-header">
        <div className="header-avatar">
          <span className="header-avatar-fallback">🤖</span>
        </div>
        <div className="header-info">
          <span className="header-title">AI 지니</span>
          <span className="header-subtitle">음성 에이전트</span>
        </div>
        <button 
          className={`status-badge ${isActive ? (isListening ? 'listening' : isSpeaking ? 'speaking' : 'active') : ''}`}
          onClick={isActive ? stopAgent : startAgent}
        >
          {status}
        </button>
      </div>

      {/* 2. 실시간 대화 안내 */}
      <div className="agent-guide">
        <span>── 실시간 대화 ──</span>
        <p className="guide-main">"지니야"라고 불러보세요</p>
        <p className="guide-sub">또는 아래 버튼을 눌러 대화를 시작하세요</p>
      </div>

      {/* 3. 대화창 - 버튼 위에 위치! */}
      <div className="chat-container">
        {messages.length === 0 ? (
          <div className="chat-empty">
            <span className="chat-empty-icon">💬</span>
            <p>대화가 여기에 표시됩니다</p>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div key={idx} className={`chat-message ${msg.isUser ? 'user' : 'assistant'}`}>
              {!msg.isUser && <div className="message-avatar">🤖</div>}
              <div className="message-bubble">
                <p>{msg.text}</p>
                <span className="message-time">{msg.time}</span>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 4. 입력 영역 */}
      <div className="input-section">
        <div className="action-buttons">
          <button className="action-btn">
            <span>📷</span>
            <span>촬영</span>
          </button>
          <button className="action-btn">
            <span>📎</span>
            <span>파일</span>
          </button>
          <button className="action-btn">
            <span>🎤</span>
            <span>마이크</span>
          </button>
          <button className={`action-btn voice-btn ${isActive ? 'active' : ''}`} onClick={isActive ? stopAgent : startAgent}>
            <span>🎙️</span>
            <span>보이스</span>
          </button>
          <button className="action-btn record-btn">
            <span>🔴</span>
            <span>녹음</span>
          </button>
        </div>

        <div className="text-input-wrapper">
          <input
            type="text"
            placeholder="무엇을 도와드릴까요?"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleTextSubmit()}
          />
          <button className="send-btn" onClick={handleTextSubmit}>
            <span>▶</span>
          </button>
        </div>
      </div>

      {/* 5. 타임라인 - 맨 아래 */}
      <div className="timeline-section">
        <div className="timeline-header">
          <span>📋 지니 활동 타임라인</span>
        </div>
        <div className="timeline-content" ref={timelineRef}>
          {timeline.length === 0 ? (
            <div className="timeline-empty">활동 기록이 여기에 표시됩니다</div>
          ) : (
            timeline.map((item) => (
              <div key={item.id} className={`timeline-item ${item.status}`}>
                <span className="timeline-icon">{item.icon}</span>
                <span className="timeline-text">{item.text}</span>
                <span className="timeline-status">
                  {item.status === 'done' && '✓'}
                  {item.status === 'loading' && <span className="loading-dot">●</span>}
                  {item.status === 'error' && '✗'}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default AgentPage;
