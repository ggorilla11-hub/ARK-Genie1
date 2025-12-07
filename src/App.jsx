import { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from './firebase';
import LoginScreen from './pages/LoginScreen';
import HomePage from './pages/HomePage';
import CustomerPage from './pages/CustomerPage';
import MagicBoxPage from './pages/MagicBoxPage';
import AIGeniePage from './pages/AIGeniePage';
import MyPage from './pages/MyPage';
import BottomNav from './components/BottomNav';
import TopInfoBar from './components/TopInfoBar';
import './App.css';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
      if (user && location.pathname === '/') {
        navigate('/magicbox');
      }
    });
    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/');
    } catch (error) {
      console.error('로그아웃 오류:', error);
    }
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner"></div>
        <p>로딩중...</p>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen onLoginSuccess={setUser} />;
  }

  const showNav = location.pathname !== '/';

  return (
    <div className="app-container">
      {showNav && <TopInfoBar />}
      <main className="main-content">
        <Routes>
          <Route path="/" element={<LoginScreen onLoginSuccess={setUser} />} />
          <Route path="/home" element={<HomePage user={user} />} />
          <Route path="/customer" element={<CustomerPage user={user} />} />
          <Route path="/magicbox" element={<MagicBoxPage user={user} />} />
          <Route path="/aigenie" element={<AIGeniePage user={user} />} />
          <Route path="/mypage" element={<MyPage user={user} onLogout={handleLogout} />} />
        </Routes>
      </main>
      {showNav && <BottomNav />}
    </div>
  );
}

export default App;
