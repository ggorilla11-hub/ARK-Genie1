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
  const [pendingCall, setPendingCall] = useState(null);
  
  const chatAreaRef = useRef(null);
  const messagesEndRef = useRef(null);
  const wsRef = useRef(null);
  const audioContextRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const processorRef = useRef(null);
  const callTimerRef = useRef(null);
  const audioQueueRef = useRef([]);
  const isPlayingRef = useRef(false);
  const isConnectedRef = useRef(false);
  const pendingCallRef = useRef(null); // 🆕 pendingCall을 ref로도 유지

  // 🆕 pendingCall 변경 시 ref도 업데이트
  useEffect(() => {
    pendingCallRef.current = pendingCall;
    console.log('📌 pendingCall 상태:', pendingCall);
  }, [pendingCall]);

  const scrollToBottom = () => {
    setTimeout(() => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
      if (chatAreaRef.current) {
        chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight;
      }
    }, 100);
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    return () => {
      cleanupVoiceMode();
      if (callTimerRef.current) clearInterval(callTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!currentCall?.callSid) return;
    
    const pollStatus = async () => {
      try {
        const response = await fetch(`${RENDER_SERVER}/api/call-status/${currentCall.callSid}`);
        const data = await response.json();
        
        if (data.status === 'completed' || data.status === 'failed' || data.status === 'busy' || data.status === 'no-answer') {
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
        }
      } catch (e) {
        console.error('통화 상태 조회 에러:', e);
      }
    };
    
    const intervalId = setInterval(pollStatus, 3000);
    return () => clearInterval(intervalId);
  }, [currentCall, callDuration]);

  const addMessage = (text, isUser) => {
    setMessages(prev => {
      const newMessages = [...prev, {
        id: Date.now() + Math.random(),
        text,
        isUser,
        time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
      }];
      return newMessages;
    });
    setTimeout(scrollToBottom, 50);
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
      console.error('오디오 재생 에러:', e);
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

  const checkCallCommand = (text) => {
    const phoneMatch = text.match(/\d{2,4}[-\s]?\d{3,4}[-\s]?\d{4}/);
    if (!phoneMatch) return null;
    
    const phone = phoneMatch[0];
    
    let name = '고객';
    const nameMatch = text.match(/([가-힣]{2,4})/g);
    if (nameMatch) {
      const excludeWords = ['전화', '통화', '연결', '해줘', '해주세요', '부탁', '입니다', '에게', '한테', '번호', '연락', '고객', '상담', '예약', '보험', '계약'];
      for (const n of nameMatch) {
        if (!excludeWords.includes(n)) {
          name = n;
          break;
        }
      }
    }
    
    let purpose = '상담 일정 예약';
    if (text.includes('보험') && text.includes('상담')) purpose = '보험 상담';
    else if (text.includes('계약')) purpose = '계약 관련 상담';
    else if (text.includes('청구')) purpose = '보험금 청구 안내';
    else if (text.includes('갱신')) purpose = '보험 갱신 안내';
    else if (text.includes('만기')) purpose = '만기 안내';
    else if (text.includes('상담')) purpose = '상담 일정 예약';
    
    return { name, phone, purpose };
  };

  // 🆕 승인 체크 강화
  const checkApproval = (text) => {
    const approvalWords = ['그래', '응', '어', '해줘', '해주세요', '진행', '네', '좋아', '알았어', '오케이', 'ok', '걸어', '전화해', '해', '웅', '넹', '예', '부탁'];
    const lowerText = text.toLowerCase().trim();
    
    // 정확히 일치하는 경우 (짧은 응답)
    if (approvalWords.includes(lowerText)) {
      console.log('✅ 정확한 승인 감지:', lowerText);
      return true;
    }
    
    // 포함하는 경우
    const found = approvalWords.some(word => lowerText.includes(word));
    if (found) {
      console.log('✅ 승인 단어 포함 감지:', lowerText);
    }
    return found;
  };

  const checkRejection = (text) => {
    const rejectionWords = ['아니', '취소', '안해', '하지마', '됐어', '그만', '안 해', '하지 마'];
    return rejectionWords.some(word => text.includes(word));
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
        console.log('✅ WebSocket 연결됨');
        ws.send(JSON.stringify({ type: 'start_app' }));
      };
      
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          
          if (msg.type === 'session_started') {
            console.log('✅ 세션 시작됨');
            isConnectedRef.current = true;
            setStatus('듣는중...');
            startAudioCapture(stream, ws);
          }
          
          if (msg.type === 'audio' && msg.data) {
            playAudio(msg.data);
          }
          
          if (msg.type === 'transcript' && msg.role === 'user') {
            addMessage(msg.text, true);
            
            // 🆕 ref를 사용하여 pendingCall 확인
            const currentPendingCall = pendingCallRef.current;
            console.log('🔍 음성 입력:', msg.text, '| pendingCall:', currentPendingCall);
            
            if (currentPendingCall) {
              if (checkApproval(msg.text)) {
                console.log('✅ 전화 승인됨 (음성):', currentPendingCall);
                const callInfo = currentPendingCall;
                setPendingCall(null);
                pendingCallRef.current = null;
                makeCall(callInfo.name, callInfo.phone, callInfo.purpose);
                return;
              } else if (checkRejection(msg.text)) {
                console.log('❌ 전화 거절됨 (음성)');
                setPendingCall(null);
                pendingCallRef.current = null;
                addMessage('네, 전화를 취소했습니다.', false);
                return;
              }
            }
            
            const callInfo = checkCallCommand(msg.text);
            if (callInfo) {
              console.log('📞 전화 명령 감지:', callInfo);
              setPendingCall(callInfo);
              pendingCallRef.current = callInfo;
              addMessage(`${callInfo.name}님께 ${callInfo.purpose} 목적으로 전화할까요?`, false);
            }
          }
          
          if (msg.type === 'transcript' && msg.role === 'assistant') {
            addMessage(msg.text, false);
          }
          
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
        cleanupVoiceMode();
        setIsVoiceMode(false);
      };
      
      ws.onclose = () => {
        console.log('🔌 WebSocket 종료');
        isConnectedRef.current = false;
        setStatus('대기중');
        setIsVoiceMode(false);
      };
      
    } catch (error) {
      console.error('마이크 에러:', error);
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
    } catch (e) {
      console.error('오디오 캡처 에러:', e);
    }
  };

  const stopVoiceMode = () => {
    cleanupVoiceMode();
    setIsVoiceMode(false);
    setStatus('대기중');
    setPendingCall(null);
    pendingCallRef.current = null;
  };

  const makeCall = async (name, phone, purpose = '상담 일정 예약') => {
    console.log('📞 [Realtime API] 전화 걸기:', name, phone, purpose);
    
    stopVoiceMode();
    setStatus('전화 연결중...');
    addMessage(`📞 ${name}님께 전화 연결중...`, false);
    
    try {
      const formattedPhone = phone.replace(/[-\s]/g, '');
      const fullPhone = formattedPhone.startsWith('0') ? '+82' + formattedPhone.slice(1) : formattedPhone;
      
      console.log('📞 API 호출:', RENDER_SERVER + '/api/call-realtime', { to: fullPhone, customerName: name, purpose });
      
      const response = await fetch(`${RENDER_SERVER}/api/call-realtime`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          to: fullPhone, 
          customerName: name,
          purpose: purpose
        })
      });
      const data = await response.json();
      
      console.log('📞 API 응답:', data);
      
      if (data.success) {
        setCurrentCall({ name, phone, callSid: data.callSid, purpose });
        setCallDuration(0);
        setStatus('통화중');
        
        callTimerRef.current = setInterval(() => {
          setCallDuration(prev => prev + 1);
        }, 1000);
        
        addMessage(`📞 ${name}님께 전화 연결됨 (AI 대화)`, false);
      } else {
        addMessage(`❌ 연결 실패: ${data.error}`, false);
        setStatus('대기중');
      }
    } catch (error) {
      console.error('전화 에러:', error);
      addMessage(`❌ 전화 연결 실패: ${error.message}`, false);
      setStatus('대기중');
    }
  };

  const endCall = async () => {
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }
    
    const name = currentCall?.name || '고객';
    const callSid = currentCall?.callSid;
    const duration = formatDuration(callDuration);
    
    if (callSid) {
      try {
        await fetch(`${RENDER_SERVER}/api/end-call/${callSid}`, {
          method: 'POST'
        });
      } catch (e) {
        console.error('통화 종료 API 에러:', e);
      }
    }
    
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

  // 🆕 텍스트 전송 로직 개선
  const handleSend = async () => {
    if (!inputText.trim()) return;
    const text = inputText.trim();
    setInputText('');
    
    addMessage(text, true);
    
    console.log('📝 텍스트 입력:', text, '| pendingCall:', pendingCall);
    
    // 🆕 승인 대기 중인 전화가 있으면 최우선 처리
    if (pendingCall) {
      if (checkApproval(text)) {
        console.log('✅ 전화 승인됨 (텍스트):', pendingCall);
        const callInfo = pendingCall;
        setPendingCall(null);
        pendingCallRef.current = null;
        await makeCall(callInfo.name, callInfo.phone, callInfo.purpose);
        return; // 여기서 반드시 종료!
      } else if (checkRejection(text)) {
        console.log('❌ 전화 거절됨 (텍스트)');
        setPendingCall(null);
        pendingCallRef.current = null;
        addMessage('네, 전화를 취소했습니다.', false);
        return; // 여기서 반드시 종료!
      }
      // 승인도 거절도 아니면 pendingCall 유지하고 다시 질문
      addMessage(`${pendingCall.name}님께 전화할까요? (네/아니오)`, false);
      return;
    }
    
    // 전화 명령 감지
    const callInfo = checkCallCommand(text);
    if (callInfo) {
      console.log('📞 전화 명령 감지 (텍스트):', callInfo);
      setPendingCall(callInfo);
      pendingCallRef.current = callInfo;
      addMessage(`${callInfo.name}님께 ${callInfo.purpose} 목적으로 전화할까요?`, false);
      return;
    }
    
    // 일반 채팅
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

      {pendingCall && (
        <div className="pending-call-banner">
          <div className="pending-info">
            <span>📞 {pendingCall.name}님께 전화할까요?</span>
          </div>
          <div className="pending-buttons">
            <button className="approve-btn" onClick={() => {
              console.log('✅ 버튼 클릭 승인:', pendingCall);
              const callInfo = pendingCall;
              setPendingCall(null);
              pendingCallRef.current = null;
              makeCall(callInfo.name, callInfo.phone, callInfo.purpose);
            }}>네</button>
            <button className="reject-btn" onClick={() => {
              console.log('❌ 버튼 클릭 거절');
              setPendingCall(null);
              pendingCallRef.current = null;
              addMessage('네, 전화를 취소했습니다.', false);
            }}>아니오</button>
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
          <>
            {messages.map((msg) => (
              <div key={msg.id} className={`message ${msg.isUser ? 'user' : 'ai'}`}>
                <div className="message-content">
                  <p>{msg.text}</p>
                  <span className="message-time">{msg.time}</span>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      <div className="quick-actions">
        <button onClick={() => { if (!isVoiceMode) startVoiceMode(); }}>🧞 지니야</button>
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
