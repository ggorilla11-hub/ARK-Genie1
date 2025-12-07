import './CustomerPage.css';

function CustomerPage({ user }) {
  const mockCustomers = [
    { id: 1, name: '김철수', status: 'VIP', lastContact: '2일 전', policies: 3, birthday: '03/15' },
    { id: 2, name: '박영희', status: '일반', lastContact: '1주 전', policies: 2, birthday: '07/22' },
    { id: 3, name: '이민수', status: 'VIP', lastContact: '오늘', policies: 5, birthday: '11/08' },
    { id: 4, name: '최지영', status: '신규', lastContact: '방금', policies: 1, birthday: '01/30' },
    { id: 5, name: '정대훈', status: '일반', lastContact: '3일 전', policies: 2, birthday: '09/14' },
  ];

  return (
    <div className="customer-page">
      <div className="financial-house-banner">
        <div className="banner-content">
          <span className="banner-icon">🏠</span>
          <div className="banner-text">
            <h3>금융집짓기</h3>
            <p>고객의 재무 설계를 한눈에</p>
          </div>
        </div>
        <button className="banner-btn">시작하기 →</button>
      </div>

      <div className="search-bar">
        <span className="search-icon">🔍</span>
        <input type="text" placeholder="고객 이름, 연락처로 검색..." />
      </div>

      <div className="filter-tabs">
        <button className="filter-tab active">전체</button>
        <button className="filter-tab">VIP</button>
        <button className="filter-tab">신규</button>
        <button className="filter-tab">생일임박</button>
      </div>

      <div className="customer-list">
        {mockCustomers.map(customer => (
          <div key={customer.id} className="customer-card">
            <div className="customer-avatar">
              {customer.name[0]}
            </div>
            <div className="customer-info">
              <div className="customer-name-row">
                <h4>{customer.name}</h4>
                <span className={`customer-status ${customer.status.toLowerCase()}`}>
                  {customer.status}
                </span>
              </div>
              <div className="customer-meta">
                <span>📋 계약 {customer.policies}건</span>
                <span>🎂 {customer.birthday}</span>
                <span>📞 {customer.lastContact}</span>
              </div>
            </div>
            <button className="customer-action">→</button>
          </div>
        ))}
      </div>

      <button className="fab-button">
        <span>+</span>
      </button>
    </div>
  );
}

export default CustomerPage;
