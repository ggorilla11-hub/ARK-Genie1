import { useState, useRef, useEffect } from 'react';
import { getAIResponse, analyzeDocument, transcribeAudio, textToSpeech } from '../services/openai';
import { generateAnalysisReport } from '../services/pdfService';
import './MagicBoxPage.css';

function MagicBoxPage({ user }) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [persona, setPersona] = useState('genie');
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isConsultRecording, setIsConsultRecording] = useState(false);
  const [consultChunks, setConsultChunks] = useState([]);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const chatAreaRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const consultRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  useEffect(() => {
    const greeting = persona === 'genie' 
      ? `안녕하세요, ${user?.displayName || '설계사'}님! 👋\n\n저는 ARK 지니, 대한민국 최고의 AI 보험 전문가입니다.\n\n📷 **카메라**: 증권/서류 촬영하여 즉시 분석\n📎 **파일**: 문서 첨부하여 분석\n🎤 **마이크**: 음성으로 질문 (텍스트 답변)\n🔊 **보이스**: 양방향 음성 대화\n⏺️ **녹음**: 상담 녹음 후 요약\n\n무엇을 도와드릴까요?`
      : `안녕하세요, ${user?.displayName || '설계사'}님!\n\n오상열 교수입니다.\n오늘도 훌륭한 MDRT가 되기 위한 여정을 함께 하겠습니다.\n\n무엇이든 물어보세요!`;
    
    setMessages([{ role: 'assistant', content: greeting, timestamp: new Date() }]);
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

  const addMessage = (role, content, extras = {}) => {
    setMessages(prev => [...prev, { role, content, timestamp: new Date(), ...extras }]);
  };

  const handleSendMessage = async (text = inputText, fromVoice = false) => {
    if (!text.trim() && uploadedFiles.length === 0) return;
    if (loading) return;

    const userMessage = {
      role: 'user',
      content: text || '서류 분석 요청',
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

      addMessage('assistant', response, { canDownload: response.length > 200 });

      // 보이스 모드면 AI 답변을 음성으로 출력 후 다시 듣기 시작
      if (isVoiceMode || fromVoice) {
        try {
          const audioUrl = await textToSpeech(response.substring(0, 1000));
          const audio = new Audio(audioUrl);
          audio.onended = () => {
            if (isVoiceMode) startVoiceListening();
          };
          audio.play();
        } catch (e) {
          console.error('TTS Error:', e);
          if (isVoiceMode) startVoiceListening();
        }
      }
    } catch (error) {
      addMessage('assistant', '죄송합니다. 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  };

  // 카메라 촬영 (실제 카메라)
  const handleCamera = () => {
    cameraInputRef.current?.click();
  };

  // 파일 선택
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

    // 카메라 촬영이면 자동으로 분석 시작
    if (isCamera && newFiles.length > 0) {
      setTimeout(() => {
        handleSendMessage('이 서류를 분석해주세요.');
      }, 500);
    }
  };

  const removeFile = (index) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  // 마이크 (음성 → 텍스트, AI는 텍스트로 답변)
  const handleMicPress = async () => {
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
            if (text) {
              addMessage('user', text);
              const history = messages.slice(-10).map(msg => ({ role: msg.role, content: msg.content }));
              const response = await getAIResponse(text, history, persona);
              addMessage('assistant', response, { canDownload: response.length > 200 });
            }
          } catch (error) {
            addMessage('assistant', '음성 인식에 실패했습니다. 다시 시도해주세요.');
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

  // 보이스 모드 (양방향 음성 대화)
  const startVoiceListening = async () => {
    if (!isVoiceMode) return;
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRe
