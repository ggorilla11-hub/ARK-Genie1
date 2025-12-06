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
      content: `안녕하세요, ${user.displayName}님! 👋\n\n저는 ARK 지니입니다.\n증권 분석부터 제안서 작성까지 모든 업무를 도와드리겠습니다.\n\n무엇을 도와드릴까요?`,
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
        content: '죄송합니다. 오류가 발생했습니다. 다시 시도해주세요.',
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
          role: '
