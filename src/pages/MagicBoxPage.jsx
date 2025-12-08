import { useState, useRef, useEffect, useCallback } from 'react';
import { getAIResponse, analyzeDocument, textToSpeech } from '../services/openai';
import './MagicBoxPage.css';

function MagicBoxPage({ user }) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [persona, setPersona] = useState('genie');
  const [isMicMode, setIsMicMode] = useState(false);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [isRecordingConsult, setIsRecordingConsult] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [currentTranscript, setCurrentTranscript] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState([]);

  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const chatAreaRef = useRef(null);
  const recognitionRef = useRef(null);
  const consultRecorderRef = useRef(null);
  const consultChunksRef = useRef([]);
  const currentAudioRef = useRef(null);
  const isProcessingRef = useRef(false);
  const voiceModeRef = useRef(false);
  const micModeRef = useRef(false);
  const silenceTimeoutRef = useRef(null);
  const accumulatedTranscriptRef = useRef('');

  useEffect(() => {
    const savedMessages = localStorage.getItem('arkgenie_messages');
    const savedTime = localStorage.getItem('arkgenie_messages_time');
    if (savedMessages && savedTime) {
      const timeDiff = Date.now() - parseInt(savedTime);
      if (timeDiff < 24 * 60 * 60 * 1000) {
        try {
          const parsed = JSON.parse(savedMessages);
          setMessages(parsed.map(m => ({ ...m, timestamp: new Date(m.timestamp) })));
          return;
        } catch (e) {}
      }
    }
    showGreeting();
  }, []);

  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem('arkgenie_messages', JSON.stringify(messages));
      localStorage.setItem('arkgenie_messages_time', Date.now().toString());
    }
  }, [messages]);

  useEffect(() => {
    if (chatAreaRef.current) {
      chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight;
    }
  }, [messages, currentTranscript]);

  useEffect(() => {
    return () => stopAllModes();
  }, []);

  const stopAllModes = () => {
    if (recognitionRef.current) { try { recognitionRef.current.stop(); } catch(e) {} recognitionRef.current = null; }
    if (currentAudioRef.current) { currentAudioRef.current.pause(); currentAudioRef.current = null; }
    if (silenceTimeoutRef.current) { clearTimeout(silenceTimeoutRef.current); silenceTimeoutRef.current = null; }
    voiceModeRef.current = false;
    micModeRef.current = false;
  };

  const showGreeting = () => {
    const greeting = persona === 'genie'
      ? `안녕하세요, ${user?.displayName || '설계사'}님! 👋\n\n저는 ARK 지니입니다.\n\n📷 촬영 - 서류 촬영 분석\n📎 파일 - 문서 첨부\n🎤 마이크 - 음성 질문\n🔊 보이스 - 음성 대화\n⏺️ 녹음 - 상담 녹음\n\n무엇을 도와드릴까요?`
      : `${user?.displayName || '설계사'}님, 반갑습니다!\n\n오상열 교수입니다.\nCFP(국제공인재무설계사)로서 자네의 성장을 돕겠네.\n\n무엇이든 물어보게!`;
    setMessages([{ role: 'assistant', content: greeting, timestamp: new Date() }]);
  };

  useEffect(() => {
    showGreeting();
  }, [persona]);

  const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const addMessage = (role, content, extras = {}) => {
    setMessages(prev => [...prev, { role, content, timestamp: new Date(), ...extras }]);
  };

  const stopAISpeaking = useCallback(() => {
    if (currentAudioRef.current) { currentAudioRef.current.pause(); currentAudioRef.current = null; }
    setIsSpeaking(false);
  }, []);

  const speakResponse = async (text) => {
    if (!text || !voiceModeRef.current) return;
    setIsSpeaking(true);
    try {
      const audioUrl = await textToSpeech(text, persona);
      if (!voiceModeRef.current) { setIsSpeaking(false); return; }
      const audio = new Audio(audioUrl);
      currentAudioRef.current = audio;
      audio.onended = () => { currentAudioRef.current = null; setIsSpeaking(false); if (voiceModeRef.current) setTimeout(() => startListening('voice'), 500); };
      audio.onerror = () => { currentAudioRef.current = null; setIsSpeaking(false); if (voiceModeRef.current) setTimeout(() => startListening('voice'), 500); };
      await audio.play();
    } catch (error) {
      setIsSpeaking(false);
      if (voiceModeRef.current) setTimeout(() => startListening('voice'), 500);
    }
  };

  const processWithFiles = async (text, mode, files) => {
    if (!text?.trim() || isProcessingRef.current) return;
    isProcessingRef.current = true;
    const userMsg = { role: 'user', content: text.trim(), timestamp: new Date(), files: files?.length > 0 ? [...files] : null };
    setMessages(prev => [...prev, userMsg]);
    setUploadedFiles([]);
    setLoading(true);
    try {
      let response;
      if (files?.length > 0 && files.some(f => f.type.startsWith('image/'))) {
        const img = files.find(f => f.type.startsWith('image/'));
        const base64 = await fileToBase64(img.file);
        response = await analyzeDocument(base64, text);
      } else {
        const history = messages.slice(-10).map(m => ({ role: m.role, content: m.content }));
        response = await getAIResponse(text, history, persona);
      }
      addMessage('assistant', response);
      if (mode === 'voice' && voiceModeRef.current) await speakResponse(response);
      else if (mode === 'mic' && micModeRef.current) setTimeout(() => startListening('mic'), 500);
    } catch (error) {
      addMessage('assistant', '죄송합니다. 오류가 발생했습니다.');
      if (mode === 'voice' && voiceModeRef.current) setTimeout(() => startListening('voice'), 500);
      else if (mode === 'mic' && micModeRef.current) setTimeout(() => startListening('mic'), 500);
    } finally {
      setLoading(false);
      isProcessingRef.current = false;
    }
  };

  const handleSendMessage = async (text) => {
    if (!text?.trim() || isProcessingRef.current) return;
    isProcessingRef.current = true;
    const files = [...uploadedFiles];
    const userMsg = { role: 'user', content: text, timestamp: new Date(), files: files.length > 0 ? files : null };
    setMessages(prev => [...prev, userMsg]);
    setUploadedFiles([]);
    setLoading(true);
    try {
      let response;
      if (files.length > 0 && files.some(f => f.type.startsWith('image/'))) {
        const img = files.find(f => f.type.startsWith('image/'));
        const base64 = await fileToBase64(img.file);
        response = await analyzeDocument(base64, text);
      } else {
        const history = messages.slice(-10).map(m => ({ role: m.role, content: m.content }));
        response = await getAIResponse(text, history, persona);
      }
      addMessage('assistant', response);
    } catch (error) {
      addMessage('assistant', '죄송합니다. 오류가 발생했습니다.');
    } finally {
      setLoading(false);
      isProcessingRef.current = false;
    }
  };

  const startListening = (mode) => {
    if (isProcessingRef.current || isSpeaking) return;
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('Chrome 브라우저를 사용해주세요.');
      return;
    }
    if (recognitionRef.current) { try { recognitionRef.current.stop(); } catch(e) {} recognitionRef.current = null; }
    if (silenceTimeoutRef.current) { clearTimeout(silenceTimeoutRef.current); silenceTimeoutRef.current = null; }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'ko-KR';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognitionRef.current = recognition;
    accumulatedTranscriptRef.current = '';
    const currentFiles = [...uploadedFiles];

    recognition.onstart = () => { setIsListening(true); setCurrentTranscript(''); };
    recognition.onresult = (event) => {
      let interim = '', final = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += t; else interim += t;
      }
      if (final) accumulatedTranscriptRef.current += final;
      setCurrentTranscript(accumulatedTranscriptRef.current + interim);
      if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = setTimeout(() => {
        if (accumulatedTranscriptRef.current.trim() && recognitionRef.current) {
          try { recognitionRef.current.stop(); } catch(e) {}
        }
      }, 2000);
    };
    recognition.onerror = (event) => {
      if (event.error === 'no-speech' && ((mode === 'voice' && voiceModeRef.current) || (mode === 'mic' && micModeRef.current))) {
        setTimeout(() => startListening(mode), 300);
      }
    };
    recognition.onend = () => {
      setIsListening(false);
      setCurrentTranscript('');
      if (silenceTimeoutRef.current) { clearTimeout(silenceTimeoutRef.current); silenceTimeoutRef.current = null; }
      const finalText = accumulatedTranscriptRef.current.trim();
      accumulatedTranscriptRef.current = '';
      if (finalText) processWithFiles(finalText, mode, currentFiles);
      else if ((mode === 'voice' && voiceModeRef.current && !isSpeaking) || (mode === 'mic' && micModeRef.current)) {
        setTimeout(() => startListening(mode), 300);
      }
    };
    try { recognition.start(); } catch(e) {}
  };

  const handleMicMode = () => {
    if (isMicMode) {
      micModeRef.current = false; setIsMicMode(false); setIsListening(false); setCurrentTranscript('');
      if (silenceTimeoutRef.current) { clearTimeout(silenceTimeoutRef.current); silenceTimeoutRef.current = null; }
      if (recognitionRef.current) { try { recognitionRef.current.stop(); } catch(e) {} recognitionRef.current = null; }
      return;
    }
    if (isVoiceMode) { voiceModeRef.current = false; setIsVoiceMode(false); stopAISpeaking(); }
    micModeRef.current = true; setIsMicMode(true);
    const msg = uploadedFiles.length > 0 ? '🎤 마이크 모드 (파일 첨부됨)\n\n말씀하시면 파일과 함께 분석합니다.' : '🎤 마이크 모드\n\n말씀하시면 텍스트로 답변드립니다.';
    addMessage('assistant', msg);
    setTimeout(() => startListening('mic'), 500);
  };

  const handleVoiceMode = () => {
    if (isVoiceMode) {
      voiceModeRef.current = false; setIsVoiceMode(false); setIsListening(false); setCurrentTranscript(''); stopAISpeaking();
      if (silenceTimeoutRef.current) { clearTimeout(silenceTimeoutRef.current); silenceTimeoutRef.current = null; }
      if (recognitionRef.current) { try { recognitionRef.current.stop(); } catch(e) {} recognitionRef.current = null; }
      return;
    }
    if (isMicMode) { micModeRef.current = false; setIsMicMode(false); }
    voiceModeRef.current = true; setIsVoiceMode(true);
    const msg = uploadedFiles.length > 0 ? '🔊 보이스 모드 (파일 첨부됨)\n\n말씀하시면 파일 분석 후 음성으로 답변드립니다.' : '🔊 보이스 모드\n\n말씀하시면 음성으로 답변드립니다.';
    addMessage('assistant', msg);
    setTimeout(() => startListening('voice'), 500);
  };

  const handleRecordConsult = async () => {
    if (isRecordingConsult) {
      if (consultRecorderRef.current?.state === 'recording') consultRecorderRef.current.stop();
      return;
    }
    if (isVoiceMode) { voiceModeRef.current = false; setIsVoiceMode(false); stopAISpeaking(); }
    if (isMicMode) { micModeRef.current = false; setIsMicMode(false); }
    if (recognitionRef.current) { try { recognitionRef.current.stop(); } catch(e) {} recognitionRef.current = null; }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      consultRecorderRef.current = mediaRecorder;
      consultChunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) consultChunksRef.current.push(e.data); };
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setIsRecordingConsult(false);
        if (consultChunksRef.current.length === 0) return;
        const audioBlob = new Blob(consultChunksRef.current, { type: 'audio/webm' });
        addMessage('user', '📹 상담 녹음 완료');
        setLoading(true);
        try {
          const formData = new FormData();
          formData.append('file', audioBlob, 'recording.webm');
          formData.append('model', 'whisper-1');
          formData.append('language', 'ko');
          const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;
          const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST', headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` }, body: formData
          });
          if (res.ok) {
            const data = await res.json();
            if (data.text?.trim()) {
              const prompt = `상담 녹음 분석:\n1. 요약\n2. 고객 니즈\n3. 추천 상품\n4. 다음 할 일\n\n내용:\n${data.text}`;
              const aiRes = await getAIResponse(prompt, [], persona);
              addMessage('assistant', aiRes);
            } else addMessage('assistant', '녹음 내용을 인식하지 못했습니다.');
          } else throw new Error();
        } catch { addMessage('assistant', '녹음 분석 중 오류가 발생했습니다.'); }
        setLoading(false);
      };
      mediaRecorder.start();
      setIsRecordingConsult(true);
      addMessage('assistant', '🔴 상담 녹음 중...\n\n녹음 버튼을 다시 누르면 종료됩니다.');
    } catch { alert('마이크 접근 권한이 필요합니다.'); }
  };

  const handleCamera = () => cameraInputRef.current?.click();
  const handleFileSelect = () => fileInputRef.current?.click();
  const handleFileChange = (e, isCamera = false) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    const newFiles = files.map(file => ({
      file, name: file.name, type: file.type,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null, isCamera
    }));
    setUploadedFiles(prev => [...prev, ...newFiles]);
    e.target.value = '';
    if (isCamera && newFiles.length > 0) setTimeout(() => handleSendMessage('이 서류를 분석해주세요.'), 500);
  };
  const removeFile = (index) => setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  const handleTextSubmit = () => { if (inputText.trim()) { handleSendMessage(inputText); setInputText(''); } };
  const handleKeyPress = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleTextSubmit(); } };
  const clearChat = () => { localStorage.removeItem('arkgenie_messages'); localStorage.removeItem('arkgenie_messages_time'); showGreeting(); };
  const togglePersona = () => setPersona(p => p === 'genie' ? 'professor' : 'genie');

  return (
    <div className="magicbox-page">
      <div className="magicbox-header">
        <div className="header-left">
          <span className="header-icon">🧞</span>
          <span className="header-title">매직박스</span>
          <span className="pro-badge">PRO</span>
        </div>
        <div className="header-right">
          <button className="clear-btn" onClick={clearChat} title="대화 초기화">🗑️</button>
          <button className="mode-toggle" onClick={togglePersona}>
            {persona === 'genie' ? '🎓 교수님' : '🧞 지니'}
          </button>
        </div>
      </div>

      {isVoiceMode && (
        <div className="voice-mode-banner">
          <div className="voice-indicator">
            {isSpeaking ? <><div className="speaking-icon">🔊</div><span>말하는 중...</span></> :
             loading ? <><div className="thinking-icon">💭</div><span>생각 중...</span></> :
             isListening ? <><div className="listening-waves"><span></span><span></span><span></span><span></span><span></span></div><span>듣고 있습니다...</span></> :
             <><div className="ready-icon">🎤</div><span>준비 중...</span></>}
          </div>
          <button className="voice-stop-btn" onClick={handleVoiceMode}>종료</button>
        </div>
      )}

      {isMicMode && (
        <div className="mic-mode-banner">
          <div className="mic-indicator">
            {loading ? <><div className="thinking-icon">💭</div><span>생각 중...</span></> :
             isListening ? <><div className="listening-waves"><span></span><span></span><span></span><span></span><span></span></div><span>듣고 있습니다...</span></> :
             <><div className="ready-icon">🎤</div><span>준비 중...</span></>}
          </div>
          <button className="mic-stop-btn" onClick={handleMicMode}>종료</button>
        </div>
      )}

      {isRecordingConsult && (
        <div className="recording-banner">
          <div className="rec-indicator"><div className="rec-dot"></div><span>상담 녹음 중...</span></div>
          <button className="rec-stop-btn" onClick={handleRecordConsult}>녹음 종료</button>
        </div>
      )}

      <div className="chat-area" ref={chatAreaRef}>
        {messages.map((msg, i) => (
          <div key={i} className={`message ${msg.role}`}>
            {msg.files && <div className="message-files">{msg.files.map((f, j) => (
              <div key={j} className="file-preview-msg">{f.preview ? <img src={f.preview} alt={f.name} /> : <span className="file-icon">📄</span>}</div>
            ))}</div>}
            <div className="message-bubble">{msg.content.split('\n').map((line, j) => <p key={j}>{line}</p>)}</div>
            <div className="message-time">{msg.timestamp.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</div>
          </div>
        ))}
        {currentTranscript && <div className="message user interim"><div className="message-bubble"><p>{currentTranscript}</p></div></div>}
        {loading && <div className="message assistant"><div className="typing-indicator"><span></span><span></span><span></span></div></div>}
      </div>

      <div className="input-area">
        {uploadedFiles.length > 0 && (
          <div className="uploaded-files">{uploadedFiles.map((file, i) => (
            <div key={i} className="uploaded-file">
              {file.preview ? <img src={file.preview} alt={file.name} /> : <span className="file-icon">📄</span>}
              <button className="remove-file" onClick={() => removeFile(i)}>×</button>
            </div>
          ))}</div>
        )}
        <div className="input-tools">
          <button className="tool-btn" onClick={handleCamera}><span className="tool-icon">📷</span><span className="tool-label">촬영</span></button>
          <button className="tool-btn" onClick={handleFileSelect}><span className="tool-icon">📎</span><span className="tool-label">파일</span></button>
          <button className={`tool-btn ${isMicMode ? 'active recording' : ''}`} onClick={handleMicMode}><span className="tool-icon">🎤</span><span className="tool-label">마이크</span></button>
          <button className={`tool-btn ${isVoiceMode ? 'active' : ''}`} onClick={handleVoiceMode}><span className="tool-icon">🔊</span><span className="tool-label">보이스</span></button>
          <button className={`tool-btn ${isRecordingConsult ? 'active recording' : ''}`} onClick={handleRecordConsult}><span className="tool-icon">⏺️</span><span className="tool-label">녹음</span></button>
        </div>
        <div className="text-input-row">
          <input type="text" className="text-input" placeholder={isVoiceMode ? "보이스 모드 중..." : isMicMode ? "마이크 모드 중..." : "무엇을 도와드릴까요?"} value={inputText} onChange={(e) => setInputText(e.target.value)} onKeyPress={handleKeyPress} disabled={loading} />
          <button className="send-btn" onClick={handleTextSubmit} disabled={loading || (!inputText.trim() && uploadedFiles.length === 0)}>➤</button>
        </div>
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => handleFileChange(e, true)} />
        <input ref={fileInputRef} type="file" accept="image/*,.pdf,.doc,.docx" multiple style={{ display: 'none' }} onChange={(e) => handleFileChange(e, false)} />
      </div>
    </div>
  );
}

export default MagicBoxPage;
