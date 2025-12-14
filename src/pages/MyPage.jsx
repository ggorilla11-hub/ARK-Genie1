import './MyPage.css';

function MyPage({ user, onLogout }) {
  const menuItems = [
    { icon: '👤', title: '내 정보', desc: '프로필 및 연락처 관리' },
    { icon: '💳', title: '구독 관리', desc: '결제 및 플랜 변경' },
    { icon: '🔔', title: '알림 설정', desc: '푸시 알림 관리' },
    { icon: '❓', title: '도움말', desc: '자주 묻는 질문' },
    { icon: '📞', title: '고객센터', desc: '문의하기' },
  ];

  return (
    <div className="my-page">
      <div className="profile-card">
        <div className="profile-avatar">
          {user?.photoURL ? (
            <img src={user.photoURL} alt="profile" />
          ) : (
            <span>{user?.displayName?.[0] || '👤'}</span>
          )}
        </div>
        <div className="profile-info">
          <h2>{user?.displayName || '사용자'}</h2>
          <p>{user?.email}</p>
        </div>
        <div className="profile-badge">
          <span className="badge-icon">👑</span>
          <span className="badge-text">PRO</span>
        </div>
      </div>

      {/* 🆕 로그아웃 버튼을 여기로 이동 (사용량 자리) */}
      <button className="logout-btn" onClick={onLogout}>
        <span>🚪</span>
        <span>로그아웃</span>
      </button>

      <div className="quick-stats">
        <div className="stat-item">
          <span className="stat-value">127</span>
          <span className="stat-label">총 상담</span>
        </div>
        <div className="stat-divider"></div>
        <div className="stat-item">
          <span className="stat-value">23</span>
          <span className="stat-label">제안서</span>
        </div>
        <div className="stat-divider"></div>
        <div className="stat-item">
          <span className="stat-value">89</span>
          <span className="stat-label">증권분석</span>
        </div>
      </div>

      <div className="menu-section">
        {menuItems.map((item, index) => (
          <button key={index} className="menu-item">
            <span className="menu-icon">{item.icon}</span>
            <div className="menu-text">
              <h4>{item.title}</h4>
              <p>{item.desc}</p>
            </div>
            <span className="menu-arrow">›</span>
          </button>
        ))}
      </div>

      <div className="app-version">
        <p>ARK 지니 v2.0.0</p>
        <p>© 2024 ARK Insurance</p>
      </div>
    </div>
  );
}

export default MyPage;
