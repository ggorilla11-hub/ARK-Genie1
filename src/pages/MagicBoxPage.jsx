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
  const [currentTranscript, setCurrentTranscript] = useState('');
  
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
  const voiceModeRef = useRef(false);
  const micModeRef = useRef(false);
  const finalTranscriptRef = useRef('');
  const silenceTimeoutRef = useRef(null);

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
  }, [messages, currentTranscript]);

  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      stopAllModes();
    };
  }, []);

  const stopAllModes = () => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch(e) {}
      recognitionRef.current = null;
    }
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
    voiceModeRef.current = false;
    micModeRef.current = false;
  };

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
    console.log('AI 음성 중단');
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.currentTime = 0;
      currentAudioRef.current = null;
    }
    setIsSpeaking(false);
  }, []);

  // AI 음성 출력 (보이스 모드 전용)
  const speakText = async (text) => {
    if (!text || !voiceModeRef.current) {
      console.log('TTS 스킵: voiceMode=', voiceModeRef.current);
      return;
    }
    
    console.log('TTS 시작 요청:', text.substring(0, 30));
    setIsSpeaking(true);
    
    try {
      const audioUrl = await textToSpeech(text);
      console.log('TTS URL 받음:', audioUrl);
      
      if (!voiceModeRef.current) {
        console.log('TTS 취소: 보이스 모드 종료됨');
        setIsSpeaking(false);
        return;
      }
      
      const audio = new Audio(audioUrl);
      currentAudioRef.current = audio;
      
      audio.onplay = () => {
        console.log('오디오 재생 시작');
      };
      
      audio.onended = () => {
        console.log('오디오 재생 완료');
        currentAudioRef.current = null;
        setIsSpeaking(false);
        
        // 보이스 모드면 다시 듣기
        if (voiceModeRef.current) {
          setTimeout(() => {
            startListening('voice');
          }, 500);
        }
      };
      
      audio.onerror = (e) => {
        console.error('오디오 재생 오류:', e);
        currentAudioRef.current = null;
        setIsSpeaking(false);
        
        if (voiceModeRef.current) {
          setTimeout(() => {
            startListening('voice');
          }, 500);
        }
      };
      
      await audio.play();
      console.log('audio.play() 호출 성공');
      
    } catch (error) {
      console.error('TTS 오류:', error);
      setIsSpeaking(false);
      
      if (voiceModeRef.current) {
        setTimeout(() => {
          startListening('voice');
        }, 500);
      }
    }
  };

  // 메시지 처리
  const processMessage = async (text, mode) => {
    if (!text || !text.trim() || isProcessingRef.current) {
      console.log('메시지 처리 스킵');
      return;
    }
    
    console.log('메시지 처리 시작:', text, '모드:', mode);
    isProcessingRef.current = true;

    const userMessage = {
      role: 'user',
      content: text.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setLoading(true);

    try {
      const history = messages.slice(-10).map(msg => ({ role: msg.role, content: msg.content }));
      const response = await getAIResponse(text, history, persona);
      const showPdf = shouldShowPDF(text, response);
      addMessage('assistant', response, { canDownload: showPdf });
      
      // 보이스 모드면 음성 출력
      if (mode === 'voice' && voiceModeRef.current) {
        console.log('보이스 모드 - TTS 호출');
        await speakText(response);
      } else if (mode === 'mic' && micModeRef.current) {
        // 마이크 모드면 다시 듣기
        setTimeout(() => {
          startListening('mic');
        }, 500);
      }
    } catch (error) {
      console.error('API Error:', error);
      addMessage('assistant', '죄송합니다. 오류가 발생했습니다. 다시 시도해주세요.');
      
      // 에러 나도 다시 듣기
      if (mode === 'voice' && voiceModeRef.current) {
        setTimeout(() => startListening('voice'), 500);
      } else if (mode === 'mic' && micModeRef.current) {
        setTimeout(() => startListening('mic'), 500);
      }
    } finally {
      setLoading(false);
      isProcessingRef.current = false;
    }
  };

  // 일반 텍스트/파일 전송
  const handleSendMessage = async (text) => {
    if (!text || !text.trim()) return;
    if (isProcessingRef.current) return;
    
    isProcessingRef.current = true;

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
    } catch (error) {
      console.error('API Error:', error);
      addMessage('assistant', '죄송합니다. 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setLoading(false);
      isProcessingRef.current = false;
    }
  };

  // ========== 음성 인식 시작 ==========
  const startListening = (mode) => {
    console.log('듣기 시작:', mode);
    
    if (isProcessingRef.current || isSpeaking) {
      console.log('듣기 스킵 - 처리중 또는 말하는중');
      return;
    }

    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('이 브라우저는 음성 인식을 지원하지 않습니다. Chrome을 사용해주세요.');
      return;
    }

    // 기존 인식 중지
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch(e) {}
      recognitionRef.current = null;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.lang = 'ko-KR';
    recognition.continuous = false;  // 한 문장씩 처리
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognitionRef.current = recognition;
    finalTranscriptRef.current = '';
    
    recognition.onstart = () => {
      console.log('음성 인식 시작');
      setIsListening(true);
      setCurrentTranscript('');
    };

    recognition.onresult = (event) => {
      let interim = '';
      let final = '';
      
      for (let i = 0; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcript;
        } else {
          interim += transcript;
        }
      }
      
      // 중간 결과 표시
      setCurrentTranscript(interim || final);
      
      if (final) {
        finalTranscriptRef.current = final;
        console.log('최종 인식:', final);
      }
    };

    recognition.onerror = (event) => {
      console.error('음성 인식 오류:', event.error);
      
      if (event.error === 'no-speech') {
        // 말이 없으면 다시 시작
        if ((mode === 'voice' && voiceModeRef.current) || (mode === 'mic' && micModeRef.current)) {
          setTimeout(() => {
            if ((mode === 'voice' && voiceModeRef.current) || (mode === 'mic' && micModeRef.current)) {
              startListening(mode);
            }
          }, 300);
        }
      }
    };

    recognition.onend = () => {
      console.log('음성 인식 종료, 최종:', finalTranscriptRef.current);
      setIsListening(false);
      setCurrentTranscript('');
      
      const finalText = finalTranscriptRef.current.trim();
      
      if (finalText) {
        // 인식된 텍스트가 있으면 처리
        processMessage(finalText, mode);
      } else {
        // 없으면 다시 듣기
        if ((mode === 'voice' && voiceModeRef.current) || (mode === 'mic' && micModeRef.current)) {
          setTimeout(() => {
            if ((mode === 'voice' && voiceModeRef.current && !isSpeaking) || 
                (mode === 'mic' && micModeRef.current)) {
              startListening(mode);
            }
          }, 300);
        }
      }
    };

    try {
      recognition.start();
    } catch (e) {
      console.error('음성 인식 시작 오류:', e);
    }
  };
  // ========== 마이크 모드 ==========
  const handleMicMode = () => {
    if (isMicMode) {
      micModeRef.current = false;
      setIsMicMode(false);
      setIsListening(false);
      setCurrentTranscript('');
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch(e) {}
        recognitionRef.current = null;
      }
      return;
    }

    if (isVoiceMode) {
      voiceModeRef.current = false;
      setIsVoiceMode(false);
      stopAISpeaking();
    }

    micModeRef.current = true;
    setIsMicMode(true);
    addMessage('assistant', '🎤 마이크 모드가 시작되었습니다.\n\n말씀하시면 텍스트로 답변드립니다.\n마이크 버튼을 다시 누르면 종료됩니다.');
    
    setTimeout(() => {
      startListening('mic');
    }, 500);
  };

  // ========== 보이스 모드 ==========
  const handleVoiceMode = () => {
    if (isVoiceMode) {
      console.log('보이스 모드 종료');
      voiceModeRef.current = false;
      setIsVoiceMode(false);
      setIsListening(false);
      setCurrentTranscript('');
      stopAISpeaking();
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch(e) {}
        recognitionRef.current = null;
      }
      return;
    }

    if (isMicMode) {
      micModeRef.current = false;
      setIsMicMode(false);
    }

    console.log('보이스 모드 시작');
    voiceModeRef.current = true;
    setIsVoiceMode(true);
    addMessage('assistant', '🔊 보이스 모드가 시작되었습니다.\n\n말씀하시면 음성으로 답변드립니다.\n제가 말하는 중에 말씀하시면 멈추고 들을게요.\n보이스 버튼을 다시 누르면 종료됩니다.');
    
    setTimeout(() => {
      startListening('voice');
    }, 500);
  };

  // ========== 녹음 모드 ==========
  const handleRecordConsult = async () => {
    if (isRecordingConsult) {
      if (consultRecorderRef.current && consultRecorderRef.current.state === 'recording') {
        consultRecorderRef.current.stop();
      }
      return;
    }

    if (isVoiceMode) {
      voiceModeRef.current = false;
      setIsVoiceMode(false);
      stopAISpeaking();
    }
    if (isMicMode) {
      micModeRef.current = false;
      setIsMicMode(false);
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch(e) {}
      recognitionRef.current = null;
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
          // Whisper API로 텍스트 변환
          const formData = new FormData();
          formData.append('file', audioBlob, 'recording.webm');
          formData.append('model', 'whisper-1');
          formData.append('language', 'ko');
          
          const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;
          
          const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${OPENAI_API_KEY}`
            },
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
    handleSendMessage(inputText);
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
                <span>말하는 중...</span>
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
        
        {currentTranscript && (
          <div className="message user interim">
            <div className="message-bubble">
              <p>{currentTranscript}</p>
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
