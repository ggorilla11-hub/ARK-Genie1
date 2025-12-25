// ============================================
// ProspectPage.jsx v25 - 고객발굴 페이지 (다크 테마)
// ARK-Genie v25 - 시뮬레이터 기반 다크 UI
// ============================================

import React, { useState, useRef, useEffect } from 'react';
import './ProspectPage.css';

const API_SERVER = 'https://ark-genie-server.onrender.com';

const ProspectPage = () => {
  const [step, setStep] = useState('legal');
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
  
  const [agentInfo] = useState({
    name: '홍길동',
    phone: '010-1234-5678',
    company: '보험사'
  });
  
  // 촬영용 / 갤러리용 분리
  const receiptCameraRef = useRef(null);
  const receiptGalleryRef = useRef(null);
  const namecardCameraRef = useRef(null);
  const namecardGalleryRef = useRef(null);
  
  useEffect(() => {
    getGPS();
  }, []);
  
  const getGPS = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          setGps(coords);
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
  
  const handleLegalAgree = () => {
    if (!legalAgreed) {
      alert('법적 사항에 동의해주세요.');
      return;
    }
    setStep('input');
  };
  
  const handleImageSelect = (e, type) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const previewUrl = URL.createObjectURL(file);
    
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
  
  const startAnalysis = async () => {
    if (!receiptImage && !namecardImage) {
      alert('영수증 또는 명함을 선택해주세요.');
      return;
    }
    
    setStep('loading');
    setLoading(true);
    
    try {
      setLoadingMessage('📸 이미지 OCR 분석 중...');
      
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
      
      const combinedResult = mergeResults(receiptResult, namecardResult);
      setResult(combinedResult);
      
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
  
  const mergeResults = (receipt, namecard) => {
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
    
    if (!receipt) return namecard;
    if (!namecard) return receipt;
    
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
  
  const toggleInsurance = (type) => {
    setSelectedInsurance(prev => 
      prev.includes(type) 
        ? prev.filter(t => t !== type)
        : [...prev, type]
    );
  };
  
  const generateMessage = async (channel) => {
    setMessageChannel(channel);
    setGeneratedMessage('');
    setSendConsent(false);
    setCopySuccess(false);
    
    try {
      const response = await fetch(`${API_SERVER}/api/generate-prospect-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prospectData: { ...result, selectedInsurance },
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
      alert('복사에 실패했습니다.');
    }
  };
  
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
  
  const goBack = () => {
    if (step === 'message') setStep('result');
    else if (step === 'result') setStep('input');
    else if (step === 'input') setStep('legal');
  };
  
  return (
    <div className="prospect-page">
      <header className="prospect-header">
        <button className="back-btn" onClick={goBack}>←</button>
        <h1>🎯 고객발굴</h1>
        <button className="reset-btn" onClick={resetAll}>초기화</button>
      </header>
      
      {/* ========== 법적 동의 ========== */}
      {step === 'legal' && (
        <div className="legal-section">
          <div className="legal-card">
            <h2>⚖️ 법적 사항 안내</h2>
            <p className="legal-intro">고객발굴 기능 사용 전 반드시 숙지해주세요.</p>
            
            <div className="legal-rules">
              <div className="legal-rule">
                <div className="rule-icon">1️⃣</div>
                <div className="rule-content">
                  <strong>정보 수신 동의 필수</strong>
                  <p>"무료 분석표 보내드려도 될까요?" 동의를 먼저 받으세요.</p>
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
                <li><strong>정보통신망법:</strong> 3천만원 과태료</li>
                <li><strong>개인정보보호법:</strong> 5년 징역/5천만원</li>
                <li><strong>금융소비자보호법:</strong> 수입 50% 과징금</li>
              </ul>
            </div>
            
            <label className="legal-checkbox">
              <input
                type="checkbox"
                checked={legalAgreed}
                onChange={(e) => setLegalAgreed(e.target.checked)}
              />
              <span>위 내용을 숙지했으며, 모든 법적 책임은 본인에게 있음을 이해합니다.</span>
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
      
      {/* ========== 입력 ========== */}
      {step === 'input' && (
        <div className="input-section">
          <div className="intro-banner">
            <div className="tip-badge">💡 TIP</div>
            <p>"사장님, 무료 분석표 보내드려도 될까요?"</p>
            <p className="tip-sub">이 한마디가 법적 보호막입니다!</p>
          </div>
          
          {/* 촬영/갤러리 분리 UI */}
          <div className="capture-area">
            {/* 영수증 */}
            <div className="capture-row">
              <div className="capture-label-box">
                <span className="capture-label-icon">🧾</span>
                <span className="capture-label-text">영수증</span>
              </div>
              <div className="capture-buttons">
                <button 
                  className={`capture-btn ${receiptImage ? 'done' : ''}`}
                  onClick={() => receiptCameraRef.current.click()}
                >
                  <span className="capture-btn-icon">📷</span>
                  <span className="capture-btn-text">{receiptImage ? '✓ 완료' : '촬영'}</span>
                </button>
                <button 
                  className={`capture-btn ${receiptImage ? 'done' : ''}`}
                  onClick={() => receiptGalleryRef.current.click()}
                >
                  <span className="capture-btn-icon">🖼️</span>
                  <span className="capture-btn-text">{receiptImage ? '✓ 완료' : '갤러리'}</span>
                </button>
              </div>
              {/* 촬영용 input */}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                ref={receiptCameraRef}
                onChange={(e) => handleImageSelect(e, 'receipt')}
                style={{ display: 'none' }}
              />
              {/* 갤러리용 input */}
              <input
                type="file"
                accept="image/*"
                ref={receiptGalleryRef}
                onChange={(e) => handleImageSelect(e, 'receipt')}
                style={{ display: 'none' }}
              />
            </div>
            
            {/* 명함 */}
            <div className="capture-row">
              <div className="capture-label-box">
                <span className="capture-label-icon">📇</span>
                <span className="capture-label-text">명함</span>
              </div>
              <div className="capture-buttons">
                <button 
                  className={`capture-btn ${namecardImage ? 'done' : ''}`}
                  onClick={() => namecardCameraRef.current.click()}
                >
                  <span className="capture-btn-icon">📷</span>
                  <span className="capture-btn-text">{namecardImage ? '✓ 완료' : '촬영'}</span>
                </button>
                <button 
                  className={`capture-btn ${namecardImage ? 'done' : ''}`}
                  onClick={() => namecardGalleryRef.current.click()}
                >
                  <span className="capture-btn-icon">🖼️</span>
                  <span className="capture-btn-text">{namecardImage ? '✓ 완료' : '갤러리'}</span>
                </button>
              </div>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                ref={namecardCameraRef}
                onChange={(e) => handleImageSelect(e, 'namecard')}
                style={{ display: 'none' }}
              />
              <input
                type="file"
                accept="image/*"
                ref={namecardGalleryRef}
                onChange={(e) => handleImageSelect(e, 'namecard')}
                style={{ display: 'none' }}
              />
            </div>
          </div>
          
          {/* 미리보기 */}
          {(receiptPreview || namecardPreview) && (
            <div className="preview-area">
              {receiptPreview && (
                <div className="preview-box">
                  <img src={receiptPreview} alt="영수증" />
                  <p>🧾 영수증 ✓</p>
                </div>
              )}
              {namecardPreview && (
                <div className="preview-box">
                  <img src={namecardPreview} alt="명함" />
                  <p>📇 명함 ✓</p>
                </div>
              )}
            </div>
          )}
          
          <div className="gps-area">
            <div className="gps-icon">📍</div>
            <div className="gps-info">
              <div className="gps-label">현재 위치</div>
              <div className="gps-address">{gpsAddress || '위치 확인 중...'}</div>
            </div>
            <button className="gps-refresh" onClick={getGPS}>🔄</button>
          </div>
          
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
      
      {/* ========== 로딩 ========== */}
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
      
      {/* ========== 결과 ========== */}
      {step === 'result' && result && (
        <div className="result-section">
          <div className="data-source">
            <div className="data-source-icon">📊</div>
            <div className="data-source-text">
              <strong>출처: 공공데이터포털</strong>
              국세청 사업자정보 / 소방청 다중이용업소 기준
            </div>
          </div>
          
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
            </div>
          </div>
          
          <div className="result-card">
            <h3>🎯 보험 분석 결과</h3>
            
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
          
          <div className="result-card">
            <h3>📨 연락하기</h3>
            <div className="contact-buttons">
              <button className="contact-btn" onClick={() => generateMessage('kakao')}>
                <span className="contact-icon">💬</span>
                <span className="contact-label">카카오톡</span>
              </button>
              <button className="contact-btn" onClick={() => generateMessage('sms')}>
                <span className="contact-icon">📱</span>
                <span className="contact-label">문자</span>
              </button>
              <button className="contact-btn" onClick={() => generateMessage('email')}>
                <span className="contact-icon">📧</span>
                <span className="contact-label">이메일</span>
              </button>
              <button className="contact-btn" onClick={() => generateMessage('letter')}>
                <span className="contact-icon">📮</span>
                <span className="contact-label">편지</span>
              </button>
            </div>
            <p className="contact-hint">※ 메시지 생성 후 직접 발송하세요</p>
          </div>
          
          <div className="disclaimer">※ 본 분석은 공공데이터 기준 참고용이며, 실제와 다를 수 있습니다.</div>
        </div>
      )}
      
      {/* ========== 메시지 ========== */}
      {step === 'message' && (
        <div className="message-section">
          <div className="result-card message-card">
            <h3>
              📝 {messageChannel === 'kakao' ? '카카오톡' : 
                  messageChannel === 'sms' ? '문자' : 
                  messageChannel === 'email' ? '이메일' : '편지'} 메시지
            </h3>
            
            <div className="generated-message">{generatedMessage}</div>
            
            <div className="send-warning">
              <p>⚠️ 동의 없이 발송 시 <strong>정보통신망법 위반</strong></p>
              <p><strong>3천만원 이하 과태료</strong> 대상</p>
            </div>
            
            <label className="consent-checkbox">
              <input
                type="checkbox"
                checked={sendConsent}
                onChange={(e) => setSendConsent(e.target.checked)}
              />
              <span>고객에게 정보 수신 동의를 받았습니다</span>
            </label>
            
            <div className="message-actions">
              <button 
                className={`copy-btn ${!sendConsent ? 'disabled' : ''} ${copySuccess ? 'success' : ''}`}
                onClick={copyToClipboard}
                disabled={!sendConsent}
              >
                {copySuccess ? '✅ 복사 완료!' : '📋 복사하기'}
              </button>
              
              {messageChannel === 'letter' && (
                <button 
                  className="download-btn"
                  onClick={() => {
                    const blob = new Blob([generatedMessage], { type: 'text/plain' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `편지_${result.extracted?.companyName || '고객'}.txt`;
                    a.click();
                  }}
                >
                  📥 다운로드
                </button>
              )}
            </div>
            
            <p className="action-hint">
              {messageChannel === 'letter' ? '다운로드 후 출력하여 발송하세요.' : '복사 후 앱에서 직접 발송하세요.'}
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
