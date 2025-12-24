import { useState } from 'react';
import './HomePage.css';

function HomePage({ user }) {
  // 🆕 캘린더 오버레이 상태
  const [showCalendar, setShowCalendar] = useState(false);

  // 🆕 일정 데이터 (나중에 API 연동)
  const schedules = [
    { time: '10:00', title: '김철수 고객 상담', desc: '종신보험 리모델링', status: 'done' },
    { time: '14:00', title: '박영희 고객 미팅', desc: '연금보험 제안', status: 'done' },
    { time: '16:30', title: '이민수 고객 전화', desc: '자동차보험 갱신', status: 'upcoming' },
  ];

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

      {/* 🆕 일정 섹션 - 전체보기 버튼 추가 */}
      <div className="section">
        <div className="section-header">
          <h2 className="section-title">📅 오늘의 일정</h2>
          <button 
            className="view-all-btn"
            onClick={() => setShowCalendar(true)}
          >
            전체보기
          </button>
        </div>
        <div className="schedule-list">
          {schedules.map((schedule, index) => (
            <div 
              key={index} 
              className={`schedule-item ${schedule.status === 'upcoming' ? 'upcoming' : ''}`}
            >
              <div className="schedule-time">{schedule.time}</div>
              <div className="schedule-content">
                <h4>{schedule.title}</h4>
                <p>{schedule.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 🆕 캘린더 오버레이 */}
      {showCalendar && (
        <div className="calendar-overlay" onClick={() => setShowCalendar(false)}>
          <div className="calendar-modal" onClick={(e) => e.stopPropagation()}>
            <div className="calendar-header">
              <h3>📅 이번 주 일정</h3>
              <button 
                className="close-btn"
                onClick={() => setShowCalendar(false)}
              >
                ✕
              </button>
            </div>
            
            <div className="calendar-content">
              {/* 요일 헤더 */}
              <div className="calendar-days">
                {['월', '화', '수', '목', '금', '토', '일'].map((day, i) => (
                  <div key={i} className={`day-header ${i >= 5 ? 'weekend' : ''}`}>
                    {day}
                  </div>
                ))}
              </div>
              
              {/* 날짜 그리드 */}
              <div className="calendar-grid">
                {[23, 24, 25, 26, 27, 28, 29].map((date, i) => (
                  <div 
                    key={i} 
                    className={`date-cell ${date === 25 ? 'today' : ''} ${i >= 5 ? 'weekend' : ''}`}
                  >
                    <span className="date-number">{date}</span>
                    {date === 25 && (
                      <div className="date-events">
                        <div className="event-dot blue"></div>
                        <div className="event-dot green"></div>
                        <div className="event-dot orange"></div>
                      </div>
                    )}
                    {date === 26 && (
                      <div className="date-events">
                        <div className="event-dot blue"></div>
                      </div>
                    )}
                    {date === 27 && (
                      <div className="date-events">
                        <div className="event-dot green"></div>
                        <div className="event-dot orange"></div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              
              {/* 오늘 일정 상세 */}
              <div className="calendar-today">
                <h4>🗓️ 12월 25일 (수) 일정</h4>
                <div className="today-schedule-list">
                  {schedules.map((schedule, index) => (
                    <div key={index} className="today-schedule-item">
                      <div className={`schedule-dot ${schedule.status}`}></div>
                      <div className="schedule-time-small">{schedule.time}</div>
                      <div className="schedule-info">
                        <span className="schedule-title-small">{schedule.title}</span>
                        <span className="schedule-desc-small">{schedule.desc}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="calendar-footer">
              <button 
                className="calendar-action-btn"
                onClick={() => setShowCalendar(false)}
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default HomePage;
