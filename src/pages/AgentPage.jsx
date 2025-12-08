import { useState, useRef, useEffect } from 'react';
import './AgentPage.css';

function AgentPage({ user }) {
  const [isActive, setIsActive] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [status, setStatus] = useState('대기 중');
  const [logs, setLogs] = useState([]);
  
  const wsRef = useRef(null);
  const audioContextRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const playbackContextRef = useRef(null);

  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLogs(prev => [...prev.slice(-30), { message, type, timestamp }]);
  };

  const startAgent = async () => {
    try {
      setStatus('마이크 연결 중...');
      addLog('에이전트 시작...', 'info');

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
            instructions: `당신은 ARK 지니입니다. ${user?.displayName || '보험설계사'}님을 돕는 AI 음성 에이전트입니다.

핵심 역할:
- 보험설계사의 음성 명령을 듣고 업무 자동화 실행
- 고객 전화 걸기, 문자/카톡 보내기, 일정 등록
- 친절하고 전문적인 한국어 대화

응답 규칙:
- 짧고 명확하게 (1-2문장)
- 명령 확인 후 실행
- "네, 알겠습니다" 식의 자연스러운 응답

예시 명령:
- "김철수 고객에게 전화해줘" → 전화 기능 실행
- "내일 3시 상담 예약" → 캘린더 등록
- "이번 주 일정 알려줘" → 일정 조회`,
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
        setStatus('연결 종료');
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
    setStatus('대기 중');
    addLog('에이전트 종료', 'info');
  };

  const handleServerEvent = async (data) => {
    switch (data.type) {
      case 'session.created':
        addLog('세션 생성됨', 'success');
        break;

      case 'session.updated':
        setStatus('준비 완료');
        addLog('설정 완료 - 말씀하세요!', 'success');
        startAudioCapture();
        break;

      case 'input_audio_buffer.speech_started':
        setIsListening(true);
        setIsSpeaking(false);
        setStatus('듣는 중...');
        break;

      case 'input_audio_buffer.speech_stopped':
        setIsListening(false);
        setStatus('처리 중...');
        break;

      case 'conversation.item.input_audio_transcription.completed':
        if (data.transcript) {
          addLog(`🗣️ ${data.transcript}`, 'user');
        }
        break;

      case 'response.audio_transcript.done':
        if (data.transcript) {
          addLog(`🧞 ${data.transcript}`, 'assistant');
        }
        break;

      case 'response.audio.delta':
        setIsSpeaking(true);
        setStatus('말하는 중...');
        playAudio(data.delta);
        break;

      case 'response.audio.done':
        setTimeout(() => {
          setIsSpeaking(false);
          setStatus('듣는 중...');
        }, 300);
        break;

      case 'error':
        addLog(`오류: ${data.error?.message || '알 수 없는 오류'}`, 'error');
        break;
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

  useEffect(() => {
    return () => stopAgent();
  }, []);

  return (
    <div className="agent-page">
      <div className="agent-header">
        <span className="header-icon">🤖</span>
        <span className="header-title">AI 에이전트</span>
        <span className={`status-badge ${isConnected ? 'connected' : ''}`}>
          {isConnected ? '● 연결됨' : '○ 오프라인'}
        </span>
      </div>

      <div className="agent-main">
        <div className={`agent-avatar ${isActive ? 'active' : ''} ${isSpeaking ? 'speaking' : ''} ${isListening ? 'listening' : ''}`}>
          <div className="avatar-circle">
            <span className="avatar-icon">🧞</span>
          </div>
          {isActive && (
            <>
              <div className="pulse-ring"></div>
              <div className="pulse-ring delay-1"></div>
              <div className="pulse-ring delay-2"></div>
            </>
          )}
        </div>

        <div className="agent-status">{status}</div>

        <div className="agent-controls">
          {!isActive ? (
            <button className="start-btn" onClick={startAgent}>
              <span className="btn-icon">🎤</span>
              <span>에이전트 시작</span>
            </button>
          ) : (
            <button className="stop-btn" onClick={stopAgent}>
              <span className="btn-icon">⏹️</span>
              <span>종료</span>
            </button>
          )}
        </div>

        <div className="agent-hints">
          <p className="hints-title">💡 이렇게 말해보세요</p>
          <div className="hints-list">
            <span className="hint-item">"안녕 지니"</span>
            <span className="hint-item">"김철수 고객에게 전화해줘"</span>
            <span className="hint-item">"내일 오후 3시 상담 예약"</span>
            <span className="hint-item">"이번 주 일정 알려줘"</span>
          </div>
        </div>
      </div>

      <div className="agent-logs">
        <div className="logs-header">
          <span>📋 대화 로그</span>
          <button className="logs-clear" onClick={() => setLogs([])}>지우기</button>
        </div>
        <div className="logs-content">
          {logs.length === 0 ? (
            <div className="logs-empty">에이전트를 시작하면 대화가 여기에 표시됩니다.</div>
          ) : (
            logs.map((log, i) => (
              <div key={i} className={`log-item ${log.type}`}>
                <span className="log-time">{log.timestamp}</span>
                <span className="log-message">{log.message}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default AgentPage;
