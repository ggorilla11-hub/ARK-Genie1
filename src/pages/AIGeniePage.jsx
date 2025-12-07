import './AIGeniePage.css';

function AIGeniePage({ user }) {
  const agentFeatures = [
    { icon: '📞', title: '전화 걸기', desc: '고객에게 자동 전화' },
    { icon: '💬', title: '카톡/문자', desc: '메시지 자동 발송' },
    { icon: '📅', title: '캘린더 연동', desc: '구글 캘린더 동기화' },
    { icon: '📄', title: '서류 정리', desc: '자동 문서 관리' },
    { icon: '💰', title: '견적 산출', desc: '실시간 보험료 계산' },
    { icon: '🏥', title: '보상 처리', desc: '청구 자동화' },
  ];

  return (
    <div className="aigenie-page">
      <div className="aigenie-header">
        <div className="genie-avatar">
          <div className="avatar-glow"></div>
          <span className="avatar-emoji">🤖</span>
        </div>
        <h1>AI 지니</h1>
        <p>당신의 AI 비서가 업무를 대신합니다</p>
      </div>

      <div className="status-card">
        <div className="status-header">
          <span className="status-dot"></span>
          <span>대기 중</span>
        </div>
        <p className="status-desc">
          음성으로 명령하거나, 아래 기능을 선택하세요
        </p>
        <button className="voice-activate-btn">
          <span className="mic-icon">🎤</span>
          <span>음성으로 명령하기</span>
        </button>
      </div>

      <div className="section">
        <h2 className="section-title">✨ AI 에이전트 기능</h2>
        <p className="section-subtitle">곧 출시될 기능들입니다</p>
        
        <div className="features-grid">
          {agentFeatures.map((feature, index) => (
            <div key={index} className="feature-card coming-soon">
              <span className="feature-icon">{feature.icon}</span>
              <h4>{feature.title}</h4>
              <p>{feature.desc}</p>
              <span className="coming-badge">COMING SOON</span>
            </div>
          ))}
        </div>
      </div>

      <div className="preview-section">
        <h2 className="section-title">🎯 이런 일을 할 수 있어요</h2>
        <div className="preview-list">
          <div className="preview-item">
            <span className="preview-num">01</span>
            <p>"김철수 고객님께 생일 축하 문자 보내줘"</p>
          </div>
          <div className="preview-item">
            <span className="preview-num">02</span>
            <p>"내일 오전 미팅 일정 구글 캘린더에 등록해줘"</p>
          </div>
          <div className="preview-item">
            <span className="preview-num">03</span>
            <p>"이번 달 만기 도래 고객 리스트 정리해줘"</p>
          </div>
          <div className="preview-item">
            <span className="preview-num">04</span>
            <p>"삼성생명 암보험 견적 뽑아줘, 40세 남성"</p>
          </div>
        </div>
      </div>

      <div className="notify-card">
        <span className="notify-icon">🔔</span>
        <div className="notify-content">
          <h4>출시 알림 받기</h4>
          <p>AI 에이전트 기능이 출시되면 알려드릴게요</p>
        </div>
        <button className="notify-btn">구독</button>
      </div>
    </div>
  );
}

export default AIGeniePage;
