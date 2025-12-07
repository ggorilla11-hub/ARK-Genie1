import { useState, useEffect } from 'react';
import './TopInfoBar.css';

function TopInfoBar() {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="top-info-bar">
      <div className="scrolling-container">
        <div className="scrolling-content">
          <span className="info-item highlight">🔥 현재 1,247명 사용중</span>
          <span className="info-item gold">💰 오늘 237건 제안서 생성</span>
          <span className="info-item">📈 코스피 2,847.32 (+1.2%)</span>
          <span className="info-item">💵 환율 1,298.50원</span>
          <span className="info-item gold">💬 "성공은 준비된 자에게 온다" - MDRT</span>
          <span className="info-item highlight">🔥 현재 1,247명 사용중</span>
          <span className="info-item gold">💰 오늘 237건 제안서 생성</span>
          <span className="info-item">📈 코스피 2,847.32 (+1.2%)</span>
        </div>
      </div>
    </div>
  );
}

export default TopInfoBar;
