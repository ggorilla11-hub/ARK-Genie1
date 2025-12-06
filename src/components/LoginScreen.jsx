import { useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '../firebase';
import './LoginScreen.css';

function LoginScreen({ onLoginSuccess }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError('');

    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      console.log('로그인 성공:', user.displayName);
      onLoginSuccess(user);
    } catch (error) {
      console.error('로그인 오류:', error);
      setError('로그인 중 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="logo-container">
        <div className="logo">
          <div className="logo-text">🧞</div>
        </div>
        <h1 className="app-name">ARK 지니</h1>
        <p className="app-slogan">AI Insurance Master Genie</p>
        <p className="app-sub-slogan">200만원 비서를 월 5만원에</p>
      </div>

      {error && <div className="error-message">{error}</div>}

      <button 
        className="google-login-btn"
        onClick={handleGoogleLogin}
        disabled={loading}
      >
        {loading ? (
          <span>로그인 중...</span>
        ) : (
          <span>Google로 시작하기</span>
        )}
      </button>

      <p className="login-footer">
        최초 가입 시 3일간 무료로 모든 기능을 이용하실 수 있습니다
      </p>
    </div>
  );
}

export default LoginScreen;
