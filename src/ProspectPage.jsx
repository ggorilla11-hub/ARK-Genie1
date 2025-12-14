// ============================================
// ProspectPage.jsx v18 - 고객발굴 페이지 컴포넌트
// ARK-Genie v18 - OCR + AI 분석 + 법적 준수
// ============================================

import React, { useState, useRef, useEffect } from 'react';
import './ProspectPage.css';

const API_SERVER = 'https://ark-genie-server.onrender.com';

const ProspectPage = () => {
  // 상태 관리
  const [step, setStep] = useState('legal'); // legal | input | loading | result | message
  const [legalAgreed, setLegalAgreed] = useState(false);
  const [receiptImage, setReceiptImage] = useState(null);
  const [receiptPreview, setReceiptPreview] = useState(null);
  const [namecardImage, setNamecardImage] = useState(null);
  const [namecardPreview, setNamecardPreview] = useState(null);
  const [gps, setGps] = useState(null);
  const [gpsAddress, setGpsAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [result, setResult] = useState(null);
  const [selectedInsurance, setSelectedInsurance] = useState([]);
  const [messageChannel, setMessageChannel] = useState(null);
  const [generatedMessage, setGeneratedMessage] = useState('');
  const [sendConsent, setSendConsent] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  
  // 설계사 정보 (TODO: 실제 로그인 정보로 대체)
  const [agentInfo] = useState({
    name: '홍길동',
    phone: '010-1234-5678',
    company: '보험사'
  });
  
  // Refs
  const receiptInputRef = useRef(null);
  const namecardInputRef = useRef(null);
  
  // 컴포넌트 마운트 시 GPS 자동 가져오기
  useEffect(() => {
    getGPS();
  }, []);
  
  // GPS 가져오기
  const getGPS = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          setGps(coords);
          // 간단히 좌표만 표시 (실제로는 카카오 API로 변환)
          setGpsAddress(`위도: ${coords.lat.toFixed(4)}, 경도: ${coords.lng.toFixed(4)}`);
        },
        (error) => {
          console.error('GPS 오류:', error);
          setGpsAddress('위치 정보를 가져올 수 없습니다.');
        },
        { enableHighAccuracy: true }
      );
    }
  };
  
  // 법적 동의 처리
  const handleLegalAgree = () => {
    if (!legalAgreed) {
      alert('법적 사항에 동의해주세요.');
      return;
    }
    setStep('input');
  };
  
  // 이미지 선택 처리
  const handleImageSelect = (e, type) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // 미리보기
    const previewUrl = URL.createObjectURL(file);
    
    // Base64 변환
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target.result;
      
      if (type === 'receipt') {
        setReceiptImage(base64);
        setReceiptPreview(previewUrl);
      } else {
        setNamecardImage(base64);
        setNamecardPreview(previewUrl);
      }
    };
    reader.readAsDataURL(file);
  };
  
  // AI 분석 시작
  const startAnalysis = async () => {
    if (!receiptImage && !namecardImage) {
      alert('영수증 또는 명함을 촬영해주세요.');
      return;
    }
    
    setStep('loading');
    setLoading(true);
    
    try {
      // 로딩 메시지 업데이트
      setLoadingMessage('📸 이미지 OCR 분석 중...');
      
      // 영수증 분석
      let receiptResult = null;
      if (receiptImage) {
        const receiptResponse = await fetch(`${API_SERVER}/api/analyze-prospect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image: receiptImage,
            imageType: 'receipt'
          })
        });
        const receiptData = await receiptResponse.json();
        if (receiptData.success && receiptData.data) {
          receiptResult = receiptData.data;
        }
      }
      
      setLoadingMessage('📇 명함 정보 추출 중...');
      
      // 명함 분석
      let namecardResult = null;
      if (namecardImage) {
        const namecardResponse = await fetch(`${API_SERVER}/api/analyze-prospect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image: namecardImage,
            imageType: 'businessCard'
          })
        });
        const namecardData = await namecardResponse.json();
        if (namecardData.success && namecardData.data) {
          namecardResult = namecardData.data;
        }
      }
      
      setLoadingMessage('🎯 보험 분석 완료!');
      
      // 결과 통합
      const combinedResult = mergeResults(receiptResult, namecardResult);
      setResult(combinedResult);
      
      // 필수 보험 자동 선택
      if (combinedResult.insuranceAnalysis?.mandatoryInsurance) {
        setSelectedInsurance(combinedResult.insuranceAnalysis.mandatoryInsurance);
      }
      
      setStep('result');
      
    } catch (error) {
      console.error('분석 오류:', error);
      alert('분석 중 오류가 발생했습니다: ' + error.message);
      setStep('input');
    } finally {
      setLoading(false);
    }
  };
  
  // 결과 통합 함수
  const mergeResults = (receipt, namecard) => {
    // 둘 다 없으면 기본값
    if (!receipt && !namecard) {
      return {
        extracted: {},
        insuranceAnalysis: {
          mandatoryInsurance: [],
          recommendedInsurance: [],
          salesPoints: []
        }
      };
    }
    
    // 하나만 있으면 그것 반환
    if (!receipt) return namecard;
    if (!namecard) return receipt;
    
    // 둘 다 있으면 통합 (명함 정보 우선)
    return {
      documentType: 'merged',
      extracted: {
        businessNumber: namecard.extracted?.businessNumber !== '미확인' 
          ? namecard.extracted?.businessNumber 
          : receipt.extracted?.businessNumber,
        companyName: namecard.extracted?.companyName || receipt.extracted?.companyName,
        ownerName: namecard.extracted?.ownerName || receipt.extracted?.ownerName,
        address: receipt.extracted?.address || namecard.extracted?.address,
        phone: receipt.extracted?.phone || namecard.extracted?.phone,
        mobile: namecard.extracted?.mobile || '미확인',
        email: namecard.extracted?.email || '미확인',
        businessType: receipt.extracted?.businessType || namecard.extracted?.businessType,
        position: namecard.extracted?.position
      },
      confidence: receipt.confidence === 'high' && namecard.confidence === 'high' ? 'high' : 'medium',
      insuranceAnalysis: receipt.insuranceAnalysis || namecard.insuranceAnalysis
    };
  };
  
  // 보험 선택 토글
  const toggleInsurance = (type) => {
    setSelectedInsurance(prev => 
      prev.includes(type) 
        ? prev.filter(t => t !== type)
        : [...prev, type]
    );
  };
  
  // 메시지 생성
  const generateMessage = async (channel) => {
    setMessageChannel(channel);
    setGeneratedMessage('');
    setSendConsent(false);
    setCopySuccess(false);
    
    try {
      setLoadingMessage('📝 메시지 생성 중...');
      
      const response = await fetch(`${API_SERVER}/api/generate-prospect-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prospectData: {
            ...result,
            selectedInsurance
          },
          messageType: channel,
          agentInfo
        })
      });
      
      const data = await response.json();
      if (data.success) {
        setGeneratedMessage(data.message);
        setStep('message');
      } else {
        alert('메시지 생성 실패: ' + data.error);
      }
    } catch (error) {
      console.error('메시지 생성 실패:', error);
      alert('메시지 생성 중 오류가 발생했습니다.');
    }
  };
  
  // 클립보드 복사
  const copyToClipboard = async () => {
    if (!sendConsent) {
      alert('고객에게 정보 수신 동의를 받았는지 확인해주세요.');
      return;
    }
    
    try {
      await navigator.clipboard.writeText(generatedMessage);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 3000);
    } catch (error) {
      alert('복사에 실패했습니다. 수동으로 복사해주세요.');
    }
  };
  
  // 초기화
  const resetAll = () => {
    setStep('legal');
    setLegalAgreed(false);
    setReceiptImage(null);
    setReceiptPreview(null);
    setNamecardImage(null);
    setNamecardPreview(null);
    setResult(null);
    setSelectedInsurance([]);
    setMessageChannel(null);
    setGeneratedMessage('');
    setSendConsent(false);
  };
  
  // 뒤로가기
  const goBack = () => {
    if (step === 'message') {
      setStep('result');
    } else if (step === 'result') {
      setStep('input');
    } else if (step === 'input') {
      setStep('legal');
    }
  };
  
  return (
    <div className="prospect-page">
      {/* 헤더 */}
      <header className="prospect-header">
        <button className="back-btn" onClick={goBack}>←</button>
        <h1>🎯 고객발굴</h1>
        <button className="reset-btn" onClick={resetAll}>초기화</button>
      </header>
      
      {/* ========== 법적 동의 단계 ========== */}
      {step === 'legal' && (
        <div className="legal-section">
          <div className="legal-card">
            <h2>⚖️ 법적 사항 안내</h2>
            <p className="legal-intro">
              고객발굴 기능 사용 전 반드시 숙지해주세요.
            </p>
            
            <div className="legal-rules">
              <div className="legal-rule">
                <div className="rule-icon">1️⃣</div>
                <div className="rule-content">
                  <strong>정보 수신 동의 필수</strong>
                  <p>고객에게 "무료 분석표 보내드려도 될까요?" 동의를 먼저 받으세요.</p>
                </div>
              </div>
              
              <div className="legal-rule">
                <div className="rule-icon">2️⃣</div>
                <div className="rule-content">
                  <strong>특정 상품 언급 금지</strong>
                  <p>특정 보험사/상품명을 언급하지 마세요.</p>
                </div>
              </div>
              
              <div className="legal-rule">
                <div className="rule-icon">3️⃣</div>
                <div className="rule-content">
                  <strong>추정 표현 사용</strong>
                  <p>모든 수치는 "약", "추정" 표현을 사용합니다.</p>
                </div>
              </div>
            </div>
            
            <div className="penalty-box">
              <h3>⚠️ 위반 시 제재</h3>
              <ul>
                <li><strong>정보통신망법 제50조:</strong> 3,000만원 이하 과태료</li>
                <li><strong>개인정보보호법 제71조:</strong> 5년 징역 / 5,000만원 벌금</li>
                <li><strong>금융소비자보호법 제22조:</strong> 수입 50% 과징금 + 영업정지</li>
              </ul>
            </div>
            
            <label className="legal-checkbox">
              <input
                type="checkbox"
                checked={legalAgreed}
                onChange={(e) => setLegalAgreed(e.target.checked)}
              />
              <span>
                위 내용을 숙지했으며, 모든 법적 책임은 발송자(설계사)에게 있음을 이해합니다.
              </span>
            </label>
            
            <button 
              className={`legal-btn ${legalAgreed ? 'active' : ''}`}
              onClick={handleLegalAgree}
              disabled={!legalAgreed}
            >
              동의하고 시작하기
            </button>
          </div>
        </div>
      )}
      
      {/* ========== 입력 단계 ========== */}
      {step === 'input' && (
        <div className="input-section">
          {/* 안내 배너 */}
          <div className="intro-banner">
            <div className="tip-badge">💡 TIP</div>
            <p>"사장님, 무료 분석표 카톡으로 보내드려도 될까요?"</p>
            <p className="tip-sub">이 한마디가 법적 보호막이 됩니다!</p>
          </div>
          
          {/* 촬영 영역 */}
          <div className="capture-area">
            {/* 영수증 */}
            <div 
              className={`capture-box ${receiptImage ? 'has-image' : ''}`}
              onClick={() => receiptInputRef.current.click()}
            >
              {receiptPreview ? (
                <img src={receiptPreview} alt="영수증" className="preview-image" />
              ) : (
                <>
                  <div className="capture-icon">🧾</div>
                  <div className="capture-label">영수증 촬영</div>
                </>
              )}
              {receiptImage && <div className="capture-status">✓ 촬영완료</div>}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                ref={receiptInputRef}
                onChange={(e) => handleImageSelect(e, 'receipt')}
                style={{ display: 'none' }}
              />
            </div>
            
            {/* 명함 */}
            <div 
              className={`capture-box ${namecardImage ? 'has-image' : ''}`}
              onClick={() => namecardInputRef.current.click()}
            >
              {namecardPreview ? (
                <img src={namecardPreview} alt="명함" className="preview-image" />
              ) : (
                <>
                  <div className="capture-icon">📇</div>
                  <div className="capture-label">명함 촬영</div>
                </>
              )}
              {namecardImage && <div className="capture-status">✓ 촬영완료</div>}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                ref={namecardInputRef}
                onChange={(e) => handleImageSelect(e, 'namecard')}
                style={{ display: 'none' }}
              />
            </div>
          </div>
          
          {/* GPS 영역 */}
          <div className="gps-area">
            <div className="gps-icon">📍</div>
            <div className="gps-info">
              <div className="gps-label">현재 위치</div>
              <div className="gps-address">
                {gpsAddress || '위치 확인 중...'}
              </div>
            </div>
            <button className="gps-refresh" onClick={getGPS}>🔄</button>
          </div>
          
          {/* 분석 버튼 */}
          <button 
            className="analyze-btn"
            onClick={startAnalysis}
            disabled={!receiptImage && !namecardImage}
          >
            <span>🔍</span>
            <span>AI 분석 시작</span>
          </button>
        </div>
      )}
      
      {/* ========== 로딩 단계 ========== */}
      {step === 'loading' && (
        <div className="loading-section">
          <div className="spinner"></div>
          <p className="loading-text">{loadingMessage || 'AI가 분석 중입니다...'}</p>
          <div className="loading-steps">
            <div className={`loading-step ${loadingMessage.includes('OCR') ? 'active' : ''}`}>
              📸 이미지 OCR 분석
            </div>
            <div className={`loading-step ${loadingMessage.includes('명함') ? 'active' : ''}`}>
              📇 명함 정보 추출
            </div>
            <div className={`loading-step ${loadingMessage.includes('보험') ? 'active' : ''}`}>
              🎯 보험 분석 완료
            </div>
          </div>
        </div>
      )}
      
      {/* ========== 결과 단계 ========== */}
      {step === 'result' && result && (
        <div className="result-section">
          {/* 사업장 정보 */}
          <div className="result-card">
            <h3>🏢 사업장 정보</h3>
            <div className="info-grid">
              <div className="info-row">
                <span className="info-label">상호</span>
                <span className="info-value">
                  {result.extracted?.companyName || '-'}
                  {result.confidence !== 'high' && <span className="estimate-badge">추정</span>}
                </span>
              </div>
              <div className="info-row">
                <span className="info-label">대표</span>
                <span className="info-value">{result.extracted?.ownerName || '-'}</span>
              </div>
              <div className="info-row">
                <span className="info-label">주소</span>
                <span className="info-value">{result.extracted?.address || '-'}</span>
              </div>
              <div className="info-row">
                <span className="info-label">업종</span>
                <span className="info-value">
                  {result.extracted?.businessType || '-'}
                  <span className="estimate-badge">추정</span>
                </span>
              </div>
              <div className="info-row">
                <span className="info-label">연락처</span>
                <span className="info-value">
                  {result.extracted?.mobile !== '미확인' 
                    ? result.extracted?.mobile 
                    : result.extracted?.phone || '-'}
                </span>
              </div>
              {result.extracted?.email && result.extracted.email !== '미확인' && (
                <div className="info-row">
                  <span className="info-label">이메일</span>
                  <span className="info-value">{result.extracted.email}</span>
                </div>
              )}
            </div>
          </div>
          
          {/* 보험 분석 */}
          <div className="result-card">
            <h3>🎯 보험 분석 결과</h3>
            
            {/* 필수 보험 */}
            {result.insuranceAnalysis?.mandatoryInsurance?.length > 0 && (
              <div className="insurance-section">
                <div className="insurance-category required">🔴 의무가입 (추정)</div>
                {result.insuranceAnalysis.mandatoryInsurance.map((ins, idx) => (
                  <div key={idx} className="insurance-item required">
                    <input
                      type="checkbox"
                      checked={selectedInsurance.includes(ins)}
                      onChange={() => toggleInsurance(ins)}
                    />
                    <span className="insurance-name">{ins}</span>
                    <span className="insurance-badge required">필수</span>
                  </div>
                ))}
              </div>
            )}
            
            {/* 권장 보험 */}
            {result.insuranceAnalysis?.recommendedInsurance?.length > 0 && (
              <div className="insurance-section">
                <div className="insurance-category recommended">🟡 권장</div>
                {result.insuranceAnalysis.recommendedInsurance.map((ins, idx) => (
                  <div key={idx} className="insurance-item recommended">
                    <input
                      type="checkbox"
                      checked={selectedInsurance.includes(ins)}
                      onChange={() => toggleInsurance(ins)}
                    />
                    <span className="insurance-name">{ins}</span>
                    <span className="insurance-badge recommended">권장</span>
                  </div>
                ))}
              </div>
            )}
            
            {/* 영업 포인트 */}
            {result.insuranceAnalysis?.salesPoints?.length > 0 && (
              <div className="sales-points">
                <h4>💡 영업 포인트</h4>
                <ul>
                  {result.insuranceAnalysis.salesPoints.map((point, idx) => (
                    <li key={idx}>{point}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          
          {/* 연락 방법 선택 */}
          <div className="result-card">
            <h3>📨 {result.extracted?.ownerName || '사장'}님께 연락하기</h3>
            <div className="contact-buttons">
              <button 
                className="contact-btn"
                onClick={() => generateMessage('kakao')}
                disabled={result.extracted?.mobile === '미확인' && result.extracted?.phone === '미확인'}
              >
                <span className="contact-icon">💬</span>
                <span className="contact-label">카카오톡</span>
              </button>
              <button 
                className="contact-btn"
                onClick={() => generateMessage('sms')}
                disabled={result.extracted?.mobile === '미확인' && result.extracted?.phone === '미확인'}
              >
                <span className="contact-icon">📱</span>
                <span className="contact-label">문자</span>
              </button>
              <button 
                className="contact-btn"
                onClick={() => generateMessage('email')}
                disabled={!result.extracted?.email || result.extracted.email === '미확인'}
              >
                <span className="contact-icon">📧</span>
                <span className="contact-label">이메일</span>
              </button>
              <button 
                className="contact-btn"
                onClick={() => generateMessage('letter')}
              >
                <span className="contact-icon">📮</span>
                <span className="contact-label">편지</span>
              </button>
            </div>
            <p className="contact-hint">
              ※ 연락처가 없으면 📮편지를 이용하세요
            </p>
          </div>
          
          {/* 면책 문구 */}
          <div className="disclaimer">
            ※ 본 분석은 공공데이터 기준 참고용이며, 실제와 다를 수 있습니다.
          </div>
        </div>
      )}
      
      {/* ========== 메시지 단계 ========== */}
      {step === 'message' && (
        <div className="message-section">
          <div className="result-card message-card">
            <h3>
              📝 {messageChannel === 'kakao' ? '카카오톡' : 
                  messageChannel === 'sms' ? '문자' : 
                  messageChannel === 'email' ? '이메일' : '편지'} 메시지
            </h3>
            
            <div className="generated-message">
              {generatedMessage}
            </div>
            
            {/* 법적 경고 */}
            <div className="send-warning">
              <p>⚠️ 동의 없이 발송 시 <strong>정보통신망법 제50조</strong> 위반으로</p>
              <p><strong>3,000만원 이하 과태료</strong> 대상이 될 수 있습니다.</p>
            </div>
            
            {/* 동의 체크박스 */}
            <label className="consent-checkbox">
              <input
                type="checkbox"
                checked={sendConsent}
                onChange={(e) => setSendConsent(e.target.checked)}
              />
              <span>고객에게 정보 수신 동의를 구두로 받았습니다</span>
            </label>
            
            {/* 버튼 */}
            <div className="message-actions">
              <button 
                className={`copy-btn ${!sendConsent ? 'disabled' : ''} ${copySuccess ? 'success' : ''}`}
                onClick={copyToClipboard}
                disabled={!sendConsent}
              >
                {copySuccess ? '✅ 복사 완료!' : '📋 클립보드에 복사'}
              </button>
              
              {messageChannel === 'letter' && (
                <button 
                  className="download-btn"
                  onClick={() => {
                    // 편지 다운로드 기능 (추후 PDF 생성)
                    const blob = new Blob([generatedMessage], { type: 'text/plain' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `편지_${result.extracted?.companyName || '고객'}.txt`;
                    a.click();
                  }}
                >
                  📥 편지 다운로드
                </button>
              )}
            </div>
            
            <p className="action-hint">
              {messageChannel === 'letter' 
                ? '다운로드 후 출력하여 우편으로 발송하세요.'
                : '복사 후 카카오톡/문자 앱에서 직접 발송하세요.'}
            </p>
            
            <button className="back-to-result" onClick={() => setStep('result')}>
              ← 분석 결과로 돌아가기
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProspectPage;
