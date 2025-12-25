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
  const [pendingCall, setPendingCall] = useState(null); // 승인 대기 중인 전화
  const [isAnalyzing, setIsAnalyzing] = useState(false); // 파일 분석 중 상태
  const [showFileMenu, setShowFileMenu] = useState(false); // 파일 하위 메뉴 표시
  const [analysisContextList, setAnalysisContextList] = useState([]); // v15: 다중 파일 분석 결과 누적 저장
  
  // 🆕 v23: 타임라인 상태 추가 (실행 결과 기록)
  const [timeline, setTimeline] = useState([]);
  const [showTimeline, setShowTimeline] = useState(false);
  
  // 🆕 v23: 전화 실행 오버레이 상태
  const [showCallOverlay, setShowCallOverlay] = useState(false);
  const [callConversation, setCallConversation] = useState([]);
  
  // 🆕 v23: 소통 선택 UI 상태 (카톡/문자/이메일/팩스)
  const [showCommOverlay, setShowCommOverlay] = useState(false);
  const [commType, setCommType] = useState(null); // 'kakao', 'sms', 'email', 'fax'
  const [commTarget, setCommTarget] = useState(null); // { name, phone, purpose }
  const [commStatus, setCommStatus] = useState('ready'); // 'ready', 'sending', 'sent'
  
  // 🆕 v23: 소통 명령 대기 상태
  const [pendingComm, setPendingComm] = useState(null); // { type, name, phone, message }
  
  // 🆕 v23: 녹음 상태
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [showReportOverlay, setShowReportOverlay] = useState(false);
  const [reportData, setReportData] = useState(null);
  
  const chatAreaRef = useRef(null);
  const wsRef = useRef(null);
  const audioContextRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const processorRef = useRef(null);
  const callTimerRef = useRef(null);
  const audioQueueRef = useRef([]);
  const isPlayingRef = useRef(false);
  const isConnectedRef = useRef(false);
  const lastCallInfoRef = useRef(null); // 마지막 전화 정보 (즉시 접근용)
  const muteServerAudioRef = useRef(false); // 서버 음성 차단 플래그
  const cameraInputRef = useRef(null); // 카메라 입력 ref
  const imageInputRef = useRef(null); // 이미지 입력 ref
  const fileInputRef = useRef(null); // 파일 입력 ref
  const recordingTimerRef = useRef(null); // 🆕 녹음 타이머 ref

  // 스크롤 자동 이동 (scrollIntoView 방식)
  const messagesEndRef = useRef(null);
  
  useEffect(() => {
    // scrollIntoView로 확실하게 스크롤
    const scrollToBottom = () => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    };
    
    // 즉시 + 100ms 후 + 300ms 후 스크롤
    scrollToBottom();
    const timer1 = setTimeout(scrollToBottom, 100);
    const timer2 = setTimeout(scrollToBottom, 300);
    
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [messages]);

  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      cleanupVoiceMode();
      if (callTimerRef.current) clearInterval(callTimerRef.current);
    };
  }, []);

  // 통화 상태 폴링 (자동 종료 감지)
  useEffect(() => {
    if (!currentCall?.callSid) return;
    
    const pollStatus = async () => {
      try {
        const response = await fetch(`${RENDER_SERVER}/api/call-status/${currentCall.callSid}`);
        const data = await response.json();
        
        if (data.status === 'completed' || data.status === 'failed' || data.status === 'busy' || data.status === 'no-answer') {
          // 통화 종료됨
          if (callTimerRef.current) {
            clearInterval(callTimerRef.current);
            callTimerRef.current = null;
          }
          const name = currentCall?.name || '고객';
          const duration = formatDuration(callDuration);
          
          // 🆕 v23: 타임라인에 통화 종료 기록
          addTimelineItem('call', `${name}님 통화 완료`, duration, 'success');
          
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

  // 🆕 v23: 타임라인 아이템 추가 함수
  const addTimelineItem = (type, content, detail = '', status = 'success') => {
    const newItem = {
      id: Date.now() + Math.random(),
      type, // 'call', 'message', 'schedule', 'analysis'
      content,
      detail,
      status, // 'success', 'working', 'pending'
      time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
    };
    setTimeline(prev => [...prev, newItem]);
    setShowTimeline(true);
  };

  // 🆕 v23: 타임라인 초기화
  const clearTimeline = () => {
    setTimeline([]);
    setShowTimeline(false);
  };

  // 🆕 v23: 소통 명령 감지 (카톡/문자/이메일/팩스)
  const checkCommCommand = (text) => {
    let type = null;
    if (text.includes('카톡') || text.includes('카카오')) type = 'kakao';
    else if (text.includes('문자')) type = 'sms';
    else if (text.includes('이메일') || text.includes('메일')) type = 'email';
    else if (text.includes('팩스')) type = 'fax';
    
    if (!type) return null;
    
    // 이름 추출
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
    
    // 전화번호 추출
    const phoneMatch = text.match(/\d{2,4}[-\s]?\d{3,4}[-\s]?\d{4}/);
    const phone = phoneMatch ? phoneMatch[0] : '010-0000-0000';
    
    return { type, name, phone };
  };

  // 🆕 v23: 전화 오버레이 열기
  const openCallOverlay = (callInfo) => {
    setCallConversation([]);
    setShowCallOverlay(true);
    
    // AI 통화 시뮬레이션 시작
    simulateCallConversation(callInfo);
  };

  // 🆕 v23: 전화 오버레이 닫기
  const closeCallOverlay = () => {
    setShowCallOverlay(false);
    setCallConversation([]);
  };

  // 🆕 v23: AI 통화 시뮬레이션
  const simulateCallConversation = async (callInfo) => {
    const messages = [
      { type: 'agent', text: `안녕하세요, ${callInfo.name}님. 오원트금융연구소 AI 비서입니다.` },
      { type: 'customer', text: '네, 안녕하세요.' },
      { type: 'agent', text: `설계사님께서 ${callInfo.purpose || '상담 일정'}을 조율해 달라고 하셨습니다. 이번 주 시간 괜찮으신가요?` },
      { type: 'customer', text: '토요일 오후 2시는 어떨까요?' },
      { type: 'agent', text: '네, 토요일 오후 2시로 예약하겠습니다. 감사합니다!' },
      { type: 'customer', text: '네, 감사합니다.' }
    ];
    
    for (const msg of messages) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      if (!showCallOverlay) break; // 오버레이가 닫혔으면 중단
      setCallConversation(prev => [...prev, msg]);
    }
  };

  // 🆕 v23: 소통 오버레이 열기
  const openCommOverlay = (type, target) => {
    setCommType(type);
    setCommTarget(target);
    setCommStatus('ready');
    setShowCommOverlay(true);
  };

  // 🆕 v23: 소통 오버레이 닫기
  const closeCommOverlay = () => {
    setShowCommOverlay(false);
    setCommType(null);
    setCommTarget(null);
    setCommStatus('ready');
  };

  // 🆕 v23: 소통 발송 실행
  const executeComm = async () => {
    if (!commType || !commTarget) return;
    
    setCommStatus('sending');
    
    // 발송 시뮬레이션 (실제로는 API 호출)
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    setCommStatus('sent');
    
    // 타임라인에 기록
    const typeLabels = { kakao: '카카오톡', sms: '문자', email: '이메일', fax: '팩스' };
    addTimelineItem('message', `${commTarget.name}님께 ${typeLabels[commType]} 발송 완료`, '', 'success');
    
    // 1.5초 후 오버레이 닫기
    await new Promise(resolve => setTimeout(resolve, 1500));
    closeCommOverlay();
    
    addMessage(`✅ ${commTarget.name}님께 ${typeLabels[commType]}을 발송했습니다.`, false);
  };

  // 🆕 v23: 소통 복명복창 카드 승인
  const handleCommApprove = () => {
    if (!pendingComm) return;
    
    console.log('✅ 소통 명령 승인:', pendingComm);
    const commInfo = pendingComm;
    setPendingComm(null);
    
    // 소통 오버레이 열기
    openCommOverlay(commInfo.type, { name: commInfo.name, phone: commInfo.phone });
    
    // 바로 발송 시작
    setTimeout(() => executeComm(), 500);
  };

  // 🆕 v23: 소통 복명복창 카드 취소
  const handleCommCancel = () => {
    console.log('❌ 소통 명령 취소');
    setPendingComm(null);
    addMessage('네, 발송을 취소했습니다.', false);
  };

  // 🆕 v23: 소통 타입별 정보
  const getCommTypeInfo = (type) => {
    const info = {
      kakao: { icon: '💬', label: '카카오톡', color: '#FEE500', textColor: '#191919' },
      sms: { icon: '📱', label: '문자', color: '#3B82F6', textColor: '#fff' },
      email: { icon: '📧', label: '이메일', color: '#EC4899', textColor: '#fff' },
      fax: { icon: '📠', label: '팩스', color: '#8B5CF6', textColor: '#fff' }
    };
    return info[type] || info.kakao;
  };

  // 🆕 v23: 녹음 시작
  const startRecording = () => {
    if (currentCall || isVoiceMode) return;
    
    setIsRecording(true);
    setRecordingTime(0);
    setStatus('녹음중...');
    addMessage('🔴 상담 녹음을 시작합니다.', false);
    
    // 녹음 타이머 시작
    recordingTimerRef.current = setInterval(() => {
      setRecordingTime(prev => prev + 1);
    }, 1000);
  };

  // 🆕 v23: 녹음 종료
  const stopRecording = () => {
    if (!isRecording) return;
    
    // 타이머 정지
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    
    const duration = recordingTime;
    setIsRecording(false);
    setRecordingTime(0);
    setStatus('대기중');
    
    // 2초 이상 녹음했을 때만 보고서 생성
    if (duration >= 2) {
      addMessage(`🔴 녹음 완료! (${formatRecordingTime(duration)}) 보고서를 생성합니다...`, false);
      
      // 보고서 생성 (시뮬레이션)
      setTimeout(() => {
        generateReport(duration);
      }, 1500);
    } else {
      addMessage('녹음 시간이 너무 짧습니다. 다시 시도해주세요.', false);
    }
  };

  // 🆕 v23: 녹음 토글
  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  // 🆕 v23: 녹음 시간 포맷
  const formatRecordingTime = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // 🆕 v23: 상담 보고서 생성
  const generateReport = (duration) => {
    const now = new Date();
    const report = {
      duration: formatRecordingTime(duration),
      date: now.toLocaleString('ko-KR'),
      summary: '고객이 종신보험 리모델링에 대해 문의함. 현재 가입 중인 보험의 보장 내용 확인 요청. 다음 주 화요일 오후 2시에 대면 상담 예약 완료.',
      actionItems: [
        '다음 주 화요일 14:00 대면 상담 일정 등록',
        '현재 보험 증권 분석 자료 준비',
        '리모델링 제안서 작성'
      ]
    };
    
    setReportData(report);
    setShowReportOverlay(true);
    
    // 타임라인에 기록
    addTimelineItem('analysis', '상담 보고서 생성 완료', report.duration, 'success');
  };

  // 🆕 v23: 보고서 오버레이 닫기
  const closeReportOverlay = () => {
    setShowReportOverlay(false);
    setReportData(null);
  };

  // 🆕 v23: 보고서 카카오톡 전송
  const sendReportToKakao = async () => {
    addMessage('💬 상담 보고서를 내 카카오톡으로 전송합니다...', false);
    
    // 전송 시뮬레이션
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    closeReportOverlay();
    addMessage('✅ 상담 보고서가 내 카카오톡으로 전송되었습니다.', false);
    
    // 타임라인에 기록
    addTimelineItem('message', '보고서 카카오톡 전송 완료', '', 'success');
  };

  // 메시지 추가 (이미지 지원)
  const addMessage = (text, isUser, imageData = null) => {
    setMessages(prev => [...prev, {
      id: Date.now() + Math.random(),
      text,
      isUser,
      imageData,
      time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
    }]);
  };

  // v15: 분석 컨텍스트 초기화 함수
  const clearAnalysisContext = () => {
    setAnalysisContextList([]);
    addMessage('🗑️ 분석 기록이 초기화되었습니다. 새로운 파일을 업로드해주세요.', false);
    console.log('🗑️ [v15] 분석 컨텍스트 초기화');
  };

  // v15: 다중 파일 선택 핸들러 - 동시 업로드 + 누적 분석 지원
  const handleFileSelect = async (event) => {
    const files = Array.from(event.target.files);
    if (!files || files.length === 0) return;
    
    // 지원 파일 형식 확인
    const supportedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp',
      'application/pdf',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/haansofthwp', 'application/x-hwp',
      'text/plain'
    ];
    
    // 각 파일 처리
    for (const file of files) {
      const isImage = file.type.startsWith('image/');
      const isPDF = file.type === 'application/pdf';
      const isSupported = supportedTypes.some(type => file.type.includes(type.split('/')[1])) || isImage || isPDF;
      
      if (!isSupported && !file.name.match(/\.(jpg|jpeg|png|gif|webp|bmp|pdf|doc|docx|xls|xlsx|hwp|txt)$/i)) {
        addMessage(`⚠️ 지원하지 않는 파일: ${file.name}`, false);
        continue;
      }
      
      // 파일 크기 제한 (20MB)
      if (file.size > 20 * 1024 * 1024) {
        addMessage(`⚠️ 파일 크기 초과 (20MB 제한): ${file.name}`, false);
        continue;
      }
      
      try {
        // 파일을 base64로 변환
        const base64 = await fileToBase64(file);
        const fileName = file.name;
        const fileType = isImage ? 'image' : (isPDF ? 'pdf' : 'document');
        
        // 대화창에 파일 정보 표시
        const fileCount = analysisContextList.length + 1;
        if (isImage) {
          addMessage(`📎 [${fileCount}번째 파일] 이미지 업로드: ${fileName}\n분석 중...`, true, base64);
        } else {
          addMessage(`📎 [${fileCount}번째 파일] 파일 업로드: ${fileName}\n분석 중...`, true, null);
        }
        
        // 분석 시작
        setIsAnalyzing(true);
        setStatus(`분석중... (${fileCount}번째)`);
        
        // API로 분석 요청
        const analysis = await analyzeFile(base64, fileName, fileType);
        
        // 분석 결과 표시
        addMessage(analysis, false);
        
        // 🆕 v23: 타임라인에 분석 완료 기록
        addTimelineItem('analysis', `${fileName} 분석 완료`, fileType, 'success');
        
        // v15: 분석 결과를 배열에 누적 저장
        const contextData = {
          id: Date.now(),
          fileName: fileName,
          fileType: fileType,
          analysis: analysis,
          timestamp: new Date().toISOString()
        };
        
        setAnalysisContextList(prev => {
          const newList = [...prev, contextData];
          console.log(`📋 [v15] 분석 컨텍스트 누적: ${newList.length}개 파일`);
          
          // v15: 음성 모드 중이면 WebSocket으로 누적된 컨텍스트 전달
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
              type: 'update_context',
              analysisContextList: newList
            }));
            console.log('📤 [v15] 누적 분석 컨텍스트를 서버에 전달');
          }
          
          return newList;
        });
        
      } catch (error) {
        console.error('파일 처리 에러:', error);
        addMessage(`❌ 파일 분석 실패: ${file.name}`, false);
      }
    }
    
    // 분석 완료 메시지
    setIsAnalyzing(false);
    setStatus('대기중');
    
    const totalFiles = analysisContextList.length + files.length;
    if (totalFiles > 1) {
      addMessage(`✅ 총 ${totalFiles}개 파일 분석 완료!\n💬 "비교해줘", "어떤 게 더 좋아?" 등 질문해보세요.`, false);
    } else {
      addMessage('💬 추가 파일을 업로드하거나 질문해주세요!', false);
    }
    
    // 파일 입력 초기화
    event.target.value = '';
  };

  // 파일을 base64로 변환
  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = (error) => reject(error);
    });
  };

  // 파일 분석 API (이미지, PDF, 문서 모두 지원)
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

  // 오디오 재생
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

  // 정리 함수
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

  // 전화 명령 감지 (6하원칙 적용)
  const checkCallCommand = (text) => {
    const phoneMatch = text.match(/\d{2,4}[-\s]?\d{3,4}[-\s]?\d{4}/);
    if (!phoneMatch) return null;
    
    const phone = phoneMatch[0];
    
    // 이름 추출
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
    
    // 목적 추출 (6하원칙 - WHY)
    let purpose = '상담 일정 예약';
    if (text.includes('보험') && text.includes('상담')) purpose = '보험 상담';
    else if (text.includes('계약')) purpose = '계약 관련 상담';
    else if (text.includes('청구')) purpose = '보험금 청구 안내';
    else if (text.includes('갱신')) purpose = '보험 갱신 안내';
    else if (text.includes('만기')) purpose = '만기 안내';
    else if (text.includes('상담')) purpose = '상담 일정 예약';
    
    return { name, phone, purpose };
  };

  // 승인 확인 감지 ("그래", "응", "해줘" 등)
  const checkApproval = (text) => {
    const approvalWords = ['그래', '응', '어', '해줘', '해주세요', '진행', '네', '좋아', '알았어', '오케이', 'ok', '걸어', '전화해'];
    const lowerText = text.toLowerCase();
    return approvalWords.some(word => lowerText.includes(word));
  };

  // 거절 확인 ("아니", "취소" 등)
  const checkRejection = (text) => {
    const rejectionWords = ['아니', '취소', '안해', '하지마', '됐어', '그만'];
    return rejectionWords.some(word => text.includes(word));
  };

  // 보이스 모드 시작
  const startVoiceMode = async () => {
    // 통화 중이면 음성모드 시작 금지
    if (currentCall) {
      console.log('⚠️ 통화 중에는 음성모드 시작 불가');
      return;
    }
    if (isConnectedRef.current) return;
    
    // v15.1: 음성모드 시작 시 이전 전화 정보 초기화 (버그 수정)
    lastCallInfoRef.current = null;
    setPendingCall(null);
    muteServerAudioRef.current = false;
    console.log('🔄 [v15.1] 음성모드 시작 - 이전 전화 정보 초기화');
    
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
        // v15: 다중 분석 컨텍스트 전달
        const startMessage = { 
          type: 'start_app',
          analysisContextList: analysisContextList
        };
        ws.send(JSON.stringify(startMessage));
        console.log('📤 [v15] start_app 전송, 분석 파일 수:', analysisContextList.length);
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
          
          // 서버 음성 차단 중이면 오디오 무시
          if (msg.type === 'audio' && msg.data) {
            if (muteServerAudioRef.current) {
              console.log('🔇 [DEBUG] 서버 음성 차단 중 - 오디오 무시');
              return;
            }
            playAudio(msg.data);
          }
          
          // 사용자 메시지
          if (msg.type === 'transcript' && msg.role === 'user') {
            console.log('🎤 [DEBUG] 사용자 음성 인식:', msg.text);
            addMessage(msg.text, true);
            
            // 승인 대기 중인 전화가 있으면 승인/거절 확인 (lastCallInfoRef 사용)
            console.log('🔍 [DEBUG] lastCallInfoRef 상태:', lastCallInfoRef.current);
            if (lastCallInfoRef.current) {
              console.log('🔍 [DEBUG] checkApproval 검사:', msg.text);
              const isApproved = checkApproval(msg.text);
              console.log('🔍 [DEBUG] checkApproval 결과:', isApproved);
              
              if (isApproved) {
                // 승인됨 - 전화 발신
                console.log('✅ [DEBUG] 전화 승인됨! makeCall 호출 예정:', lastCallInfoRef.current);
                const callInfo = lastCallInfoRef.current;
                lastCallInfoRef.current = null;
                setPendingCall(null);
                muteServerAudioRef.current = false;
                addMessage(`네, ${callInfo.name}님께 전화하겠습니다.`, false);
                console.log('📞 [DEBUG] makeCall 호출 시작');
                makeCall(callInfo.name, callInfo.phone, callInfo.purpose);
                console.log('📞 [DEBUG] makeCall 호출 완료');
                return;
              } else if (checkRejection(msg.text)) {
                // 거절됨
                console.log('❌ 전화 거절됨');
                lastCallInfoRef.current = null;
                setPendingCall(null);
                muteServerAudioRef.current = false;
                addMessage('네, 전화를 취소했습니다.', false);
                return;
              } else {
                console.log('⚠️ [DEBUG] 승인도 거절도 아님:', msg.text);
              }
            }
            
            // 전화 명령 감지
            const callInfo = checkCallCommand(msg.text);
            console.log('🔍 [DEBUG] checkCallCommand 결과:', callInfo);
            if (callInfo) {
              console.log('📞 [DEBUG] 전화 명령 감지! 서버 음성 차단 시작');
              muteServerAudioRef.current = true;
              
              // 바로 전화하지 않고 승인 대기
              setPendingCall(callInfo);
              lastCallInfoRef.current = callInfo;
              console.log('📞 [DEBUG] setPendingCall + lastCallInfoRef 완료');
              addMessage(`${callInfo.name}님께 ${callInfo.purpose} 목적으로 전화할까요? (네/아니오)`, false);
              console.log('📞 [DEBUG] 복명복창 메시지 추가 완료');
              return;
            }
          }
          
          // 지니 메시지
          if (msg.type === 'transcript' && msg.role === 'assistant') {
            console.log('🤖 [DEBUG] 지니 응답:', msg.text);
            
            // 승인 대기 중이면 지니 응답 무시 (복명복창 우선)
            if (lastCallInfoRef.current) {
              console.log('⚠️ [DEBUG] 승인 대기 중 - 지니 응답 무시:', msg.text);
              return;
            }
            
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

  // 오디오 캡처
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

  // 보이스 모드 종료
  const stopVoiceMode = () => {
    cleanupVoiceMode();
    setIsVoiceMode(false);
    setStatus('대기중');
    setPendingCall(null);
    muteServerAudioRef.current = false;
  };

  // 전화 걸기 (Realtime API 사용)
  const makeCall = async (name, phone, purpose = '상담 일정 예약') => {
    console.log('📞 [Realtime API] 전화 걸기:', name, phone, purpose);
    
    stopVoiceMode();
    setStatus('전화 연결중...');
    
    // v15.1: 전화 발신 시 이전 전화 정보 완전 초기화
    lastCallInfoRef.current = null;
    setPendingCall(null);
    
    // 🆕 v23: 타임라인에 전화 시작 기록
    addTimelineItem('call', `${name}님께 전화 연결 중...`, purpose, 'working');
    
    try {
      const formattedPhone = phone.replace(/[-\s]/g, '');
      const fullPhone = formattedPhone.startsWith('0') ? '+82' + formattedPhone.slice(1) : formattedPhone;
      
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

  // 전화 종료
  const endCall = async () => {
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }
    
    const name = currentCall?.name || '고객';
    const callSid = currentCall?.callSid;
    const duration = formatDuration(callDuration);
    
    // Twilio 통화도 종료
    if (callSid) {
      try {
        await fetch(`${RENDER_SERVER}/api/end-call/${callSid}`, {
          method: 'POST'
        });
      } catch (e) {
        console.error('통화 종료 API 에러:', e);
      }
    }
    
    // 🆕 v23: 타임라인에 통화 종료 기록
    addTimelineItem('call', `${name}님 통화 종료`, duration, 'success');
    
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

  // 🆕 v23: 복명복창 카드에서 승인 처리
  const handleConfirmApprove = () => {
    if (!pendingCall) return;
    
    console.log('✅ 복명복창 카드 승인:', pendingCall);
    const callInfo = pendingCall;
    setPendingCall(null);
    lastCallInfoRef.current = null;
    muteServerAudioRef.current = false;
    
    addMessage(`네, ${callInfo.name}님께 전화하겠습니다.`, false);
    makeCall(callInfo.name, callInfo.phone, callInfo.purpose);
  };

  // 🆕 v23: 복명복창 카드에서 취소 처리
  const handleConfirmCancel = () => {
    console.log('❌ 복명복창 카드 취소');
    setPendingCall(null);
    lastCallInfoRef.current = null;
    muteServerAudioRef.current = false;
    addMessage('네, 전화를 취소했습니다.', false);
  };

  // 텍스트 전송
  const handleSend = async () => {
    if (!inputText.trim()) return;
    const text = inputText;
    setInputText('');
    
    addMessage(text, true);
    
    // 승인 대기 중인 전화가 있으면 승인/거절 확인
    if (pendingCall) {
      if (checkApproval(text)) {
        console.log('✅ 전화 승인됨 (텍스트):', pendingCall);
        const callInfo = pendingCall;
        setPendingCall(null);
        addMessage(`네, ${callInfo.name}님께 전화하겠습니다.`, false);
        await makeCall(callInfo.name, callInfo.phone, callInfo.purpose);
        return;
      } else if (checkRejection(text)) {
        console.log('❌ 전화 거절됨 (텍스트)');
        setPendingCall(null);
        addMessage('네, 전화를 취소했습니다.', false);
        return;
      }
    }
    
    // 🆕 v23: 승인 대기 중인 소통 명령이 있으면 승인/거절 확인
    if (pendingComm) {
      if (checkApproval(text)) {
        handleCommApprove();
        return;
      } else if (checkRejection(text)) {
        handleCommCancel();
        return;
      }
    }
    
    // 텍스트에서도 전화 명령 감지
    const callInfo = checkCallCommand(text);
    if (callInfo) {
      // 바로 전화하지 않고 승인 대기
      setPendingCall(callInfo);
      addMessage(`${callInfo.name}님께 ${callInfo.purpose} 목적으로 전화할까요?`, false);
      return;
    }
    
    // 🆕 v23: 소통 명령 감지 (카톡/문자/이메일/팩스)
    const commInfo = checkCommCommand(text);
    if (commInfo) {
      // 바로 발송하지 않고 승인 대기
      setPendingComm(commInfo);
      const typeLabels = { kakao: '카카오톡', sms: '문자', email: '이메일', fax: '팩스' };
      addMessage(`${commInfo.name}님께 ${typeLabels[commInfo.type]}을 보낼까요?`, false);
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

  // 🆕 v23: 타임라인 아이콘 반환
  const getTimelineIcon = (type) => {
    switch (type) {
      case 'call': return '📞';
      case 'message': return '💬';
      case 'schedule': return '📅';
      case 'analysis': return '🔍';
      default: return '✅';
    }
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

      {/* 🆕 v23: 녹음 바 */}
      {isRecording && (
        <div className="recording-bar">
          <div className="recording-dot"></div>
          <div className="recording-time">{formatRecordingTime(recordingTime)}</div>
          <div className="recording-label">상담 녹음 중</div>
          <button className="recording-stop-btn" onClick={stopRecording}>종료</button>
        </div>
      )}

      {/* 기존 배너 형태 (롤백용 - 숨김 처리 가능) */}
      {/* 
      {pendingCall && (
        <div className="pending-call-banner">
          <div className="pending-info">
            <span>📞 {pendingCall.name}님께 전화할까요?</span>
          </div>
          <div className="pending-buttons">
            <button className="approve-btn" onClick={handleConfirmApprove}>네</button>
            <button className="reject-btn" onClick={handleConfirmCancel}>아니오</button>
          </div>
        </div>
      )}
      */}

      <div className="chat-area" ref={chatAreaRef}>
        {messages.length === 0 && !pendingCall && !showTimeline ? (
          <div className="welcome-message">
            <div className="welcome-icon">🧞</div>
            <h2>안녕하세요, 대표님!</h2>
            <h3>저는 대표님의 AI 비서 지니입니다.</h3>
            <div className="welcome-guide">
              <p>🎙️ "지니야" 하고 불러주시면 바로 응답해요</p>
              <p>📞 "김철수님께 전화해줘" - 전화 연결</p>
              <p>💬 "박영희님께 카톡 보내줘" - 메시지 발송</p>
              <p>📎 보험증권을 첨부하면 분석해 드려요</p>
              <p>🔴 상담 녹음하면 보고서를 만들어 드려요</p>
            </div>
            <p className="welcome-footer">무엇이든 편하게 말씀해 주세요! 💪</p>
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
            
            {/* 🆕 v23: 복명복창 카드 (시뮬레이터 UI) - 개선된 버전 */}
            {pendingCall && (
              <div className="confirm-card">
                <div className="confirm-header">
                  <span className="confirm-icon">🧞‍♂️</span>
                  <h4>대표님, 확인해 주세요</h4>
                </div>
                <div className="confirm-content">
                  <div className="confirm-main-text">
                    <span className="highlight">{pendingCall.name}</span>님께 전화해드릴게요.
                  </div>
                  <div className="confirm-details">
                    <div className="confirm-detail-row">
                      <span className="detail-icon">📞</span>
                      <span className="detail-text">{pendingCall.phone}</span>
                    </div>
                    <div className="confirm-detail-row">
                      <span className="detail-icon">📋</span>
                      <span className="detail-text">목적: {pendingCall.purpose}</span>
                    </div>
                    <div className="confirm-detail-row">
                      <span className="detail-icon">⏰</span>
                      <span className="detail-text">지금 바로 연결</span>
                    </div>
                  </div>
                  <div className="confirm-question">
                    진행할까요?
                  </div>
                </div>
                <div className="confirm-buttons">
                  <button className="confirm-btn cancel" onClick={handleConfirmCancel}>
                    ❌ 취소
                  </button>
                  <button className="confirm-btn approve" onClick={handleConfirmApprove}>
                    ✅ 승인
                  </button>
                </div>
              </div>
            )}
            
            {/* 🆕 v23: 소통 복명복창 카드 (카톡/문자/이메일/팩스) - 개선된 버전 */}
            {pendingComm && (
              <div className="confirm-card comm-card">
                <div className="confirm-header">
                  <span className="confirm-icon">{getCommTypeInfo(pendingComm.type).icon}</span>
                  <h4>대표님, 확인해 주세요</h4>
                </div>
                <div className="confirm-content">
                  <div className="confirm-main-text">
                    <span className="highlight">{pendingComm.name}</span>님께 
                    <span className="highlight"> {getCommTypeInfo(pendingComm.type).label}</span> 보내드릴게요.
                  </div>
                  <div className="confirm-details">
                    <div className="confirm-detail-row">
                      <span className="detail-icon">{getCommTypeInfo(pendingComm.type).icon}</span>
                      <span className="detail-text">{pendingComm.phone}</span>
                    </div>
                    <div className="confirm-detail-row">
                      <span className="detail-icon">📝</span>
                      <span className="detail-text">안녕하세요, 지난번 상담 감사드립니다...</span>
                    </div>
                  </div>
                  <div className="confirm-question">
                    발송할까요?
                  </div>
                </div>
                <div className="confirm-buttons">
                  <button className="confirm-btn cancel" onClick={handleCommCancel}>
                    ❌ 취소
                  </button>
                  <button className="confirm-btn approve" onClick={handleCommApprove}>
                    ✅ 발송
                  </button>
                </div>
              </div>
            )}
            
            {/* 🆕 v23: 타임라인 카드 (실행 결과) */}
            {showTimeline && timeline.length > 0 && (
              <div className="timeline-card">
                <div className="timeline-header">
                  <span>📊</span>
                  <h4>실행 결과</h4>
                  <button className="timeline-clear" onClick={clearTimeline}>✕</button>
                </div>
                <div className="timeline-list">
                  {timeline.map((item) => (
                    <div key={item.id} className={`timeline-item ${item.status}`}>
                      <span className="timeline-icon">{getTimelineIcon(item.type)}</span>
                      <div className="timeline-content">
                        <span className="timeline-text">{item.content}</span>
                        {item.detail && <span className="timeline-detail">{item.detail}</span>}
                      </div>
                      <span className="timeline-time">{item.time}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
        
        {/* 분석 중 표시 */}
        {isAnalyzing && (
          <div className="message ai">
            <div className="message-content">
              <p>🔍 파일을 분석하고 있습니다...</p>
            </div>
          </div>
        )}
        
        {/* 스크롤 타겟 */}
        <div ref={messagesEndRef} />
      </div>

      <div className="quick-actions">
        <button onClick={() => { if (!isVoiceMode && !currentCall) startVoiceMode(); }} disabled={!!currentCall}>🧞 지니야</button>
        <button disabled={!currentCall} onClick={endCall}>📴 통화종료</button>
      </div>

      <div className="input-area">
        {/* 숨겨진 파일 입력들 */}
        <input
          type="file"
          ref={cameraInputRef}
          onChange={handleFileSelect}
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
        />
        <input
          type="file"
          ref={imageInputRef}
          onChange={handleFileSelect}
          accept="image/*"
          multiple
          style={{ display: 'none' }}
        />
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          accept=".pdf,.doc,.docx,.xls,.xlsx,.hwp,.txt"
          multiple
          style={{ display: 'none' }}
        />
        
        {/* 파일 하위 메뉴 (펼쳐졌을 때) */}
        {showFileMenu && (
          <div className="file-submenu">
            <button 
              className="submenu-btn"
              onClick={() => {
                cameraInputRef.current?.click();
                setShowFileMenu(false);
              }}
            >
              <span>📷</span>
              <span>사진촬영</span>
            </button>
            <button 
              className="submenu-btn"
              onClick={() => {
                imageInputRef.current?.click();
                setShowFileMenu(false);
              }}
            >
              <span>🖼️</span>
              <span>사진/이미지</span>
            </button>
            <button 
              className="submenu-btn"
              onClick={() => {
                fileInputRef.current?.click();
                setShowFileMenu(false);
              }}
            >
              <span>📁</span>
              <span>파일첨부</span>
            </button>
            {/* v15: 분석 초기화 버튼 */}
            {analysisContextList.length > 0 && (
              <button 
                className="submenu-btn submenu-clear"
                onClick={() => {
                  clearAnalysisContext();
                  setShowFileMenu(false);
                }}
              >
                <span>🗑️</span>
                <span>초기화 ({analysisContextList.length})</span>
              </button>
            )}
            <button 
              className="submenu-close"
              onClick={() => setShowFileMenu(false)}
            >
              ✕
            </button>
          </div>
        )}
        
        {/* 상단 버튼 행: 파일, 보이스, 녹음 */}
        <div className="action-buttons">
          <button 
            className={`action-btn ${showFileMenu ? 'active' : ''}`}
            disabled={!!currentCall || isVoiceMode || isAnalyzing}
            onClick={() => setShowFileMenu(!showFileMenu)}
          >
            <span className="action-icon">📎</span>
            <span className="action-label">파일</span>
          </button>
          <button 
            className={`action-btn voice ${isVoiceMode ? 'active' : ''}`}
            onClick={isVoiceMode ? stopVoiceMode : startVoiceMode}
            disabled={!!currentCall || isAnalyzing}
          >
            <span className="action-icon">{isVoiceMode ? '🔴' : '🎤'}</span>
            <span className="action-label">보이스</span>
          </button>
          <button 
            className={`action-btn ${isRecording ? 'recording' : ''}`}
            onClick={toggleRecording}
            disabled={!!currentCall || isVoiceMode || isAnalyzing}
          >
            <span className="action-icon">{isRecording ? '⏹️' : '🔴'}</span>
            <span className="action-label">{isRecording ? '중지' : '녹음'}</span>
          </button>
        </div>
        
        {/* 하단 입력 행 */}
        <div className="input-row">
          <input
            type="text"
            placeholder="텍스트로 입력..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            disabled={isVoiceMode || isAnalyzing}
          />
          <button className="send-btn" onClick={handleSend} disabled={isVoiceMode || isAnalyzing}>➤</button>
        </div>
      </div>

      {/* 🆕 v23: 전화 실행 오버레이 */}
      {showCallOverlay && currentCall && (
        <div className="exec-overlay show">
          <div className="exec-header call">
            <button className="exec-back" onClick={closeCallOverlay}>←</button>
            <div className="exec-title">📞 AI 전화</div>
          </div>
          <div className="exec-content">
            <div className="call-exec">
              <div className="call-avatar-large">{currentCall.name?.charAt(0) || '?'}</div>
              <div className="call-name-large">{currentCall.name}</div>
              <div className="call-number-large">{currentCall.phone}</div>
              <div className="call-status-indicator">
                <div className="status-dot"></div>
                <span>AI 통화 중</span>
              </div>
              <div className="call-timer-large">{formatDuration(callDuration)}</div>
            </div>
            <div className="call-conversation">
              {callConversation.map((msg, idx) => (
                <div key={idx} className={`conv-bubble ${msg.type}`}>
                  {msg.text}
                </div>
              ))}
            </div>
            <div className="call-controls">
              <button className="call-ctrl-btn mute">🔇</button>
              <button className="call-ctrl-btn end" onClick={() => { closeCallOverlay(); endCall(); }}>📵</button>
              <button className="call-ctrl-btn speaker">🔊</button>
            </div>
          </div>
        </div>
      )}

      {/* 🆕 v23: 소통 실행 오버레이 (카톡/문자/이메일/팩스) */}
      {showCommOverlay && commTarget && (
        <div className="exec-overlay show">
          <div className={`exec-header ${commType}`} style={{ 
            background: commType === 'kakao' 
              ? 'linear-gradient(135deg, #FEE500, #E5CF00)' 
              : commType === 'sms'
              ? 'linear-gradient(135deg, #3B82F6, #2563eb)'
              : commType === 'email'
              ? 'linear-gradient(135deg, #EC4899, #db2777)'
              : 'linear-gradient(135deg, #8B5CF6, #7c3aed)'
          }}>
            <button 
              className="exec-back" 
              onClick={closeCommOverlay}
              style={{ color: commType === 'kakao' ? '#191919' : '#fff' }}
            >←</button>
            <div 
              className="exec-title"
              style={{ color: commType === 'kakao' ? '#191919' : '#fff' }}
            >
              {getCommTypeInfo(commType).icon} {getCommTypeInfo(commType).label} 발송
            </div>
          </div>
          <div className="exec-content">
            <div className="msg-exec">
              <div className="msg-recipient">
                <div className="msg-avatar">{commTarget.name?.charAt(0) || '?'}</div>
                <div className="msg-info">
                  <h4>{commTarget.name}</h4>
                  <p>{commTarget.phone}</p>
                </div>
              </div>
              <div className="msg-preview">
                <div className="msg-preview-header">📝 발송 내용</div>
                <div className="msg-preview-content">
                  안녕하세요, {commTarget.name}님!<br /><br />
                  지난번 상담 감사드립니다.<br />
                  추가 문의사항 있으시면 연락 주세요.<br /><br />
                  - 오원트금융연구소 드림
                </div>
              </div>
              <div className={`msg-status ${commStatus}`}>
                {commStatus === 'ready' && (
                  <>
                    <div className="msg-status-icon">📤</div>
                    <div className="msg-status-text">발송 준비 완료</div>
                  </>
                )}
                {commStatus === 'sending' && (
                  <>
                    <div className="msg-status-icon spinning">⏳</div>
                    <div className="msg-status-text">발송 중...</div>
                  </>
                )}
                {commStatus === 'sent' && (
                  <>
                    <div className="msg-status-icon">✅</div>
                    <div className="msg-status-text">{getCommTypeInfo(commType).label} 발송 완료!</div>
                    <div className="msg-status-sub">{new Date().toLocaleTimeString('ko-KR')}</div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 🆕 v23: 상담 보고서 오버레이 */}
      {showReportOverlay && reportData && (
        <div className="report-overlay show">
          <div className="report-header">
            <button className="exec-back" onClick={closeReportOverlay}>←</button>
            <div className="exec-title">📋 상담 보고서</div>
          </div>
          <div className="report-content">
            <div className="report-card">
              <h4>📊 상담 개요</h4>
              <div className="report-info">
                <p>• 상담 시간: {reportData.duration}</p>
                <p>• 상담 일시: {reportData.date}</p>
                <p>• 고객명: 미지정</p>
              </div>
            </div>
            <div className="report-card">
              <h4>📝 상담 요약</h4>
              <p className="report-summary">{reportData.summary}</p>
            </div>
            <div className="report-card">
              <h4>✅ 액션 아이템</h4>
              <ul className="report-actions">
                {reportData.actionItems.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
          <div className="report-footer">
            <button className="report-btn secondary" onClick={closeReportOverlay}>닫기</button>
            <button className="report-btn primary" onClick={sendReportToKakao}>💬 내 카톡으로 전송</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default AgentPage;
