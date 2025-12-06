import { useState, useEffect } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from './firebase';
import LoginScreen from './components/LoginScreen';
import MagicBox from './components/MagicBox';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('로그아웃 오류:', error);
    }
  };

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        background: '#f5f7fa'
      }}>
        <div>로딩중...</div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen onLoginSuccess={setUser} />;
  }

  return (
    <div>
      <MagicBox user={user} />
      <button
        onClick={handleLogout}
        style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          background: 'rgba(255, 255, 255, 0.9)',
          border: '2px solid #1a3a5c',
          borderRadius: '50%',
          width: '40px',
          height: '40px',
          fontSize: '20px',
          cursor: 'pointer',
          zIndex: 1000
        }}
        title="로그아웃"
      >
        🚪
      </button>
    </div>
  );
}

export default App;
