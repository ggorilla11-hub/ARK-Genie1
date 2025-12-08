import { useState, useEffect } from 'react';
import { auth, provider, signInWithPopup, signOut, onAuthStateChanged } from './firebase';
import HomePage from './pages/HomePage';
import CustomersPage from './pages/CustomersPage';
import MagicBoxPage from './pages/MagicBoxPage';
import AgentPage from './pages/AgentPage';
import MyPage from './pages/MyPage';
import './App.css';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState('magic');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Login error:', error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setCurrentPage('magic');
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
          <button className="login-btn" onClick={handleLogin}>
            <img src="https://www.google.com/favicon.ico" alt="Google" />
            Google로 로그인
          </button>
        </div>
      </div>
    );
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'home': return <HomePage user={user} />;
      case 'customers': return <CustomersPage user={user} />;
      case 'magic': return <MagicBoxPage user={user} />;
      case 'agent': return <AgentPage user={user} />;
      case 'my': return <MyPage user={user} onLogout={handleLogout} />;
      default: return <MagicBoxPage user={user} />;
    }
  };

  return (
    <div className="app">
