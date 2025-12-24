import { useState } from 'react';
import './HomePage.css';

function HomePage({ user }) {
  const [showCalendar, setShowCalendar] = useState(false);

  // 오늘 할 일 데이터
  const todayTasks = [
    { id: 1, icon: '📞', iconType: 'call', title: '김철수 고객 전화', desc: '종신보험 리모델링 상담', time: '14:00' },
    { id: 2, icon: '🤝', iconType: 'meet', title: '박영희 고객 미팅', desc: '연금보험 계약 체결', time: '16:30' },
    { id: 3, icon: '🎂', iconType: 'bday', title: '이민수 고객 생일', desc: '축하 카톡 발송 예정', time: '종일' },
    { id: 4, icon: '💬', iconType: 'kakao', title: '최영수 고객 카톡', desc: '보험료 납입 안내', time: '10:00' },
  ];

  // 캘린더 날짜 데이터
  const calendarDays = [
    { day: 24, otherMonth: true }, { day: 25, otherMonth: true }, { day: 26, otherMonth: true },
    { day: 27, otherMonth: true }, { day: 28, otherMonth: true }, { day: 29, otherMonth: true },
    { day: 30, otherMonth: true },
    { day: 1 }, { day: 2 }, { day: 3 }, { day: 4 }, { day: 5 }, { day: 6 }, { day: 7 },
    { day: 8 }, { day: 9 }, { day: 10, hasEvent: true }, { day: 11 }, { day: 12 }, { day: 13 }, { day: 14 },
    { day: 15 }, { day: 16 }, { day: 17 }, { day: 18, hasEvent: true }, { day: 19 }, { day: 20, hasEvent: true }, { day: 21 },
    { day: 22 }, { day: 23, hasEvent: true }, { day: 24, today: true, hasEvent: true }, { day: 25 }, { day: 26 }, { day: 27 }, { day: 28, hasEvent: true },
    { day: 29 }, { day: 30 }, { day: 31 }
  ];

  return (
    <div className="home-page">
      {/* 헤더 */}
      <div className="app-header">
        <div className="header-logo">🧞‍♂️</div>
        <div className="header-info">
          <h1>AI지니</h1>
          <p>{user?.displayName || '설계사'}님의 AI 비서</p>
        </div>
        <div className="header-status">대기중</div>
      </div>

      {/* 콘텐츠 영역 */}
      <div className="content">
        {/* 인사 카드 */}
        <div className="greeting-card">
          <h2>안녕하세요, {user?.displayName || '설계사'}님! 👋</h2>
          <p>오늘도 AI지니가 함께합니다</p>
        </div>

        {/* 통계 그리드 - 4개 */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="icon">👥</div>
            <div className="value">127</div>
            <div className="label">전체 고객</div>
          </div>
          <div className="stat-card">
            <div className="icon">📞</div>
            <div className="value">12</div>
            <div className="label">이번 주 통화</div>
          </div>
          <div className="stat-card" onClick={() => setShowCalendar(true)}>
            <div className="icon">📅</div>
            <div className="value">3</div>
            <div className="label">오늘 일정</div>
          </div>
          <div className="stat-card">
            <div className="icon">🎯</div>
            <div className="value">5</div>
            <div className="label">신규 리드</div>
          </div>
        </div>

        {/* 오늘 할 일 */}
        <div className="section-title">📋 오늘 할 일</div>
        <div className="today-list">
          {todayTasks.map((task) => (
            <div key={task.id} className="today-item">
              <div className={`today-icon ${task.iconType}`}>{task.icon}</div>
              <div className="today-info">
                <h4>{task.title}</h4>
                <p>{task.desc}</p>
              </div>
              <div className="today-time">{task.time}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 캘린더 오버레이 */}
      {showCalendar && (
        <div className="calendar-overlay">
          <div className="calendar-header">
            <button className="calendar-back" onClick={() => setShowCalendar(false)}>←</button>
            <div className="calendar-title">📅 캘린더</div>
            <div className="calendar-month">2024년 12월</div>
          </div>
          <div className="calendar-content">
            <div className="calendar-grid">
              <div className="calendar-day-header">일</div>
              <div className="calendar-day-header">월</div>
              <div className="calendar-day-header">화</div>
              <div className="calendar-day-header">수</div>
              <div className="calendar-day-header">목</div>
              <div className="calendar-day-header">금</div>
              <div className="calendar-day-header">토</div>
              {calendarDays.map((d, i) => (
                <div 
                  key={i} 
                  className={`calendar-day ${d.otherMonth ? 'other-month' : ''} ${d.today ? 'today' : ''} ${d.hasEvent ? 'has-event' : ''}`}
                >
                  {d.day}
                </div>
              ))}
            </div>

            <div className="calendar-events">
              <div className="calendar-event-title">📋 12월 24일 (오늘)</div>
              {todayTasks.slice(0, 3).map((task) => (
                <div key={task.id} className="calendar-event-item">
                  <div className={`calendar-event-icon ${task.iconType}`}>{task.icon}</div>
                  <div className="calendar-event-info">
                    <h4>{task.title}</h4>
                    <p>{task.desc}</p>
                  </div>
                  <div className="calendar-event-time">{task.time}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default HomePage;
