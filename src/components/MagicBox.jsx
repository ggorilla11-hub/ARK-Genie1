import { useState, useRef, useEffect } from 'react';
import { getAIResponse, analyzeImage } from '../services/openai';
import './MagicBox.css';

function MagicBox({ user }) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [persona, setPersona] = useState('genie');
  
  const fileInputRef = useRef(null);
  const chatAreaRef = useRef(null);

  useEffect(() => {
    setMessages([{
      role: 'assistant',
      content: '안녕하세요! 저는 ARK 지니입니다. 무엇을 도와드릴까요?',
      timestamp: new Date()
    }]);
  }, [user]);

  useEffect(() => {
    if (chatAreaRef.current) {
      chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = async () => {
    if (!inputText.trim() || loading) return;

    const userMessage = {
      role: 'user',
      content: inputText,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setLoading(true);

    try {
      const history = messages.slice(-10).map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      const response = await getAIResponse(inputText, history, persona);

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: response,
        timestamp: new Date()
      }]);
    } catch (error) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '죄송합니다. 오류가 발생했습니다.',
        timestamp: new Date()
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target.result.split(',')[1];
      setMessages(prev => [...prev, {
        role: 'user',
        content: '[이미지 분석 요청]',
        image: event.target.result,
        timestamp: new Date()
      }]);

      try {
        const analysis = await analyzeImage(base64);
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: analysis,
          timestamp: new Date()
        }]);
      } catch (error) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: '이미지 분석 중 오류가 발생했습니다.',
          timestamp: new Date()
        }]);
      } finally {
        setLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const togglePersona = () => {
    setPersona(prev => prev === 'genie' ? 'professor' : 'genie');
  };

  return (
    <div className="magic-box-container">
      <div className="live-notification">
        <div className="live-text">
          ARK 지니 - AI 보험 비서
        </div>
      </div>

      <div className="magic-box-header">
        <div className="header-title">
          <span>🧞</span>
          <span>매직박스</span>
          <span className="badge">PRO</span>
        </div>
        <button className="persona-toggle" onClick={togglePersona}>
          {persona === 'genie' ? '🎓 교수님 모드' : '🧞 지니 모드'}
        </button>
      </div>

      <div className="chat-area" ref={chatAreaRef}>
        {messages.map((msg, index) => (
          <div key={index} className={'message ' + msg.role}>
            {msg.image && <img src={msg.image} alt="uploaded" className="message-image" />}
            <div className="message-content">
              <p>{msg.content}</p>
            </div>
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
        <div className="input-buttons">
          <button className="input-btn" onClick={() => fileInputRef.current.click()} disabled={loading}>
            <span>📷</span>
          </button>
          <button className="input-btn" onClick={() => fileInputRef.current.click()} disabled={loading}>
            <span>📎</span>
          </button>
        </div>
        <div className="text-input-wrapper">
          <input
            type="text"
            className="text-input"
            placeholder="무엇을 도와드릴까요?"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={loading}
          />
          <button className="send-btn" onClick={handleSendMessage} disabled={loading || !inputText.trim()}>
            ➤
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleFileSelect}
        />
      </div>
    </div>
  );
}

export default MagicBox;
