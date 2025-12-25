// ============================================
// AgentPage.jsx v25.0 - AI지니 메인 페이지
// 수정 내용:
// - 🔧 이미지 분석 API 경로 수정 (/api/analyze-image)
// - 🔧 음성 재생 로직 강화 (AudioContext 안정화)
// - 🔧 전화 복명복창 로직 단순화
// - ✨ 파일 업로드 시 자동 OCR 안내 메시지
// ============================================

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
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showFileMenu, setShowFileMenu] = useState(false);
  const [analysisContextList, setAnalysisContextList] = useState([]);
  
  // 소통 UI 상태 (카톡/문자/이메일/팩스)
  const [pendingComm, setPendingComm] = useState(null);
  const [showCommOverlay, setShowCommOverlay] = useState(false);
  const [commType, setCommType] = useState(null);
  const [commTarget, setCommTarget] = useState(null);
  const [commStatus, setCommStatus] = useState('ready');
  
  const chatAreaRef = useRef(null);
  const wsRef = useRef(null);
  const audioContextRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const processorRef = useRef(null);
  const callTimerRef = useRef(null);
  const audioQueueRef = useRef([]);
  const isPlayingRef = useRef(false);
  const isConnectedRef = useRef(false);
  const lastCallInfoRef = useRef(null);
  const muteServerAudioRef = useRef(false);
  const cameraInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  
  // 🔧 v25: 오디오 컨텍스트 초기화 함수 (안정화)
  const initAudioContext = async () => {
    try {
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
        console.log('🔊 AudioContext 생성됨');
      }
      
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
        console.log('🔊 AudioContext resumed');
      }
      
      return true;
    } catch (e) {
      console.error('AudioContext 초기화 실패:', e);
      return false;
    }
  };
  
  useEffect(() => {
    const scrollToBottom = () => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    };
    scrollToBottom();
    const timer1 = setTimeout(scrollToBottom, 100);
    const timer2 = setTimeout(scrollToBottom, 300);
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
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

  // 소통 명령 감지 (카톡/문자/이메일/팩스)
  const checkCommCommand = (text) => {
    let type = null;
    if (text.includes('카톡') || text.includes('카카오')) type = 'kakao';
    else if (text.includes('문자')) type = 'sms';
    else if (text.includes('이메일') || text.includes('메일')) type = 'email';
    else if (text.includes('팩스')) type = 'fax';
    
    if (!type) return null;
    
    let name = '고객';
    const nameMatch = text.match(/([가-힣]{2,4})/g);
    if (nameMatch) {
      const excludeWords = ['카톡', '카카오', '문자', '이메일', '메일', '팩스', '보내', '전송', '해줘', '해주세요', '부탁', '고객'];
      for (const n of nameMatch) {
        if (!excludeWords.includes(n)) {
          name = n;
          break;
        }
      }
    }
    
    const phoneMatch = text.match(/\d{2,4}[-\s]?\d{3,4}[-\s]?\d{4}/);
    const phone = phoneMatch ? phoneMatch[0] : '010-0000-0000';
    
    return { type, name, phone };
  };

  const getCommTypeInfo = (type) => {
    const info = {
      kakao: { icon: '💬', label: '카카오톡', color: '#FEE500', textColor: '#191919' },
      sms: { icon: '📱', label: '문자', color: '#3B82F6', textColor: '#fff' },
      email: { icon: '📧', label: '이메일', color: '#EC4899', textColor: '#fff' },
      fax: { icon: '📠', label: '팩스', color: '#8B5CF6', textColor: '#fff' }
    };
    return info[type] || info.kakao;
  };

  const openCommOverlay = (type, target) => {
    setCommType(type);
    setCommTarget(target);
    setCommStatus('ready');
    setShowCommOverlay(true);
  };

  const closeCommOverlay = () => {
    setShowCommOverlay(false);
    setCommType(null);
    setCommTarget(null);
    setCommStatus('ready');
  };

  const executeComm = async () => {
    if (!commType || !commTarget) return;
    
    setCommStatus('sending');
    await new Promise(resolve => setTimeout(resolve, 2000));
    setCommStatus('sent');
    
    const typeLabels = { kakao: '카카오톡', sms: '문자', email: '이메일', fax: '팩스' };
    
    await new Promise(resolve => setTimeout(resolve, 1500));
    closeCommOverlay();
    
    addMessage(`✅ ${commTarget.name}님께 ${typeLabels[commType]}을 발송했습니다.`, false);
  };

  const handleCommApprove = () => {
    if (!pendingComm) return;
    const commInfo = pendingComm;
    setPendingComm(null);
    openCommOverlay(commInfo.type, { name: commInfo.name, phone: commInfo.phone });
    setTimeout(() => executeComm(), 500);
  };

  const handleCommCancel = () => {
    setPendingComm(null);
    addMessage('네, 발송을 취소했습니다.', false);
  };

  const addMessage = (text, isUser, imageData = null) => {
    setMessages(prev => [...prev, {
      id: Date.now() + Math.random(),
      text,
      isUser,
      imageData,
      time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
    }]);
  };

  const clearAnalysisContext = () => {
    setAnalysisContextList([]);
    addMessage('🗑️ 분석 기록이 초기화되었습니다. 새로운 파일을 업로드해주세요.', false);
  };

  // 🔧 v25: 파일 분석 - 이미지와 문서 분리
  const handleFileSelect = async (event) => {
    const files = Array.from(event.target.files);
    if (!files || files.length === 0) return;
    
    // 🔧 v25: 음성 모드 중이면 AudioContext 먼저 초기화
    await initAudioContext();
    
    for (const file of files) {
      const isImage = file.type.startsWith('image/');
      const isPDF = file.type === 'application/pdf' || file.name.endsWith('.pdf');
      
      if (file.size > 20 * 1024 * 1024) {
        addMessage(`⚠️ 파일 크기 초과 (20MB 제한): ${file.name}`, false);
        continue;
      }
      
      try {
        const base64 = await fileToBase64(file);
        const fileName = file.name;
        const fileCount = analysisContextList.length + 1;
        
        // 업로드 메시지
        if (isImage) {
          addMessage(`📎 [${fileCount}번째] 이미지 업로드: ${fileName}`, true, base64);
        } else {
          addMessage(`📎 [${fileCount}번째] 파일 업로드: ${fileName}`, true, null);
        }
        
        setIsAnalyzing(true);
        setStatus(`🔍 분석중...`);
        
        // 🔧 v25: 이미지 vs 문서 분기
        let analysis;
        if (isImage) {
          // 이미지는 /api/analyze-image로 (GPT-4o Vision)
          analysis = await analyzeImage(base64, fileName);
        } else {
          // PDF/문서는 /api/analyze-file로
          analysis = await analyzeFile(base64, fileName, isPDF ? 'pdf' : 'document');
        }
        
        // ✨ v25: AI지니 자동 안내 메시지
        addMessage(`📋 분석 완료!\n\n${analysis}\n\n💬 이 파일에 대해 질문해주세요.`, false);
        
        // 컨텍스트 저장 (대화에서 활용)
        const contextData = {
          id: Date.now(),
          fileName: fileName,
          fileType: isImage ? 'image' : (isPDF ? 'pdf' : 'document'),
          analysis: analysis,
          timestamp: new Date().toISOString()
        };
        
        setAnalysisContextList(prev => {
          const newList = [...prev, contextData];
          // WebSocket에 컨텍스트 전달
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
              type: 'update_context',
              analysisContextList: newList
            }));
          }
          return newList;
        });
        
      } catch (error) {
        console.error('파일 처리 에러:', error);
        addMessage(`❌ 파일 분석 실패: ${file.name}`, false);
      }
    }
    
    setIsAnalyzing(false);
    setStatus('대기중');
    event.target.value = '';
  };

  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = (error) => reject(error);
    });
  };

  // 🔧 v25: 이미지 분석 API (별도 함수)
  const analyzeImage = async (base64Data, fileName) => {
    try {
      const response = await fetch(`${RENDER_SERVER}/api/analyze-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          image: base64Data,
          prompt: `이 이미지를 분석해주세요. 
만약 보험증권, 영수증, 명함, 의료비 청구서 등이라면:
1. 문서 유형
2. 핵심 정보 (이름, 금액, 날짜 등)
3. 보험 관점에서의 의미
를 정리해주세요.`
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        return data.analysis;
      } else {
        return `❌ 분석 실패: ${data.error}`;
      }
    } catch (error) {
      console.error('이미지 분석 API 에러:', error);
      return '❌ 서버 연결 오류. 잠시 후 다시 시도해주세요.';
    }
  };

  // 🔧 v25: 파일/PDF 분석 API
  const analyzeFile = async (base64Data, fileName, fileType) => {
    try {
      const response = await fetch(`${RENDER_SERVER}/api/analyze-file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          file: base64Data,
          fileName: fileName,
          fileType: fileType
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        return data.analysis;
      } else {
        return `❌ 분석 실패: ${data.error}`;
      }
    } catch (error) {
      console.error('파일 분석 API 에러:', error);
      return '❌ 서버 연결 오류. 잠시 후 다시 시도해주세요.';
    }
  };

  // 🔧 v25: 오디오 재생 (안정화)
  const playAudio = async (base64Audio) => {
    // 음소거 상태면 무시
    if (muteServerAudioRef.current) return;
    
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
      // 🔧 v25: AudioContext 확실히 초기화
      const initialized = await initAudioContext();
      if (!initialized) {
        console.error('AudioContext 초기화 실패');
        processAudioQueue();
        return;
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

  const checkApproval = (text) => {
    const approvalWords = ['그래', '응', '어', '해줘', '해주세요', '진행', '네', '좋아', '알았어', '오케이', 'ok', '걸어', '전화해'];
    const lowerText = text.toLowerCase();
    return approvalWords.some(word => lowerText.includes(word));
  };

  const checkRejection = (text) => {
    const rejectionWords = ['아니', '취소', '안해', '하지마', '됐어', '그만'];
    return rejectionWords.some(word => text.includes(word));
  };

  // 🔧 v25: 음성 모드 시작 (안정화)
  const startVoiceMode = async () => {
    if (currentCall) return;
    if (isConnectedRef.current) return;
    
    // 상태 초기화
    lastCallInfoRef.current = null;
    setPendingCall(null);
    muteServerAudioRef.current = false;
    
    try {
      setStatus('연결중...');
      setIsVoiceMode(true);
      
      // 🔧 v25: AudioContext 먼저 초기화 (사용자 제스처에서)
      await initAudioContext();
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { sampleRate: 24000, channelCount: 1, echoCancellation: true, noiseSuppression: true } 
      });
      mediaStreamRef.current = stream;
      
      const ws = new WebSocket(`${WS_SERVER}?mode=app`);
      wsRef.current = ws;
      
      ws.onopen = () => {
        console.log('🔌 WebSocket 연결됨');
        const startMessage = { 
          type: 'start_app',
          analysisContextList: analysisContextList
        };
        ws.send(JSON.stringify(startMessage));
      };
      
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          
          if (msg.type === 'session_started') {
            isConnectedRef.current = true;
            setStatus('듣는중...');
            console.log('✅ OpenAI 세션 시작됨');
            startAudioCapture(stream, ws);
          }
          
          if (msg.type === 'audio' && msg.data) {
            playAudio(msg.data);
          }
          
          if (msg.type === 'transcript' && msg.role === 'user') {
            addMessage(msg.text, true);
            
            // 🔧 v25: 전화 승인 대기 중일 때
            if (lastCallInfoRef.current) {
              if (checkApproval(msg.text)) {
                const callInfo = lastCallInfoRef.current;
                lastCallInfoRef.current = null;
                setPendingCall(null);
                muteServerAudioRef.current = false;
                addMessage(`네, ${callInfo.name}님께 전화하겠습니다.`, false);
                makeCall(callInfo.name, callInfo.phone, callInfo.purpose);
                return;
              } else if (checkRejection(msg.text)) {
                lastCallInfoRef.current = null;
                setPendingCall(null);
                muteServerAudioRef.current = false;
                addMessage('네, 전화를 취소했습니다.', false);
                return;
              }
            }
            
            // 전화 명령 감지
            const callInfo = checkCallCommand(msg.text);
            if (callInfo) {
              muteServerAudioRef.current = true;
              setPendingCall(callInfo);
              lastCallInfoRef.current = callInfo;
              addMessage(`${callInfo.name}님께 ${callInfo.purpose} 목적으로 전화할까요? (네/아니오)`, false);
              return;
            }
            
            // 소통 명령 감지
            const commInfo = checkCommCommand(msg.text);
            if (commInfo) {
              setPendingComm(commInfo);
              const typeLabels = { kakao: '카카오톡', sms: '문자', email: '이메일', fax: '팩스' };
              addMessage(`${commInfo.name}님께 ${typeLabels[commInfo.type]}을 보낼까요? (네/아니오)`, false);
              return;
            }
          }
          
          if (msg.type === 'transcript' && msg.role === 'assistant') {
            if (lastCallInfoRef.current) return; // 전화 대기 중엔 AI 응답 무시
            addMessage(msg.text, false);
          }
          
          if (msg.type === 'interrupt') {
            audioQueueRef.current = [];
            isPlayingRef.current = false;
          }
          
          if (msg.type === 'error') {
            console.error('서버 에러:', msg.error);
            addMessage(`⚠️ 연결 오류: ${msg.error}`, false);
          }
          
        } catch (e) {
          console.error('메시지 파싱 에러:', e);
        }
      };
      
      ws.onerror = (error) => {
        console.error('WebSocket 에러:', error);
        setStatus('연결 실패');
        cleanupVoiceMode();
        setIsVoiceMode(false);
      };
      
      ws.onclose = () => {
        console.log('🔌 WebSocket 연결 종료');
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
    muteServerAudioRef.current = false;
  };

  const makeCall = async (name, phone, purpose = '상담 일정 예약') => {
    stopVoiceMode();
    setStatus('전화 연결중...');
    
    lastCallInfoRef.current = null;
    setPendingCall(null);
    
    try {
      const formattedPhone = phone.replace(/[-\s]/g, '');
      const fullPhone = formattedPhone.startsWith('0') ? '+82' + formattedPhone.slice(1) : formattedPhone;
      
      const response = await fetch(`${RENDER_SERVER}/api/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          phoneNumber: fullPhone, 
          customerName: name,
          purpose: purpose
        })
      });
      const data = await response.json();
      
      if (data.success) {
        setCurrentCall({ name, phone, callSid: data.callSid, purpose });
        setCallDuration(0);
        setStatus('통화중');
        
        callTimerRef.current = setInterval(() => {
          setCallDuration(prev => prev + 1);
        }, 1000);
        
        addMessage(`📞 ${name}님께 ${purpose} 목적으로 전화 연결됨 (AI 대화)`, false);
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
        await fetch(`${RENDER_SERVER}/api/end-call/${callSid}`, { method: 'POST' });
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

  const handleSend = async () => {
    if (!inputText.trim()) return;
    const text = inputText;
    setInputText('');
    
    addMessage(text, true);
    
    // 전화 승인 대기
    if (pendingCall) {
      if (checkApproval(text)) {
        const callInfo = pendingCall;
        setPendingCall(null);
        addMessage(`네, ${callInfo.name}님께 전화하겠습니다.`, false);
        await makeCall(callInfo.name, callInfo.phone, callInfo.purpose);
        return;
      } else if (checkRejection(text)) {
        setPendingCall(null);
        addMessage('네, 전화를 취소했습니다.', false);
        return;
      }
    }
    
    // 소통 승인 대기
    if (pendingComm) {
      if (checkApproval(text)) {
        handleCommApprove();
        return;
      } else if (checkRejection(text)) {
        handleCommCancel();
        return;
      }
    }
    
    // 전화 명령 감지
    const callInfo = checkCallCommand(text);
    if (callInfo) {
      setPendingCall(callInfo);
      addMessage(`${callInfo.name}님께 ${callInfo.purpose} 목적으로 전화할까요?`, false);
      return;
    }
    
    // 소통 명령 감지
    const commInfo = checkCommCommand(text);
    if (commInfo) {
      setPendingComm(commInfo);
      const typeLabels = { kakao: '카카오톡', sms: '문자', email: '이메일', fax: '팩스' };
      addMessage(`${commInfo.name}님께 ${typeLabels[commInfo.type]}을 보낼까요?`, false);
      return;
    }
    
    setStatus('생각중...');
    
    try {
      // 🔧 v25: 분석 컨텍스트 포함하여 전송
      const response = await fetch(`${RENDER_SERVER}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: text,
          analysisContext: analysisContextList.length > 0 ? analysisContextList : null
        })
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
              const callInfo = pendingCall;
              setPendingCall(null);
              lastCallInfoRef.current = null;
              muteServerAudioRef.current = false;
              addMessage(`네, ${callInfo.name}님께 전화하겠습니다.`, false);
              makeCall(callInfo.name, callInfo.phone, callInfo.purpose);
            }}>네</button>
            <button className="reject-btn" onClick={() => {
              setPendingCall(null);
              lastCallInfoRef.current = null;
              muteServerAudioRef.current = false;
              addMessage('네, 전화를 취소했습니다.', false);
            }}>아니오</button>
          </div>
        </div>
      )}

      {pendingComm && (
        <div className="pending-call-banner" style={{ background: 'linear-gradient(135deg, #3B82F6, #2563eb)' }}>
          <div className="pending-info">
            <span>{getCommTypeInfo(pendingComm.type).icon} {pendingComm.name}님께 {getCommTypeInfo(pendingComm.type).label} 보낼까요?</span>
          </div>
          <div className="pending-buttons">
            <button className="approve-btn" onClick={handleCommApprove}>네</button>
            <button className="reject-btn" onClick={handleCommCancel}>아니오</button>
          </div>
        </div>
      )}

      <div className="chat-area" ref={chatAreaRef}>
        {messages.length === 0 ? (
          <div className="welcome-message">
            <div className="welcome-icon">🧞</div>
            <h2>안녕하세요, 지니입니다!</h2>
            <p>🎙️ 버튼 누르고 자유롭게 말씀하세요.</p>
            <p>📎 파일 버튼으로 보험증권을 분석해보세요.</p>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <div key={msg.id} className={`message ${msg.isUser ? 'user' : 'ai'}`}>
                <div className="message-content">
                  {msg.imageData && (
                    <img 
                      src={msg.imageData} 
                      alt="업로드된 이미지" 
                      className="message-image"
                      onClick={() => window.open(msg.imageData, '_blank')}
                    />
                  )}
                  <p>{msg.text}</p>
                  <span className="message-time">{msg.time}</span>
                </div>
              </div>
            ))}
          </>
        )}
        
        {isAnalyzing && (
          <div className="message ai">
            <div className="message-content">
              <p>🔍 파일을 분석하고 있습니다...</p>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      <div className="quick-actions">
        <button onClick={() => { if (!isVoiceMode && !currentCall) startVoiceMode(); }} disabled={!!currentCall}>🧞 지니야</button>
        <button disabled={!currentCall} onClick={endCall}>📴 통화종료</button>
      </div>

      <div className="input-area">
        <input type="file" ref={cameraInputRef} onChange={handleFileSelect} accept="image/*" capture="environment" style={{ display: 'none' }} />
        <input type="file" ref={imageInputRef} onChange={handleFileSelect} accept="image/*" multiple style={{ display: 'none' }} />
        <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept=".pdf,.doc,.docx,.xls,.xlsx,.hwp,.txt" multiple style={{ display: 'none' }} />
        
        {showFileMenu && (
          <div className="file-submenu">
            <button className="submenu-btn" onClick={() => { cameraInputRef.current?.click(); setShowFileMenu(false); }}>
              <span>📷</span><span>사진촬영</span>
            </button>
            <button className="submenu-btn" onClick={() => { imageInputRef.current?.click(); setShowFileMenu(false); }}>
              <span>🖼️</span><span>사진/이미지</span>
            </button>
            <button className="submenu-btn" onClick={() => { fileInputRef.current?.click(); setShowFileMenu(false); }}>
              <span>📁</span><span>파일첨부</span>
            </button>
            {analysisContextList.length > 0 && (
              <button className="submenu-btn submenu-clear" onClick={() => { clearAnalysisContext(); setShowFileMenu(false); }}>
                <span>🗑️</span><span>초기화 ({analysisContextList.length})</span>
              </button>
            )}
            <button className="submenu-close" onClick={() => setShowFileMenu(false)}>✕</button>
          </div>
        )}
        
        <div className="action-buttons">
          <button className={`action-btn ${showFileMenu ? 'active' : ''}`} disabled={!!currentCall || isVoiceMode || isAnalyzing} onClick={() => setShowFileMenu(!showFileMenu)}>
            <span className="action-icon">📎</span><span className="action-label">파일</span>
          </button>
          <button className={`action-btn voice ${isVoiceMode ? 'active' : ''}`} onClick={isVoiceMode ? stopVoiceMode : startVoiceMode} disabled={!!currentCall || isAnalyzing}>
            <span className="action-icon">{isVoiceMode ? '🔴' : '🎤'}</span><span className="action-label">보이스</span>
          </button>
          <button className="action-btn" disabled>
            <span className="action-icon">🔴</span><span className="action-label">녹음</span>
          </button>
        </div>
        
        <div className="input-row">
          <input type="text" placeholder="텍스트로 입력..." value={inputText} onChange={(e) => setInputText(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleSend()} disabled={isVoiceMode || isAnalyzing} />
          <button className="send-btn" onClick={handleSend} disabled={isVoiceMode || isAnalyzing}>➤</button>
        </div>
      </div>

      {showCommOverlay && commTarget && (
        <div className="comm-overlay">
          <div className="comm-header" style={{ background: getCommTypeInfo(commType).color }}>
            <button className="comm-back" onClick={closeCommOverlay} style={{ color: getCommTypeInfo(commType).textColor }}>←</button>
            <span style={{ color: getCommTypeInfo(commType).textColor }}>{getCommTypeInfo(commType).icon} {getCommTypeInfo(commType).label} 발송</span>
          </div>
          <div className="comm-content">
            <div className="comm-recipient">
              <div className="comm-avatar">{commTarget.name?.charAt(0) || '?'}</div>
              <div className="comm-info">
                <h4>{commTarget.name}</h4>
                <p>{commTarget.phone}</p>
              </div>
            </div>
            <div className="comm-preview">
              <div className="comm-preview-header">📝 발송 내용</div>
              <div className="comm-preview-text">
                안녕하세요, {commTarget.name}님!<br /><br />
                지난번 상담 감사드립니다.<br />
                추가 문의사항 있으시면 연락 주세요.<br /><br />
                - 오원트금융연구소 드림
              </div>
            </div>
            <div className={`comm-status ${commStatus}`}>
              {commStatus === 'ready' && <><span className="comm-status-icon">📤</span><span>발송 준비 완료</span></>}
              {commStatus === 'sending' && <><span className="comm-status-icon spinning">⏳</span><span>발송 중...</span></>}
              {commStatus === 'sent' && <><span className="comm-status-icon">✅</span><span>{getCommTypeInfo(commType).label} 발송 완료!</span></>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AgentPage;
