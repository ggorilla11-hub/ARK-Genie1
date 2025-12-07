import { useState, useRef, useEffect } from 'react';
import { getAIResponse, analyzeImage, transcribeAudio, textToSpeech } from '../services/openai';
import { generateAnalysisReport } from '../services/pdfService';
import './MagicBoxPage.css';

function MagicBoxPage({ user }) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [persona, setPersona] = useState('genie');
  const [isRecording, setIsRecording] = useState(false);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const chatAreaRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  useEffect(() => {
    const greeting = persona === 'genie' 
      ? `안녕하세요, ${user?.displayName || '고객'}님! 👋\n\n저는 ARK 지니입니다.\n증권 분석, 제안서 작성, 보상 청구까지\n모든 보험 업무를 도와드려요!\n\n📷 사진, 🎤 음성, 📎 파일로 질문해보세요!`
      : `안녕하세요, ${user?.displayName || '설계사'}님!\n\n오상열 교수입니다.\n오늘도 훌륭한 설계사가 되기 위한 여정을 함께 하겠습니다.\n\n무엇이든 물어보세요!`;
    
    setMessages([{
      role: 'assistant',
      content: greeting,
      timestamp: new Date()
    }]);
  }, [user, persona]);

  useEffect(() => {
    if (chatAreaRef.current) {
      chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight;
    }
  }, [messages]);

  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleSendMessage = async (text = inputText) => {
    if (!text.trim() && uploadedFiles.length === 0) return;
    if (loading) return;

    const userMessage = {
      role: 'user',
      content: text || '이미지 분석 요청',
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
        response = await analyzeImage(base64);
      } else {
        const history = messages.slice(-10).map(msg => ({
          role: msg.role,
          content: msg.content
        }));
        response = await getAIResponse(text, history, persona);
      }

      const assistantMessage = {
        role: 'assistant',
        content: response,
        timestamp: new Date(),
        canDownload: response.length > 200
      };

      setMessages(prev => [...prev, assistantMessage]);

      if (isVoiceMode) {
        try {
          const audioUrl = await textToSpeech(response.substring(0, 500));
          const audio = new Audio(audioUrl);
          audio.play();
        } catch (e) {
          console.error('TTS Error:', e);
        }
      }

    } catch (error) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '죄송합니다. 오류가 발생했습니다. 다시 시도해주세요.',
        timestamp: new Date()
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleCamera = () => cameraInputRef.current?.click();
  const handleFileSelect = () => fileInputRef.current?.click();

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    const newFiles = files.map(file => ({
      file,
      name: file.name,
      type: file.type,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null
    }));

    setUploadedFiles(prev => [...prev, ...newFiles]);
    e.target.value = '';
  };

  const removeFile = (index) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const toggleRecording = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];

        mediaRecorder.ondataavailable = (e) => audioChunksRef.current.push(e.data);

        mediaRecorder.onstop = async () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          stream.getTracks().forEach(track => track.stop());
          
          setLoading(true);
          try {
            const text = await transcribeAudio(audioBlob);
            if (text) handleSendMessage(text);
          } catch (error) {
            console.error('Transcription error:', error);
          }
          setLoading(false);
        };

        mediaRecorder.start();
        setIsRecording(true);
      } catch (error) {
        alert('마이크 접근 권한이 필요합니다.');
      }
    }
  };

  const handleDownloadPDF = async (content) => {
    try {
      await generateAnalysisReport(content, user?.displayName || 'Customer');
    } catch (error) {
      alert('PDF 생성에 실패했습니다.');
    }
  };

  const togglePersona = () => setPersona(prev => prev === 'genie' ? 'professor' : 'genie');
  const toggleVoiceMode = () => setIsVoiceMode(prev => !prev);

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="magicbox-page">
      <div className="magicbox-header">
        <div className="header-left">
          <span className="header-icon">🧞</span>
          <span className="header-title">매직박스</span>
          <span className="pro-badge">PRO</span>
        </div>
        <button className="mode-toggle" onClick={togglePersona}>
          {persona === 'genie' ? '🎓 교수님 모드' : '🧞 지니 모드'}
        </button>
      </div>

      <div className="chat-area" ref={chatAreaRef}>
        {messages.map((msg, index) => (
          <div key={index} className={`message ${msg.role}`}>
            {msg.files && (
              <div className="message-files">
                {msg.files.map((file, i) => (
                  <div key={i} className="file-preview">
                    {file.preview ? <img src={file.preview} alt={file.name} /> : <div className="file-icon">📄</div>}
                  </div>
                ))}
              </div>
            )}
            <div className="message-bubble">
              {msg.content.split('\n').map((line, i) => <p key={i}>{line}</p>)}
            </div>
            {msg.role === 'assistant' && msg.canDownload && (
              <div className="download-buttons">
                <button className="download-btn pdf" onClick={() => handleDownloadPDF(msg.content)}>📄 PDF</button>
              </div>
            )}
            <div className="message-time">
              {msg.timestamp.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        ))}
        {loading && (
          <div className="message assistant">
            <div className="typing-indicator"><span></span><span></span><span></span></div>
          </div>
        )}
      </div>

      <div className="input-area">
        {isRecording && (
          <div className="recording-indicator">
            <div className="voice-waves">{[...Array(7)].map((_, i) => <div key={i} className="voice-wave"></div>)}</div>
            <span>듣고 있습니다...</span>
          </div>
        )}

        {uploadedFiles.length > 0 && (
          <div className="uploaded-files">
            {uploadedFiles.map((file, index) => (
              <div key={index} className="uploaded-file">
                {file.preview ? <img src={file.preview} alt={file.name} /> : <div className="file-icon-small">📄</div>}
                <button className="remove-file" onClick={() => removeFile(index)}>×</button>
              </div>
            ))}
          </div>
        )}

        <div className="input-tools">
          <button className="tool-btn" onClick={handleCamera}><span className="tool-icon">📷</span><span className="tool-label">카메라</span></button>
          <button className="tool-btn" onClick={handleFileSelect}><span className="tool-icon">📎</span><span className="tool-label">파일</span></button>
          <button className={`tool-btn ${isRecording ? 'recording' : ''}`} onClick={toggleRecording}><span className="tool-icon">🎤</span><span className="tool-label">음성</span></button>
          <button className={`tool-btn ${isVoiceMode ? 'active' : ''}`} onClick={toggleVoiceMode}><span className="tool-icon">🔊</span><span className="tool-label">보이스</span></button>
        </div>

        <div className="text-input-row">
          <input type="text" className="text-input" placeholder="무엇을 도와드릴까요?" value={inputText} onChange={(e) => setInputText(e.target.value)} onKeyPress={handleKeyPress} disabled={loading || isRecording} />
          <button className="send-btn" onClick={() => handleSendMessage()} disabled={loading || isRecording || (!inputText.trim() && uploadedFiles.length === 0)}>➤</button>
        </div>

        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFileChange} />
        <input ref={fileInputRef} type="file" accept="image/*,.pdf" multiple style={{ display: 'none' }} onChange={handleFileChange} />
      </div>
    </div>
  );
}

export default MagicBoxPage;
