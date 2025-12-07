import { useState, useRef, useEffect, useCallback } from 'react';
import { getAIResponse, analyzeDocument, textToSpeech } from '../services/openai';
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
  const [interimText, setInterimText] = useState('');
  
  // 파일 관련 상태
  const [uploadedFiles, setUploadedFiles] = useState([]);
  
  // Refs
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const chatAreaRef = useRef(null);
  const recognitionRef = useRef(null);
  const consultRecorderRef = useRef(null);
  const consultChunksRef = useRef([]);
  const currentAudioRef = useRef(null);
  const isProcessingRef = useRef(false);

  // Web Speech API 초기화
  const initSpeechRecognition = useCallback(() => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('이 브라우저는 음성 인식을 지원하지 않습니다. Chrome을 사용해주세요.');
      return null;
    }
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.lang = 'ko-KR';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    
    return recognition;
  }, []);

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
  }, [messages, interimText]);

  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
      }
    };
  }, []);

  const showGreeting = () => {
    const greeting = persona === 'genie' 
      ? `안녕하세요, ${user?.displayName || '설계사'}님! 👋\n\n저는 ARK 지니입니다.\n\n📷 촬영 - 서류 촬영 분석\n📎 파일 - 문서 첨부\n🎤 마이크 - 음성 질문 (텍스트 답변)\n🔊 보이스 - 양방향 음성대화\n⏺️ 녹음 - 상담 녹음 요약\n\n무엇을 도와드릴까요?`
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

  // AI 음성 즉시 중단
  const stopAISpeaking = useCallback(() => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.currentTime = 0;
      currentAudioRef.current = null;
    }
    setIsSpeaking(false);
  }, []);

  // 메시지 전송 처리
  const handleSendMessage = async (text, options = {}) => {
    const { fromVoice = false, fromMic = false } = options;
    
    if (!text || !text.trim()) return;
    if (isProcessingRef.current) return;
    
    isProcessingRef.current = true;
    setInterimText('');

    const userMessage = {
      role: 'user',
      content: text,
      timestamp: new Date(),
      files: uploadedFiles.length > 0 ? [...uploadedFiles] : null
    };

    setMessages(prev => [...prev, userMessage]);
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

      // 보이스 모드면 AI 음성 출력
      if (fromVoice && isVoiceMode) {
        await speakResponse(response);
      }
    } catch (error) {
      console.error('API Error:', error);
      addMessage('assistant', '죄송합니다. 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setLoading(false);
      isProcessingRef.current = false;
    }
  };

  // AI 음성 출력
  const speakResponse = async (text) => {
    if (!text) return;
    
    setIsSpeaking(true);
    
    try {
      const maxLength = 200;
      const textToSpeak = text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
      
      const audioUrl = await textToSpeech(textToSpeak);
      
      await new Promise((resolve, reject) => {
        const audio = new Audio(audioUrl);
        currentAudioRef.current = audio;
        
        audio.onended = () => {
          currentAudioRef.current = null;
          resolve();
        };
        audio.onerror = reject;
        
        audio.play().catch(reject);
      });
    } catch (error) {
      console.error('TTS Error:', error);
    } finally {
      setIsSpeaking(false);
      currentAudioRef.current = null;
    }
  };
  // ========== 마이크 모드 (음성→텍스트, AI는 텍스트 답변) ==========
  const handleMicMode = () => {
    if (isMicMode) {
      stopMicMode();
      return;
    }

    if (isVoiceMode) {
      stopVoiceMode();
    }

    const recognition = initSpeechRecognition();
    if (!recognition) return;

    recognitionRef.current = recognition;
    
    recognition.onstart = () => {
      setIsListening(true);
      console.log('마이크 모드 시작');
    };

    recognition.onresult = (event) => {
      let interim = '';
      let final = '';
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcript;
        } else {
          interim += transcript;
        }
      }
      
      setInterimText(interim);
      
      if (final) {
        setInterimText('');
        handleSendMessage(final, { fromMic: true });
      }
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      if (event.error === 'no-speech') {
        if (isMicMode && recognitionRef.current) {
          try {
            recognitionRef.current.start();
          } catch (e) {}
        }
      }
    };

    recognition.onend = () => {
      if (isMicMode && recognitionRef.current) {
        try {
          recognitionRef.current.start();
        } catch (e) {
          console.log('Recognition restart failed');
        }
      } else {
        setIsListening(false);
      }
    };

    try {
      recognition.start();
      setIsMicMode(true);
      addMessage('assistant', '🎤 마이크 모드가 시작되었습니다.\n\n말씀하시면 텍스트로 답변드립니다.\n마이크 버튼을 다시 누르면 종료됩니다.');
    } catch (e) {
      console.error('Recognition start error:', e);
    }
  };

  const stopMicMode = () => {
    setIsMicMode(false);
    setIsListening(false);
    setInterimText('');
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
  };

  // ========== 보이스 모드 (양방향 음성 대화) ==========
  const handleVoiceMode = () => {
    if (isVoiceMode) {
      stopVoiceMode();
      return;
    }

    if (isMicMode) {
      stopMicMode();
    }

    const recognition = initSpeechRecognition();
    if (!recognition) return;

    recognitionRef.current = recognition;
    
    recognition.onstart = () => {
      setIsListening(true);
      console.log('보이스 모드 시작');
    };

    recognition.onresult = (event) => {
      if (isSpeaking) {
        stopAISpeaking();
      }
      
      let interim = '';
      let final = '';
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcript;
        } else {
          interim += transcript;
        }
      }
      
      setInterimText(interim);
      
      if (final) {
        setInterimText('');
        handleSendMessage(final, { fromVoice: true });
      }
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      if (event.error === 'no-speech') {
        if (isVoiceMode && recognitionRef.current) {
          try {
            recognitionRef.current.start();
          } catch (e) {}
        }
      }
    };

    recognition.onend = () => {
      if (isVoiceMode && recognitionRef.current && !isSpeaking) {
        try {
          recognitionRef.current.start();
        } catch (e) {
          console.log('Recognition restart failed');
        }
      } else if (!isVoiceMode) {
        setIsListening(false);
      }
    };

    try {
      recognition.start();
      setIsVoiceMode(true);
      addMessage('assistant', '🔊 보이스 모드가 시작되었습니다.\n\n말씀하시면 음성으로 답변드립니다.\n제가 말하는 중에 말씀하시면 멈추고 들을게요.\n보이스 버튼을 다시 누르면 종료됩니다.');
    } catch (e) {
      console.error('Recognition start error:', e);
    }
  };

  const stopVoiceMode = () => {
    setIsVoiceMode(false);
    setIsListening(false);
    setInterimText('');
    stopAISpeaking();
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
  };

  useEffect(() => {
    if (isVoiceMode && !isSpeaking && !isListening && recognitionRef.current) {
      try {
        recognitionRef.current.start();
      } catch (e) {}
    }
  }, [isSpeaking, isVoiceMode, isListening]);

  // ========== 녹음 모드 (상담 녹음) ==========
  const handleRecordConsult = async () => {
    if (isRecordingConsult) {
      if (consultRecorderRef.current && consultRecorderRef.current.state === 'recording') {
        consultRecorderRef.current.stop();
      }
      return;
    }

    if (isVoiceMode) stopVoiceMode();
    if (isMicMode) stopMicMode();

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
        
        saveRecordingToStorage(audioBlob);
        
        addMessage('user', '📹 상담 녹음이 완료되었습니다. 요약을 요청합니다.');
        setLoading(true);
        
        try {
          const formData = new FormData();
          formData.append('file', audioBlob, 'recording.webm');
          
          const response = await fetch('/api/transcribe', {
            method: 'POST',
            body: formData
          });
          
          if (response.ok) {
            const data = await response.json();
            const text = data.text;
            
            if (text && text.trim()) {
              const summaryPrompt = `다음은 보험설계사와 고객의 상담 녹음 내용입니다. 분석해주세요:

1. **상담 요약** (3~5줄)
2. **파악된 고객 니즈**
3. **추천 상품/서비스**
4. **다음 상담 시 할 일**
5. **특이사항**

상담 내용:
${text}`;
              
              const aiResponse = await getAIResponse(summaryPrompt, [], persona);
              addMessage('assistant', aiResponse, { canDownload: true });
            } else {
              addMessage('assistant', '녹음 내용을 인식하지 못했습니다. 다시 시도해주세요.');
            }
          } else {
            throw new Error('Transcription failed');
          }
        } catch (error) {
          console.error('Consult recording error:', error);
          addMessage('assistant', '녹음 분석 중 오류가 발생했습니다. 녹음 파일은 저장되었습니다.');
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

  const saveRecordingToStorage = (blob) => {
    const reader = new FileReader();
    reader.onload = () => {
      const recordings = JSON.parse(localStorage.getItem('arkgenie_recordings') || '[]');
      const now = Date.now();
      
      const validRecordings = recordings.filter(r => now - r.timestamp < 24 * 60 * 60 * 1000);
      
      validRecordings.push({
        id: now,
        timestamp: now,
        data: reader.result
      });
      
      localStorage.setItem('arkgenie_recordings', JSON.stringify(validRecordings));
    };
    reader.readAsDataURL(blob);
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
        handleSendMessage('이 서류를 분석해주세요.', {});
      }, 500);
    }
  };

  const removeFile = (index) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleDownloadFile = async (content) => {
    try {
      const BOM = '\uFEFF';
      const blob = new Blob([BOM + content], { type: 'text/plain;charset=utf-8' });
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

  const handleTextSubmit = () => {
    if (!inputText.trim()) return;
    handleSendMessage(inputText, {});
    setInputText('');
  };

  const togglePersona = () => {
    setPersona(prev => prev === 'genie' ? 'professor' : 'genie');
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleTextSubmit();
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
            {isSpeaking ? (
              <>
                <div className="speaking-icon">🔊</div>
                <span>말하는 중... (말씀하시면 멈춥니다)</span>
              </>
            ) : loading ? (
              <>
                <div className="thinking-icon">💭</div>
                <span>생각 중...</span>
              </>
            ) : isListening ? (
              <>
                <div className="listening-waves">
                  <span></span><span></span><span></span><span></span><span></span>
                </div>
                <span>듣고 있습니다...</span>
              </>
            ) : (
              <>
                <div className="ready-icon">🎤</div>
                <span>준비 중...</span>
              </>
            )}
          </div>
          <button className="voice-stop-btn" onClick={handleVoiceMode}>종료</button>
        </div>
      )}

      {isMicMode && (
        <div className="mic-mode-banner">
          <div className="mic-indicator">
            {loading ? (
              <>
                <div className="thinking-icon">💭</div>
                <span>생각 중...</span>
              </>
            ) : isListening ? (
              <>
                <div className="listening-waves">
                  <span></span><span></span><span></span><span></span><span></span>
                </div>
                <span>듣고 있습니다...</span>
              </>
            ) : (
              <>
                <div className="ready-icon">🎤</div>
                <span>준비 중...</span>
              </>
            )}
          </div>
          <button className="mic-stop-btn" onClick={handleMicMode}>종료</button>
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
                <button className="action-btn" onClick={() => handleDownloadFile(msg.content)}>
                  📄 저장
                </button>
              </div>
            )}
            <div className="message-time">
              {msg.timestamp.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        ))}
        
        {interimText && (
          <div className="message user interim">
            <div className="message-bubble">
              <p>{interimText}</p>
            </div>
          </div>
        )}
        
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
            placeholder={isVoiceMode ? "보이스 모드 중..." : isMicMode ? "마이크 모드 중..." : "무엇을 도와드릴까요?"}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={loading}
          />
          <button
            className="send-btn"
            onClick={handleTextSubmit}
            disabled={loading || (!inputText.trim() && uploadedFiles.length === 0)}
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
