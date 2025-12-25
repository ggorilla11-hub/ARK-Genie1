import { useState } from 'react';
import './CustomerPage.css';

function CustomerPage({ user }) {
  const [showSheetOverlay, setShowSheetOverlay] = useState(false);
  const [showUploadOptions, setShowUploadOptions] = useState(false);

  // 고객 데이터
  const customers = [
    { id: 1, name: '김철수', phone: '010-1234-5678', tag: 'hot', tagText: '상담예정', date: '오늘 14:00' },
    { id: 2, name: '박영희', phone: '010-2345-6789', tag: 'new', tagText: '신규', date: '어제 등록' },
    { id: 3, name: '이민수', phone: '010-3456-7890', tag: '', tagText: '기존고객', date: '12/20 상담' },
    { id: 4, name: '최지영', phone: '010-4567-8901', tag: 'new', tagText: '신규', date: '오늘 등록' },
    { id: 5, name: '정대훈', phone: '010-5678-9012', tag: '', tagText: '기존고객', date: '12/18 상담' },
  ];

  // 시트 데이터
  const sheetData = [
    { name: '김철수', phone: '010-1234-5678', date: '2024-12-24' },
    { name: '박영희', phone: '010-2345-6789', date: '2024-12-23' },
    { name: '이민수', phone: '010-3456-7890', date: '2024-12-20' },
    { name: '최지영', phone: '010-4567-8901', date: '2024-12-24' },
    { name: '정대훈', phone: '010-5678-9012', date: '2024-12-18' },
  ];

  const handleDownload = () => {
    alert('📊 고객 시트를 다운로드합니다.\n\n파일명: AI지니_고객목록_2024.xlsx');
    setShowSheetOverlay(false);
  };

  const handleUpload = (type) => {
    setShowUploadOptions(false);
    if (type === 'camera') {
      alert('📷 카메라가 열립니다.\n명함이나 고객 정보를 촬영하세요.');
    } else {
      alert('🖼️ 갤러리가 열립니다.\n명함이나 고객 정보 이미지를 선택하세요.');
    }
  };

  return (
    <div className="customer-page">
      {/* 헤더 */}
      <div className="app-header">
        <div className="header-logo">🧞‍♂️</div>
        <div className="header-info">
          <h1>AI지니</h1>
          <p>{user?.displayName || '설계사'}님의 AI 비서</p>
        </div>
        <div className="header-status">대기중</div>
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
              <button className="upload-btn" onClick={(e) => { e.stopPropagation(); handleUpload('camera'); }}>
                📷 카메라
              </button>
              <button className="upload-btn" onClick={(e) => { e.stopPropagation(); handleUpload('gallery'); }}>
                🖼️ 갤러리
              </button>
            </div>
          )}
        </div>

        {/* 구글시트 연동 상태 */}
        <div className="sheet-status" onClick={() => setShowSheetOverlay(true)}>
          <div className="icon">📊</div>
          <div className="info">
            <div className="title">구글시트 연동됨</div>
            <div className="time">마지막 동기화: 방금 전</div>
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
                <div className="title">AI지니_고객목록</div>
                <div className="sub">총 {customers.length}명 · 마지막 수정: 오늘</div>
              </div>
            </div>

            {/* 시트 테이블 */}
            <div className="sheet-table">
              <div className="sheet-row header">
                <div className="sheet-cell">이름</div>
                <div className="sheet-cell">연락처</div>
                <div className="sheet-cell">등록일</div>
              </div>
              {sheetData.map((row, index) => (
                <div key={index} className="sheet-row">
                  <div className="sheet-cell">{row.name}</div>
                  <div className="sheet-cell">{row.phone}</div>
                  <div className="sheet-cell">{row.date}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CustomerPage;
