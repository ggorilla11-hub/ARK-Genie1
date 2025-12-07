import { useState, useRef, useEffect, useCallback } from 'react';
import { getAIResponse, analyzeDocument, transcribeAudio, textToSpeech } from '../services/openai';
import './MagicBoxPage.css';

function MagicBoxPage({ user }) {
  // 상태 관리
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [persona, setPersona] = useState('genie');
  
  // 음성 관련 상태
  const [isMicMode, setIsMicMode] = useState(false);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [isRecordingConsult, setIsRecordingConsult] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  
  // 파일 관련 상태
  const [uploadedFiles, setUploadedFiles] = useState([]);
  
  // Refs
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const chatAreaRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const consultRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const consultChunksRef = useRef([]);
  const currentAudioRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);

  // 로컬 저장소에서 대화 불러오기
  useEffect(() => {
    const savedMessages = localStorage.getItem('arkgenie_messages');
    const savedTime = localStorage.getItem('arkgenie_messages_time');
    
    if (savedMessages && savedTime) {
      const timeDiff = Date.now() - parseInt(savedTime);
      const hours24 = 24 * 60 * 60 * 1000;
      
      if (timeDiff < hours24) {
        try {
          const parsed = JSON.parse(savedMessages);
          setMessages(parsed.map(m => ({ ...m, timestamp: new Date(m.timestamp) })));
          return;
        } catch (e) {
          console.error('Failed to parse saved messages');
        }
      }
    }
    
    showGreeting();
  }, []);

  // 대화 저장
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem('arkgenie_messages', JSON.stringify(messages));
      localStorage.setItem('arkgenie_messages_time', Date.now().toString());
    }
  }, [messages]);

  // 스크롤 자동 이동
  useEffect(() => {
    if (chatAreaRef.current) {
      chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight;
    }
  }, [messages]);

  const showGreeting = () => {
    const greeting = persona === 'genie' 
      ? `안녕하세요, ${user?.displayName || '설계사'}님! 👋\n\n저는 ARK 지니입니다.\n\n📷 촬영 - 서류 촬영 분석\n📎 파일 - 문서 첨부\n🎤 마이크 - 음성으로 질문\n🔊 보이스 - 양방향 음성대화\n⏺️ 녹음 - 상담 녹음 요약\n\n무엇을 도와드릴까요?`
      : `${user?.displayName || '설계사'}님, 안녕하세요!\n\n오상열 교수입니다.\n오늘도 MDRT를 향한 여정을 함께 하겠습니다.\n\n무엇이든 물어보세요!`;
    
    setMessages([{ role: 'assistant', content: greeting, timestamp: new Date() }]);
  };

  useEffect(() => {
    if (messages.length <= 1) {
      showGreeting();
    }
  }, [persona]);

  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const addMessage = (role, content, extras = {}) => {
    const newMessage = { role, content, timestamp: new Date(), ...extras };
    setMessages(prev => [...prev, newMessage]);
    return newMessage;
  };

  const shouldShowPDF = (userMsg, aiResponse) => {
    const pdfKeywords = ['제안서', 'PDF', 'pdf', '보고서', '문서로', '저장해', '만들어줘', '작성해줘', '출력', '다운로드'];
    const hasPdfRequest = pdfKeywords.some(keyword => userMsg.includes(keyword));
    return hasPdfRequest && aiResponse.length > 200;
  };

  const stopAISpeaking = useCallback(() => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.currentTime = 0;
      currentAudioRef.current = null;
    }
    setIsSpeaking(false);
  }, []);

  const startSilenceDetection = useCallback((stream, onSilence) => {
    try {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      analyserRef.current = audioContextRef.current.createAnalyser();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);
      analyserRef.current.fftSize = 512;
      
      const bufferLength = analyserRef.current.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      
      let silenceStart = null;
      const SILENCE_THRESHOLD = 10;
      const SILENCE_DURATION = 1500;
      
      const checkSilence = () => {
        if (!analyserRef.current) return;
        
        analyserRef.current.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / bufferLength;
        
        if (average < SILENCE_THRESHOLD) {
          if (!silenceStart) {
            silenceStart = Date.now();
          } else if (Date.now() - silenceStart > SILENCE_DURATION) {
            onSilence();
            return;
          }
        } else {
          silenceStart = null;
        }
        
        silenceTimerRef.current = requestAnimationFrame(checkSilence);
      };
      
      checkSilence();
    } catch (e) {
      console.error('Silence detection error:', e);
    }
  }, []);

  const stopSilenceDetection = useCallback(() => {
    if (silenceTimerRef.current) {
      cancelAnimationFrame(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
  }, []);

  const handleSendMessage = async (text = inputText, options = {}) => {
    const { fromVoice = false, fromMic = false } = options;
    
    if (!text.trim() && uploadedFiles.length === 0) return;
    if (loading) return;

    const userMessage = {
      role: 'user',
      content: text || '서류 분석을 요청합니다',
      timestamp: new Date(),
      files: uploadedFiles.length > 0 ? [...uploadedFiles] : null
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    const filesToProcess = [...uploadedFiles];
    setUploadedFiles([]);
    setLoading(true);

    try {
      let response;
      
      if (filesToProcess.length > 0 && filesToProcess.some(f => f.type.startsWith('image/'))) {
        const imageFile = filesToProcess.find(f => f.type.startsWith('image/'));
        const base64 = await fileToBase64(imageFile.file);
        response = await analyzeDocument(base64);
      } else {
        const history = messages.slice(-10).map(msg => ({ role: msg.role, content: msg.content }));
        response = await getAIResponse(text, history, persona);
      }

      const showPdf = shouldShowPDF(text, response);
      addMessage('assistant', response, { canDownload: showPdf });

      if (fromVoice && isVoiceMode) {
        await speakResponse(response);
      }
    } catch (error) {
      console.error('API Error:', error);
      addMessage('assistant', '죄송합니다. 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setLoading(false);
      
      if (fromVoice && isVoiceMode && !isSpeaking) {
        setTimeout(() => startVoiceListening(), 500);
      }
    }
  };

  const speakResponse = async (text) => {
    if (!text || !isVoiceMode) return;
    
    setIsSpeaking(true);
    
    try {
      const sentences = text.match(/[^.!?。]+[.!?。]?/g) || [text];
      
      for (const sentence of sentences) {
        if (!isVoiceMode || isListening) {
          stopAISpeaking();
          break;
        }
        
        const trimmed = sentence.trim();
        if (trimmed.length < 2) continue;
        
        try {
          const audioUrl = await textToSpeech(trimmed.substring(0, 500));
          
          if (!isVoiceMode || isListening) {
            stopAISpeaking();
            break;
          }
          
          await new Promise((resolve, reject) => {
            const audio = new Audio(audioUrl);
            currentAudioRef.current = audio;
            
            audio.onended = resolve;
            audio.onerror = reject;
            
            audio.play().catch(reject);
          });
        } catch (e) {
          console.error('TTS sentence error:', e);
        }
      }
    } catch (error) {
      console.error('TTS Error:', error);
    } finally {
      setIsSpeaking(false);
      currentAudioRef.current = null;
    }
  };
  // ========== 마이크 모드 ==========
  const handleMicMode = async () => {
    if (isMicMode) {
      stopMicRecording();
      return;
    }

    if (isVoiceMode) {
      setIsVoiceMode(false);
      stopAISpeaking();
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        stopSilenceDetection();
        
        if (audioChunksRef.current.length === 0) {
          setIsMicMode(false);
          return;
        }
        
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        
        if (audioBlob.size < 1000) {
          setIsMicMode(false);
          return;
        }
        
        setLoading(true);
        try {
          const text = await transcribeAudio(audioBlob);
          if (text && text.trim()) {
            await handleSendMessage(text, { fromMic: true });
          }
        } catch (error) {
          console.error('Transcription error:', error);
          addMessage('assistant', '음성 인식에 실패했습니다. 다시 시도해주세요.');
        }
        setLoading(false);
        setIsMicMode(false);
      };

      startSilenceDetection(stream, () => {
        stopMicRecording();
      });

      mediaRecorder.start();
      setIsMicMode(true);
    } catch (error) {
      console.error('Mic error:', error);
      alert('마이크 접근 권한이 필요합니다.');
    }
  };

  const stopMicRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    stopSilenceDetection();
  };

  // ========== 보이스 모드 ==========
  const handleVoiceMode = () => {
    if (isVoiceMode) {
      setIsVoiceMode(false);
      setIsListening(false);
      stopAISpeaking();
      stopVoiceRecording();
      return;
    }

    if (isMicMode) {
      setIsMicMode(false);
      stopMicRecording();
    }

    setIsVoiceMode(true);
    addMessage('assistant', '🔊 보이스 모드가 시작되었습니다.\n\n말씀하시면 제가 음성으로 답변드립니다.\n대화 중 말씀하시면 제가 멈추고 들을게요.');
    
    setTimeout(() => startVoiceListening(), 500);
  };

  const startVoiceListening = async () => {
    if (!isVoiceMode || isListening || isSpeaking) return;
    
    stopAISpeaking();
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        stopSilenceDetection();
        setIsListening(false);
        
        if (!isVoiceMode) return;
        
        if (audioChunksRef.current.length === 0) {
          setTimeout(() => startVoiceListening(), 500);
          return;
        }
        
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        
        if (audioBlob.size < 1000) {
          setTimeout(() => startVoiceListening(), 500);
          return;
        }
        
        setLoading(true);
        try {
          const text = await transcribeAudio(audioBlob);
          if (text && text.trim()) {
            await handleSendMessage(text, { fromVoice: true });
          } else {
            setTimeout(() => startVoiceListening(), 500);
          }
        } catch (error) {
          console.error('Voice transcription error:', error);
          setTimeout(() => startVoiceListening(), 500);
        }
        setLoading(false);
      };

      startSilenceDetection(stream, () => {
        stopVoiceRecording();
      });

      mediaRecorder.start();
      setIsListening(true);
    } catch (error) {
      console.error('Voice listening error:', error);
      setIsListening(false);
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    stopSilenceDetection();
  };

  useEffect(() => {
    if (isListening && isSpeaking) {
      stopAISpeaking();
    }
  }, [isListening, isSpeaking, stopAISpeaking]);

  // ========== 녹음 모드 ==========
  const handleRecordConsult = async () => {
    if (isRecordingConsult) {
      if (consultRecorderRef.current && consultRecorderRef.current.state === 'recording') {
        consultRecorderRef.current.stop();
      }
      return;
    }

    if (isVoiceMode) {
      setIsVoiceMode(false);
      stopAISpeaking();
      stopVoiceRecording();
    }
    if (isMicMode) {
      setIsMicMode(false);
      stopMicRecording();
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      consultRecorderRef.current = mediaRecorder;
      consultChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          consultChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        setIsRecordingConsult(false);
        
        if (consultChunksRef.current.length === 0) return;
        
        const audioBlob = new Blob(consultChunksRef.current, { type: 'audio/webm' });
        
        addMessage('user', '📹 상담 녹음이 완료되었습니다. 요약을 요청합니다.');
        setLoading(true);
        
        try {
          const text = await transcribeAudio(audioBlob);
          
          if (text && text.trim()) {
            const summaryPrompt = `다음은 보험설계사와 고객의 상담 녹음 내용입니다. 분석해주세요:

1. **상담 요약** (3~5줄)
2. **파악된 고객 니즈**
3. **추천 상품/서비스**
4. **다음 상담 시 할 일**
5. **특이사항**

상담 내용:
${text}`;
            
            const response = await getAIResponse(summaryPrompt, [], persona);
            addMessage('assistant', response, { canDownload: true });
          } else {
            addMessage('assistant', '녹음 내용을 인식하지 못했습니다. 다시 시도해주세요.');
          }
        } catch (error) {
          console.error('Consult recording error:', error);
          addMessage('assistant', '녹음 분석 중 오류가 발생했습니다.');
        }
        setLoading(false);
      };

      mediaRecorder.start();
      setIsRecordingConsult(true);
      addMessage('assistant', '🔴 상담 녹음을 시작합니다.\n\n녹음을 마치시려면 녹음 버튼을 다시 눌러주세요.');
    } catch (error) {
      console.error('Consult record error:', error);
      alert('마이크 접근 권한이 필요합니다.');
    }
  };

  // ========== 파일/카메라 ==========
  const handleCamera = () => {
    cameraInputRef.current?.click();
  };

  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e, isCamera = false) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    const newFiles = files.map(file => ({
      file,
      name: file.name,
      type: file.type,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
      isCamera
    }));

    setUploadedFiles(prev => [...prev, ...newFiles]);
    e.target.value = '';

    if (isCamera && newFiles.length > 0) {
      setTimeout(() => {
        handleSendMessage('이 서류를 분석해주세요.');
      }, 500);
    }
  };

  const removeFile = (index) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleDownloadPDF = async (content) => {
    try {
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ARK지니_분석결과_${new Date().toLocaleDateString('ko-KR').replace(/\./g, '')}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download error:', error);
      alert('다운로드에 실패했습니다.');
    }
  };

  const togglePersona = () => {
    setPersona(prev => prev === 'genie' ? 'professor' : 'genie');
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const clearChat = () => {
    localStorage.removeItem('arkgenie_messages');
    localStorage.removeItem('arkgenie_messages_time');
    showGreeting();
  };

  // ========== 렌더링 ==========
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
            {isListening ? (
              <>
                <div className="listening-waves">
                  <span></span><span></span><span></span><span></span><span></span>
                </div>
                <span>듣고 있습니다...</span>
              </>
            ) : isSpeaking ? (
              <>
                <div className="speaking-icon">🔊</div>
                <span>말하는 중...</span>
              </>
            ) : loading ? (
              <>
                <div className="thinking-icon">💭</div>
                <span>생각 중...</span>
              </>
            ) : (
              <>
                <div className="ready-icon">🎤</div>
                <span>말씀해주세요</span>
              </>
            )}
          </div>
          <button className="voice-stop-btn" onClick={handleVoiceMode}>종료</button>
        </div>
      )}

      {isRecordingConsult && (
        <div className="recording-banner">
          <div className="rec-indicator">
            <div className="rec-dot"></div>
            <span>상담 녹음 중...</span>
          </div>
          <button className="rec-stop-btn" onClick={handleRecordConsult}>녹음 종료</button>
        </div>
      )}

      <div className="chat-area" ref={chatAreaRef}>
        {messages.map((msg, index) => (
          <div key={index} className={`message ${msg.role}`}>
            {msg.files && (
              <div className="message-files">
                {msg.files.map((file, i) => (
                  <div key={i} className="file-preview-msg">
                    {file.preview ? (
                      <img src={file.preview} alt={file.name} />
                    ) : (
                      <span className="file-icon">📄</span>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="message-bubble">
              {msg.content.split('\n').map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
            {msg.role === 'assistant' && msg.canDownload && (
              <div className="message-actions">
                <button className="action-btn" onClick={() => handleDownloadPDF(msg.content)}>
                  📄 저장
                </button>
              </div>
            )}
            <div className="message-time">
              {msg.timestamp.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        ))}
        
        {loading && (
          <div className="message assistant">
            <div className="typing-indicator">
              <span></span><span></span><span></span>
            </div>
          </div>
        )}
      </div>

      <div className="input-area">
        {uploadedFiles.length > 0 && (
          <div className="uploaded-files">
            {uploadedFiles.map((file, index) => (
              <div key={index} className="uploaded-file">
                {file.preview ? (
                  <img src={file.preview} alt={file.name} />
                ) : (
                  <span className="file-icon">📄</span>
                )}
                <button className="remove-file" onClick={() => removeFile(index)}>×</button>
              </div>
            ))}
          </div>
        )}

        <div className="input-tools">
          <button className="tool-btn" onClick={handleCamera} title="카메라">
            <span className="tool-icon">📷</span>
            <span className="tool-label">촬영</span>
          </button>
          <button className="tool-btn" onClick={handleFileSelect} title="파일 첨부">
            <span className="tool-icon">📎</span>
            <span className="tool-label">파일</span>
          </button>
          <button 
            className={`tool-btn ${isMicMode ? 'active recording' : ''}`} 
            onClick={handleMicMode}
            title="마이크 (텍스트 답변)"
          >
            <span className="tool-icon">🎤</span>
            <span className="tool-label">마이크</span>
          </button>
          <button 
            className={`tool-btn ${isVoiceMode ? 'active' : ''}`} 
            onClick={handleVoiceMode}
            title="보이스 (음성 대화)"
          >
            <span className="tool-icon">🔊</span>
            <span className="tool-label">보이스</span>
          </button>
          <button 
            className={`tool-btn ${isRecordingConsult ? 'active recording' : ''}`} 
            onClick={handleRecordConsult}
            title="상담 녹음"
          >
            <span className="tool-icon">⏺️</span>
            <span className="tool-label">녹음</span>
          </button>
        </div>

        <div className="text-input-row">
          <input
            type="text"
            className="text-input"
            placeholder={isVoiceMode ? "보이스 모드 중..." : "무엇을 도와드릴까요?"}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={loading || isVoiceMode || isMicMode}
          />
          <button
            className="send-btn"
            onClick={() => handleSendMessage()}
            disabled={loading || isVoiceMode || isMicMode || (!inputText.trim() && uploadedFiles.length === 0)}
          >
            ➤
          </button>
        </div>

        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={(e) => handleFileChange(e, true)}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.pdf,.doc,.docx"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => handleFileChange(e, false)}
        />
      </div>
    </div>
  );
}

export default MagicBoxPage;
