import { useNavigate, useLocation } from 'react-router-dom';
import './BottomNav.css';

function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { path: '/home', label: '홈', icon: 'home' },
    { path: '/customer', label: '고객', icon: 'customer' },
    { path: '/magicbox', label: '매직박스', icon: 'magicbox' },
    { path: '/aigenie', label: 'AI지니', icon: 'aigenie' },
    { path: '/mypage', label: '마이', icon: 'mypage' }
  ];

  const renderIcon = (icon, isActive) => {
    const color = isActive ? '#1a3a5c' : '#999';
    
    switch (icon) {
      case 'home':
        return (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            <polyline points="9 22 9 12 15 12 15 22"/>
          </svg>
        );
      case 'customer':
        return (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
        );
      case 'magicbox':
        return (
          <span style={{ fontSize: '24px' }}>🧞</span>
        );
      case 'aigenie':
        return (
          <span style={{ fontSize: '24px' }}>🤖</span>
        );
      case 'mypage':
        return (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
        );
      default:
        return null;
    }
  };

  return (
    <nav className="bottom-nav">
      {navItems.map((item) => {
        const isActive = location.pathname === item.path;
        return (
          <button
            key={item.path}
            className={`nav-item ${isActive ? 'active' : ''}`}
            onClick={() => navigate(item.path)}
          >
            <span className="nav-icon">
              {renderIcon(item.icon, isActive)}
            </span>
            <span className="nav-label">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export default BottomNav;
