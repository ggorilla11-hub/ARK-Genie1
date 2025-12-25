import { useState, useRef } from 'react';
import './CustomerPage.css';

// 서버 URL
const API_URL = 'https://ark-genie-server.onrender.com';

function CustomerPage({ user }) {
  const [showSheetOverlay, setShowSheetOverlay] = useState(false);
  const [showUploadOptions, setShowUploadOptions] = useState(false);
  const [customers, setCustomers] = useState([
    { id: 1, name: '김철수', phone: '010-1234-5678', tag: 'hot', tagText: '상담예정', date: '오늘 14:00' },
    { id: 2, name: '박영희', phone: '010-2345-6789', tag: 'new', tagText: '신규', date: '어제 등록' },
    { id: 3, name: '이민수', phone: '010-3456-7890', tag: '', tagText: '기존고객', date: '12/20 상담' },
    { id: 4, name: '최지영', phone: '010-4567-8901', tag: 'new', tagText: '신규', date: '오늘 등록' },
    { id: 5, name: '정대훈', phone: '010-5678-9012', tag: '', tagText: '기존고객', date: '12/18 상담' },
  ]);
  const [sheetData, setSheetData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sheetConnected, setSheetConnected] = useState(true);
  const [lastSync, setLastSync] = useState('방금 전');

  // 파일 input ref
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  // 카메라로 촬영 (모바일)
  const handleCamera = () => {
    setShowUploadOptions(false);
    if (cameraInputRef.current) {
      cameraInputRef.current.click();
    }
  };

  // 갤러리/파일탐색기 열기
  const handleGallery = () => {
    setShowUploadOptions(false);
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // 파일 선택 시 처리
  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    console.log('📁 파일 선택됨:', file.name, file.type);

    // 이미지 파일인지 확인
    if (!file.type.startsWith('image/')) {
      alert('이미지 파일만 업로드 가능합니다.');
      return;
    }

    setLoading(true);

    try {
      // 파일을 base64로 변환
      const base64 = await fileToBase64(file);
      
      // 서버로 OCR 분석 요청
      const response = await fetch(`${API_URL}/api/analyze-prospect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: base64,
          imageType: 'businessCard'
        })
      });

      const result = await response.json();
      
      if (result.success && result.data) {
        const extracted = result.data.extracted;
        
        // 추출된 정보로 새 고객 추가
        const newCustomer = {
          id: Date.now(),
          name: extracted.ownerName || extracted.companyName || '새 고객',
          phone: extracted.mobile || extracted.phone || '번호 없음',
          tag: 'new',
          tagText: '신규',
          date: '방금 등록'
        };

        setCustomers(prev => [newCustomer, ...prev]);
        
        alert(`✅ 고객 등록 완료!\n\n이름: ${newCustomer.name}\n연락처: ${newCustomer.phone}`);
      } else {
        alert('명함 인식에 실패했습니다.\n다시 시도해주세요.');
      }
    } catch (error) {
      console.error('OCR 에러:', error);
      alert('오류가 발생했습니다.\n다시 시도해주세요.');
    } finally {
      setLoading(false);
      // input 초기화 (같은 파일 다시 선택 가능하도록)
      e.target.value = '';
    }
  };

  // 파일을 base64로 변환
  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = (error) => reject(error);
    });
  };

  // 구글시트에서 고객 불러오기
  const loadCustomersFromSheet = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/sheets/customers`);
      const result = await response.json();
      
      if (result.success && result.customers) {
        setSheetData(result.customers);
        setLastSync('방금 전');
      }
    } catch (error) {
      console.error('시트 로드 에러:', error);
    } finally {
      setLoading(false);
    }
  };

  // 시트 오버레이 열 때 데이터 로드
  const openSheetOverlay = async () => {
    setShowSheetOverlay(true);
    await loadCustomersFromSheet();
  };

  // CSV 다운로드
  const handleDownload = () => {
    window.open(`${API_URL}/api/sheets/download`, '_blank');
  };

  return (
    <div className="customer-page">
      {/* 숨겨진 파일 input들 */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileSelect}
      />
      <input
        type="file"
        ref={cameraInputRef}
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={handleFileSelect}
      />

      {/* 헤더 */}
      <div className="app-header">
        <div className="header-logo">🧞‍♂️</div>
        <div className="header-info">
          <h1>AI지니</h1>
          <p>{user?.displayName || '설계사'}님의 AI 비서</p>
        </div>
        <div className="header-status">{loading ? '처리중...' : '대기중'}</div>
      </div>

      {/* 콘텐츠 */}
      <div className="content">
        {/* 고객 헤더 */}
        <div className="customer-header">
          <h2>👥 내 고객</h2>
          <div className="customer-count">{customers.length}명</div>
        </div>

        {/* 업로드 영역 */}
        <div className="upload-area" onClick={() => setShowUploadOptions(!showUploadOptions)}>
          <div className="icon">📇</div>
          <h3>명함/고객 등록</h3>
          <p>명함 촬영 또는 이미지 업로드로<br/>고객 정보를 자동 등록하세요</p>
          
          {showUploadOptions && (
            <div className="upload-btns">
              <button className="upload-btn" onClick={(e) => { e.stopPropagation(); handleCamera(); }}>
                📷 카메라
              </button>
              <button className="upload-btn" onClick={(e) => { e.stopPropagation(); handleGallery(); }}>
                🖼️ 갤러리
              </button>
            </div>
          )}
        </div>

        {/* 구글시트 연동 상태 */}
        <div className="sheet-status" onClick={openSheetOverlay}>
          <div className="icon">📊</div>
          <div className="info">
            <div className="title">구글시트 연동됨</div>
            <div className="time">마지막 동기화: {lastSync}</div>
          </div>
          <div className="check">✓</div>
        </div>

        {/* 고객 리스트 */}
        <div className="customer-list">
          {customers.map((customer) => (
            <div key={customer.id} className={`customer-card ${customer.tag}`}>
              <div className="customer-avatar">{customer.name[0]}</div>
              <div className="customer-info">
                <h4>{customer.name}</h4>
                <p>{customer.phone}</p>
                <span className={`customer-tag ${customer.tag}`}>{customer.tagText}</span>
              </div>
              <div className="customer-next">
                <div className="label">{customer.date}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 로딩 오버레이 */}
      {loading && (
        <div className="loading-overlay">
          <div className="loading-spinner">🔄</div>
          <p>처리 중...</p>
        </div>
      )}

      {/* 시트 오버레이 */}
      {showSheetOverlay && (
        <div className="sheet-overlay">
          <div className="sheet-header">
            <button className="sheet-back" onClick={() => setShowSheetOverlay(false)}>←</button>
            <div className="sheet-title">📊 고객 시트</div>
            <button className="sheet-download" onClick={handleDownload}>
              ⬇️ 다운로드
            </button>
          </div>
          <div className="sheet-content">
            {/* 시트 정보 */}
            <div className="sheet-info">
              <div className="icon">📋</div>
              <div className="text">
                <div className="title">AI지니_고객DB</div>
                <div className="sub">총 {sheetData.length}명 · 마지막 동기화: {lastSync}</div>
              </div>
            </div>

            {/* 시트 테이블 */}
            <div className="sheet-table">
              <div className="sheet-row header">
                <div className="sheet-cell">이름</div>
                <div className="sheet-cell">연락처</div>
                <div className="sheet-cell">등록일</div>
              </div>
              {sheetData.length > 0 ? (
                sheetData.map((row, index) => (
                  <div key={index} className="sheet-row">
                    <div className="sheet-cell">{row.name}</div>
                    <div className="sheet-cell">{row.phone}</div>
                    <div className="sheet-cell">{row.registeredDate || row.date}</div>
                  </div>
                ))
              ) : (
                <div className="sheet-empty">
                  <p>등록된 고객이 없습니다.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CustomerPage;
