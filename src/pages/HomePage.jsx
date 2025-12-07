import './HomePage.css';

function HomePage({ user }) {
  return (
    <div className="home-page">
      <div className="home-header">
        <div className="welcome-section">
          <h1>안녕하세요, {user?.displayName || '설계사'}님! 👋</h1>
          <p>오늘도 좋은 하루 되세요</p>
        </div>
      </div>

      <div className="quick-stats">
        <div className="stat-card">
          <span className="stat-icon">📊</span>
          <div className="stat-info">
            <span className="stat-value">127</span>
            <span className="stat-label">이번 달 상담</span>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon">📄</span>
          <div className="stat-info">
            <span className="stat-value">23</span>
            <span className="stat-label">제안서 생성</span>
          </div>
        </div>
        <div className="stat-card gold">
          <span className="stat-icon">🏆</span>
          <div className="stat-info">
            <span className="stat-value">TOP 15%</span>
            <span className="stat-label">이번 달 순위</span>
          </div>
        </div>
      </div>

      <div className="section">
        <h2 className="section-title">💡 오늘의 인사이트</h2>
        <div className="insight-card">
          <p className="insight-quote">"성공하는 설계사는 고객의 문제를 해결하고, 실패하는 설계사는 상품을 판매한다."</p>
          <span className="insight-author">- MDRT 명언</span>
        </div>
      </div>

      <div className="section">
        <h2 className="section-title">🔥 인기 기능</h2>
        <div className="feature-list">
          <div className="feature-card">
            <span className="feature-emoji">📷</span>
            <div className="feature-info">
              <h3>증권 분석</h3>
              <p>사진 한 장으로 즉시 분석</p>
            </div>
            <span className="feature-badge">HOT</span>
          </div>
          <div className="feature-card">
            <span className="feature-emoji">🎤</span>
            <div className="feature-info">
              <h3>음성 상담</h3>
              <p>말로 물어보세요</p>
            </div>
          </div>
          <div className="feature-card">
            <span className="feature-emoji">📋</span>
            <div className="feature-info">
              <h3>제안서 생성</h3>
              <p>1분 만에 맞춤 제안서</p>
            </div>
            <span className="feature-badge new">NEW</span>
          </div>
        </div>
      </div>

      <div className="section">
        <h2 className="section-title">📅 오늘의 일정</h2>
        <div className="schedule-list">
          <div className="schedule-item">
            <div className="schedule-time">10:00</div>
            <div className="schedule-content">
              <h4>김철수 고객 상담</h4>
              <p>종신보험 리모델링</p>
            </div>
          </div>
          <div className="schedule-item">
            <div className="schedule-time">14:00</div>
            <div className="schedule-content">
              <h4>박영희 고객 미팅</h4>
              <p>연금보험 제안</p>
            </div>
          </div>
          <div className="schedule-item upcoming">
            <div className="schedule-time">16:30</div>
            <div className="schedule-content">
              <h4>이민수 고객 전화</h4>
              <p>자동차보험 갱신</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default HomePage;
