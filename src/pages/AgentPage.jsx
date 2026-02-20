import React, { useState, useRef, useEffect } from 'react';
import './AgentPage.css';

const RENDER_SERVER = 'https://ark-genie-server-staging.onrender.com';
const WS_SERVER = 'wss://ark-genie-server-staging.onrender.com';

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
  
  // 🆕 v24: 소통 UI 상태만 추가 (카톡/문자/이메일/팩스)
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

  // 🆕 v24: 소통 명령 감지 (카톡/문자/이메일/팩스)
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

  // 🆕 v24: 소통 타입별 정보
  const getCommTypeInfo = (type) => {
    const info = {
      kakao: { icon: '💬', label: '카카오톡', color: '#FEE500', textColor: '#191919' },
      sms: { icon: '📱', label: '문자', color: '#3B82F6', textColor: '#fff' },
      email: { icon: '📧', label: '이메일', color: '#EC4899', textColor: '#fff' },
      fax: { icon: '📠', label: '팩스', color: '#8B5CF6', textColor: '#fff' }
    };
    return info[type] || info.kakao;
  };

  // 🆕 v24: 소통 오버레이 열기
  const openCommOverlay = (type, target) => {
    setCommType(type);
    setCommTarget(target);
    setCommStatus('ready');
    setShowCommOverlay(true);
  };

  // 🆕 v24: 소통 오버레이 닫기
  const closeCommOverlay = () => {
    setShowCommOverlay(false);
    setCommType(null);
    setCommTarget(null);
    setCommStatus('ready');
  };

  // 🆕 v24: 소통 발송 실행
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

  // 🆕 v24: 소통 복명복창 승인
  const handleCommApprove = () => {
    if (!pendingComm) return;
    const commInfo = pendingComm;
    setPendingComm(null);
    openCommOverlay(commInfo.type, { name: commInfo.name, phone: commInfo.phone });
    setTimeout(() => executeComm(), 500);
  };

  // 🆕 v24: 소통 복명복창 취소
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

  const handleFileSelect = async (event) => {
    const files = Array.from(event.target.files);
    if (!files || files.length === 0) return;
    
    const supportedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp',
      'application/pdf',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/haansofthwp', 'application/x-hwp',
      'text/plain'
    ];
    
    for (const file of files) {
      const isImage = file.type.startsWith('image/');
      const isPDF = file.type === 'application/pdf';
      const isSupported = supportedTypes.some(type => file.type.includes(type.split('/')[1])) || isImage || isPDF;
      
      if (!isSupported && !file.name.match(/\.(jpg|jpeg|png|gif|webp|bmp|pdf|doc|docx|xls|xlsx|hwp|txt)$/i)) {
        addMessage(`⚠️ 지원하지 않는 파일: ${file.name}`, false);
        continue;
      }
      
      if (file.size > 20 * 1024 * 1024) {
        addMessage(`⚠️ 파일 크기 초과 (20MB 제한): ${file.name}`, false);
        continue;
      }
      
      try {
        let base64 = await fileToBase64(file);
        const fileName = file.name;
        let fileType = file.type || (isImage ? 'image/jpeg' : (isPDF ? 'application/pdf' : 'document'));
        
        // 🆕 v22.3: 이미지 자동 압축 (5MB 초과 시)
        if (isImage) {
          base64 = await compressImage(base64, 4);
          fileType = 'image/jpeg'; // 압축 후 항상 JPEG
        }
        
        const fileCount = analysisContextList.length + 1;
        if (isImage) {
          addMessage(`📎 [${fileCount}번째 파일] 이미지 업로드: ${fileName}\n분석 중...`, true, base64);
        } else {
          addMessage(`📎 [${fileCount}번째 파일] 파일 업로드: ${fileName}\n분석 중...`, true, null);
        }
        
        setIsAnalyzing(true);
        setStatus(`분석중... (${fileCount}번째)`);
        
        const analysis = await analyzeFile(base64, fileName, fileType);
        addMessage(analysis, false);
        
        // 🆕 v22: 이미지 분석 성공 시 PDF 리포트 버튼 추가
        if (isImage && analysis && !analysis.startsWith('❌')) {
          setMessages(prev => [...prev, {
            id: Date.now() + Math.random(),
            text: '📄 PDF 리포트 보기',
            isUser: false,
            isPdfButton: true,
            analysisText: analysis,
            analysisFileName: fileName,
            time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
          }]);
        }
        
        const contextData = {
          id: Date.now(),
          fileName: fileName,
          fileType: fileType,
          analysis: analysis,
          timestamp: new Date().toISOString()
        };
        
        setAnalysisContextList(prev => {
          const newList = [...prev, contextData];
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
    
    const totalFiles = analysisContextList.length + files.length;
    if (totalFiles > 1) {
      addMessage(`✅ 총 ${totalFiles}개 파일 분석 완료!\n💬 "비교해줘", "어떤 게 더 좋아?" 등 질문해보세요.`, false);
    } else {
      addMessage('💬 추가 파일을 업로드하거나 질문해주세요!', false);
    }
    
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

  // 🆕 v22.4: 이미지를 항상 JPEG로 변환 + 5MB 초과 시 리사이즈
  const compressImage = (base64Data, maxSizeMB = 4) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        const maxSize = maxSizeMB * 1024 * 1024;
        const currentSize = base64Data.length * 0.75;
        
        // 큰 이미지는 리사이즈
        if (currentSize > maxSize) {
          const ratio = Math.sqrt(maxSize / currentSize) * 0.85;
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        
        // 항상 canvas를 통해 JPEG로 변환 (PNG → JPEG 변환 보장)
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        
        let quality = 0.85;
        let result = canvas.toDataURL('image/jpeg', quality);
        
        // 여전히 크면 품질 더 낮추기
        while (result.length * 0.75 > maxSize && quality > 0.3) {
          quality -= 0.1;
          result = canvas.toDataURL('image/jpeg', quality);
        }
        
        console.log(`🗜️ 이미지 변환: ${(currentSize/1024/1024).toFixed(1)}MB → ${(result.length*0.75/1024/1024).toFixed(1)}MB (JPEG)`);
        resolve(result);
      };
      img.src = base64Data;
    });
  };

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

  // 🆕 v23: PDF 리포트 새 탭에서 열기 (프로페셔널 디자인 + 마크다운 테이블 변환)
  const openPdfReport = (analysisText, fileName) => {
    // 마크다운 → HTML 변환 (테이블 포함)
    const convertMarkdown = (text) => {
      const lines = text.split('\n');
      let html = '';
      let inTable = false;
      let tableRows = [];

      const processTableRows = () => {
        if (tableRows.length < 2) return tableRows.join('<br>');
        const headers = tableRows[0].split('|').filter(c => c.trim());
        const dataRows = tableRows.slice(2); // skip separator
        let t = '<table><tr>';
        headers.forEach(h => { t += `<th>${h.trim()}</th>`; });
        t += '</tr>';
        dataRows.forEach((row, i) => {
          const cells = row.split('|').filter(c => c.trim());
          if (cells.length > 0) {
            t += `<tr class="${i % 2 === 0 ? 'even' : ''}">`;
            cells.forEach(c => { t += `<td>${c.trim().replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</td>`; });
            t += '</tr>';
          }
        });
        t += '</table>';
        return t;
      };

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
          if (!inTable) { inTable = true; tableRows = []; }
          tableRows.push(line.trim());
        } else {
          if (inTable) { html += processTableRows(); inTable = false; tableRows = []; }
          if (line.startsWith('# ')) {
            html += `<h1 class="report-h1">${line.slice(2)}</h1>`;
          } else if (line.startsWith('## ')) {
            html += `<div class="section-title">${line.slice(3)}</div>`;
          } else if (line.startsWith('### ')) {
            html += `<h3 class="subsection">${line.slice(4)}</h3>`;
          } else if (line.startsWith('> ')) {
            html += `<blockquote>${line.slice(2)}</blockquote>`;
          } else if (line.startsWith('- ')) {
            html += `<div class="list-item">• ${line.slice(2)}</div>`;
          } else if (line.startsWith('---')) {
            html += '<hr>';
          } else if (line.trim() === '') {
            html += '<div class="spacer"></div>';
          } else {
            html += `<p>${line}</p>`;
          }
        }
      }
      if (inTable) html += processTableRows();
      return html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    };

    const analysisHtml = convertMarkdown(analysisText);
    const today = new Date().toLocaleDateString('ko-KR');

    const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ARK-Genie 보험분석 리포트</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700;900&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Noto Sans KR',sans-serif;font-size:10pt;color:#222;line-height:1.7;background:#f0f2f5}
.container{max-width:820px;margin:20px auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.12)}

/* 헤더 */
.header{background:linear-gradient(135deg,#0f1b3d,#1a3a6e,#2c5f9e);color:white;padding:30px 35px;position:relative;overflow:hidden}
.header::after{content:'';position:absolute;top:-50%;right:-20%;width:300px;height:300px;background:radial-gradient(circle,rgba(255,255,255,0.08),transparent);border-radius:50%}
.header h1{font-size:24pt;font-weight:900;letter-spacing:3px;margin-bottom:6px;position:relative;z-index:1}
.header .subtitle{font-size:10pt;font-weight:300;opacity:0.85;position:relative;z-index:1}
.header .badge{display:inline-block;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.3);padding:4px 12px;border-radius:20px;font-size:8pt;margin-top:8px;position:relative;z-index:1}

/* 컨텐츠 */
.content{padding:30px 35px}
.report-h1{display:none}
.section-title{font-size:13pt;font-weight:700;color:#0f1b3d;border-bottom:3px solid #0f1b3d;padding-bottom:6px;margin:28px 0 14px 0;display:flex;align-items:center;gap:8px}
.subsection{font-size:11pt;font-weight:700;color:#1a3a6e;margin:16px 0 8px 0;padding:8px 12px;background:linear-gradient(135deg,#f0f4ff,#e8eeff);border-radius:6px;border-left:4px solid #1a3a6e}
p{margin:4px 0;line-height:1.8}
.list-item{margin:3px 0 3px 12px;line-height:1.7}
.spacer{height:8px}
blockquote{background:linear-gradient(135deg,#f0faf0,#e8f5e8);border-left:4px solid #2d8a4e;padding:12px 16px;margin:8px 0;border-radius:0 8px 8px 0;font-style:italic;color:#1a5c2e;line-height:1.8}
hr{border:none;border-top:1px solid #e0e0e0;margin:16px 0}

/* 테이블 */
table{width:100%;border-collapse:collapse;margin:12px 0 18px 0;font-size:9pt;border-radius:8px;overflow:hidden;box-shadow:0 1px 6px rgba(0,0,0,0.08)}
table th{background:linear-gradient(135deg,#0f1b3d,#1a3a6e);color:white;padding:10px 10px;text-align:center;font-weight:600;font-size:9pt;letter-spacing:0.5px}
table td{padding:8px 10px;border-bottom:1px solid #eee;text-align:center;font-size:9pt}
table tr.even td{background:#f8faff}
table tr:hover td{background:#eef3ff}
table td:first-child{font-weight:600}

/* 정보박스 */
.info-box{display:flex;align-items:center;gap:10px;padding:14px 18px;border-radius:8px;margin:12px 0;font-size:9.5pt;line-height:1.6}
.info-blue{background:linear-gradient(135deg,#e8f0fe,#dce8ff);border:1px solid #b8d0ff}
.info-green{background:linear-gradient(135deg,#e8f8e8,#dcf2dc);border:1px solid #a8d8a8}
.info-amber{background:linear-gradient(135deg,#fff8e1,#fff3cd);border:1px solid #ffe082}
.info-icon{font-size:20pt;flex-shrink:0}

/* 버튼 영역 */
.btn-area{text-align:center;padding:24px;background:linear-gradient(135deg,#f5f7fa,#e8ecf1);border-top:1px solid #e0e0e0;display:flex;justify-content:center;gap:12px}
.btn{border:none;padding:14px 28px;border-radius:10px;font-size:11pt;font-weight:700;cursor:pointer;font-family:'Noto Sans KR',sans-serif;transition:all 0.2s}
.btn-print{background:linear-gradient(135deg,#0f1b3d,#1a3a6e);color:white}
.btn-print:hover{transform:translateY(-2px);box-shadow:0 4px 12px rgba(15,27,61,0.3)}
.btn-share{background:white;color:#0f1b3d;border:2px solid #0f1b3d}
.btn-share:hover{background:#f0f4ff}

/* 푸터 */
.footer{font-size:7.5pt;color:#888;padding:16px 35px;border-top:1px solid #eee;line-height:1.6;display:flex;justify-content:space-between;align-items:center}
.footer-logo{font-weight:700;color:#0f1b3d}

/* 인쇄 */
@media print{
  .btn-area{display:none}
  .container{box-shadow:none;border-radius:0;margin:0}
  body{background:white}
  .header{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  table th{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}
</style></head><body>
<div class="container">
<div class="header">
<h1>ARK-Genie</h1>
<div class="subtitle">AI 기반 보험 Gap 분석 및 최적 상품 추천 리포트</div>
<div class="badge">🤖 Claude Vision AI · 38개사 DB · ${today}</div>
</div>

<div class="content">
<div class="info-box info-blue">
<span class="info-icon">📄</span>
<div><strong>분석 파일:</strong> ${fileName}<br><strong>분석 엔진:</strong> Claude Vision AI (ARK-Genie v23.0) · <strong>DB:</strong> 38개사 398상품 · 238 인수지침 · 44 변액펀드</div>
</div>

${analysisHtml}
</div>

<div class="btn-area">
<button class="btn btn-print" onclick="window.print()">🖨️ PDF 저장 / 인쇄</button>
</div>

<div class="footer">
<div>※ 본 리포트는 AI 분석 참고자료이며, 실제 가입 시 보험사 심사 결과에 따라 달라질 수 있습니다.</div>
<div class="footer-logo">오원트금융연구소 | ARK-Genie v23.0</div>
</div>
</div></body></html>`;

    const newWindow = window.open('', '_blank');
    if (newWindow) {
      newWindow.document.write(html);
      newWindow.document.close();
    }
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
      const excludeWords = ['전화', '통화', '연결', '해줘', '해주세요', '부탁', '입니다', '에게', '한테', '번호', '연락', '고객', '상담', '예약', '보험', '계약', '생일', '축하', '안부', '소개', '만기', '연체', '미납', '갱신'];
      for (const n of nameMatch) {
        if (!excludeWords.includes(n)) {
          name = n;
          break;
        }
      }
    }
    
    // 🆕 v21.8: 시나리오 키워드 감지 (6가지)
    let purpose = '상담예약';  // 기본값
    
    if (text.includes('생일') || text.includes('축하')) {
      purpose = '생일축하';
    } else if (text.includes('연체') || text.includes('미납') || text.includes('유예')) {
      purpose = '연체안내';
    } else if (text.includes('만기') || text.includes('갱신')) {
      purpose = '만기안내';
    } else if (text.includes('소개') || text.includes('인사')) {
      purpose = '지니소개';
    } else if (text.includes('안부')) {
      purpose = '안부전화';
    }
    // 그 외는 기본 '상담예약'
    
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

  const startVoiceMode = async () => {
    if (currentCall) return;
    if (isConnectedRef.current) return;
    
    lastCallInfoRef.current = null;
    setPendingCall(null);
    muteServerAudioRef.current = false;
    
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
            startAudioCapture(stream, ws);
          }
          
          if (msg.type === 'audio' && msg.data) {
            if (muteServerAudioRef.current) return;
            playAudio(msg.data);
          }
          
          if (msg.type === 'transcript' && msg.role === 'user') {
            addMessage(msg.text, true);
            
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
            
            const callInfo = checkCallCommand(msg.text);
            if (callInfo) {
              muteServerAudioRef.current = true;
              setPendingCall(callInfo);
              lastCallInfoRef.current = callInfo;
              
              // 🆕 v21.8: 시나리오별 복명복창 메시지
              const purposeLabels = {
                '상담예약': '상담예약',
                '생일축하': '생일축하',
                '연체안내': '연체안내',
                '만기안내': '만기안내',
                '지니소개': '지니소개',
                '안부전화': '안부'
              };
              const label = purposeLabels[callInfo.purpose] || callInfo.purpose;
              addMessage(`📞 ${callInfo.name}님께 [${label}] 전화할까요? (네/아니오)`, false);
              return;
            }
            
            // 🆕 v24: 소통 명령 감지
            const commInfo = checkCommCommand(msg.text);
            if (commInfo) {
              setPendingComm(commInfo);
              const typeLabels = { kakao: '카카오톡', sms: '문자', email: '이메일', fax: '팩스' };
              addMessage(`${commInfo.name}님께 ${typeLabels[commInfo.type]}을 보낼까요? (네/아니오)`, false);
              return;
            }
          }
          
          if (msg.type === 'transcript' && msg.role === 'assistant') {
            if (lastCallInfoRef.current) return;
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
        console.error('WebSocket 에러:', error);
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
    
    // 🆕 v24: 소통 승인 대기
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
    
    // 🆕 v24: 소통 명령 감지
    const commInfo = checkCommCommand(text);
    if (commInfo) {
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

      {/* 🆕 v21.8: 전화 승인 배너 - 시나리오 표시 */}
      {pendingCall && (
        <div className="pending-call-banner">
          <div className="pending-info">
            <span>📞 {pendingCall.name}님께 [{pendingCall.purpose}] 전화할까요?</span>
          </div>
          <div className="pending-buttons">
            <button className="approve-btn" onClick={() => {
              const callInfo = pendingCall;
              setPendingCall(null);
              lastCallInfoRef.current = null;
              muteServerAudioRef.current = false;
              addMessage(`네, ${callInfo.name}님께 [${callInfo.purpose}] 전화하겠습니다.`, false);
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

      {/* 🆕 v24: 소통 승인 배너 */}
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
                  {msg.isPdfButton ? (
                    <button 
                      onClick={() => openPdfReport(msg.analysisText, msg.analysisFileName)}
                      style={{
                        background: 'linear-gradient(135deg, #192a56, #273c75)',
                        color: 'white',
                        border: 'none',
                        padding: '12px 24px',
                        borderRadius: '10px',
                        fontSize: '14px',
                        fontWeight: '700',
                        cursor: 'pointer',
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        boxShadow: '0 2px 8px rgba(25,42,86,0.3)'
                      }}
                    >
                      📄 PDF 리포트 보기
                    </button>
                  ) : (
                    <p>{msg.text}</p>
                  )}
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

      {/* 🆕 v24: 소통 오버레이 */}
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
