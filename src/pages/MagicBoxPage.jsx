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
  const isProcessingRef = useRef
