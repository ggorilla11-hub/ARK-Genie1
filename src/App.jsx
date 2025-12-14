import { useState, useEffect } from 'react';
import { auth, provider, signInWithPopup, signOut, onAuthStateChanged } from './firebase';
import { supabase, signInWithKakao } from './supabase';
import HomePage from './pages/HomePage';
import CustomerPage from './pages/CustomerPage';
import AgentPage from './pages/AgentPage';
import MyPage from './pages/MyPage';
import ProspectPage from './ProspectPage';
import './App.css';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState('agent');

  useEffect(() => {
    // Firebase 인증 상태 확인
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        setLoading(false);
      }
    });

    // Supabase 카카오 인증 상태 확인
    const checkSupabaseSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser({
          uid: session.user.id,
          email: session.user.email,
          displayName: session.user.user_metadata?.name || session.user.email,
          photoURL: session.user.user_metadata?.avatar_url || null,
          provider: 'kakao'
        });
      }
      setLoading(false);
    };

    checkSupabaseSession();

    // Supabase 인증 상태 변화 감지
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setUser({
          uid: session.user.id,
          email: session.user.email,
          displayName: session.user.user_metadata?.name || session.user.email,
          photoURL: session.user.user_metadata?.avatar_url || null,
          provider: 'kakao'
        });
      } else if (event === 'SIGNED_OUT') {
        // Firebase 사용자도 없으면 로그아웃 상태
        if (!auth.currentUser) {
          setUser(null);
        }
      }
    });

    return () => {
      unsubscribe();
      subscription.unsubscribe();
    };
  }, []);

  // Google 로그인
  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Login error:', error);
    }
  };

  // 카카오 로그인
  const handleKakaoLogin = async () => {
    try {
      await signInWithKakao();
    } catch (error) {
      console.error('Kakao login error:', error);
      alert('카카오 로그인에 실패했습니다. 다시 시도해주세요.');
    }
  };

  // 로그아웃
  const handleLogout = async () => {
    try {
      // Firebase 로그아웃
      if (auth.currentUser) {
        await signOut(auth);
      }
      // Supabase 로그아웃
      await supabase.auth.signOut();
      setUser(null);
      setCurrentPage('agent');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner"></div>
        <p>로딩 중...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="login-screen">
        <div className="login-container">
          <div className="login-logo">🧞</div>
          <h1>ARK 지니</h1>
          <p>보험설계사를 위한 AI 어시스턴트</p>
          
          {/* 카카오 로그인 버튼 */}
          <button className="login-btn kakao-btn" onClick={handleKakaoLogin}>
            <img src="https://developers.kakao.com/assets/img/about/logos/kakaolink/kakaolink_btn_small.png" alt="Kakao" />
            카카오로 로그인
          </button>
          
          {/* Google 로그인 버튼 */}
          <button className="login-btn google-btn" onClick={handleLogin}>
            <img src="https://www.google.com/favicon.ico" alt="Google" />
            Google로 로그인
          </button>
        </div>
      </div>
    );
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'home':
        return <HomePage user={user} />;
      case 'customers':
        return <CustomerPage user={user} />;
      case 'agent':
        return <AgentPage user={user} />;
      case 'prospect':
        return <ProspectPage user={user} />;
      case 'my':
        return <MyPage user={user} onLogout={handleLogout} />;
      default:
        return <AgentPage user={user} />;
    }
  };

  const getNavClass = (page) => {
    return currentPage === page ? 'nav-item active' : 'nav-item';
  };

  const getAgentNavClass = () => {
    return currentPage === 'agent' ? 'nav-item main-nav active' : 'nav-item main-nav';
  };

  return (
    <div className="app">
      <main className="main-content">
        {renderPage()}
      </main>

      <nav className="bottom-nav">
        <button className={getNavClass('home')} onClick={() => setCurrentPage('home')}>
          <span className="nav-icon">🏠</span>
          <span className="nav-label">홈</span>
        </button>
        <button className={getNavClass('customers')} onClick={() => setCurrentPage('customers')}>
          <span className="nav-icon">👥</span>
          <span className="nav-label">고객</span>
        </button>
        <button className={getAgentNavClass()} onClick={() => setCurrentPage('agent')}>
          <span className="nav-icon-main">🧞</span>
          <span className="nav-label">AI지니</span>
        </button>
        <button className={getNavClass('prospect')} onClick={() => setCurrentPage('prospect')}>
          <span className="nav-icon">🎯</span>
          <span className="nav-label">고객발굴</span>
        </button>
        <button className={getNavClass('my')} onClick={() => setCurrentPage('my')}>
          <span className="nav-icon">👤</span>
          <span className="nav-label">마이</span>
        </button>
      </nav>
    </div>
  );
}

export default App;
