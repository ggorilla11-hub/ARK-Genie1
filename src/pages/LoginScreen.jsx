import { useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '../firebase';
import './LoginScreen.css';

function LoginScreen({ onLoginSuccess }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [consents, setConsents] = useState({ terms: true, ai: true });

  const handleGoogleLogin = async () => {
    if (!consents.terms || !consents.ai) {
      setError('모든 항목에 동의해주세요.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await signInWithPopup(auth, googleProvider);
      onLoginSuccess(result.user);
    } catch (error) {
      console.error('로그인 오류:', error);
      if (error.code === 'auth/popup-closed-by-user') {
        setError('로그인이 취소되었습니다.');
      } else {
        setError('로그인 중 오류가 발생했습니다. 다시 시도해주세요.');
      }
    } finally {
      setLoading(false);
    }
  };

  const toggleConsent = (key) => {
    setConsents(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="login-screen">
      <div className="particles">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="particle" style={{ animationDelay: `${i}s` }}></div>
        ))}
      </div>

      <div className="login-container">
        <div className="logo-section">
          <div className="logo-wrapper">
            <div className="logo-glow"></div>
            <div className="logo-container">
              <span className="logo-emoji">🧞</span>
            </div>
          </div>
          <h1 className="app-title">ARK 지니</h1>
          <p className="app-subtitle">AI Insurance Master Genie</p>
          <p className="app-tagline">
            <span className="tagline-line"></span>
            200만원 비서를 월 5만원에
            <span className="tagline-line"></span>
          </p>
        </div>

        <div className="features">
          <div className="feature-item">
            <div className="feature-icon">📄</div>
            <span className="feature-text">증권분석</span>
          </div>
          <div className="feature-item">
            <div className="feature-icon">🎤</div>
            <span className="feature-text">음성대화</span>
          </div>
          <div className="feature-item">
            <div className="feature-icon">📋</div>
            <span className="feature-text">제안서</span>
          </div>
          <div className="feature-item">
            <div className="feature-icon">🤖</div>
            <span className="feature-text">AI비서</span>
          </div>
        </div>

        <div className="login-section">
          {error && <div className="error-message">{error}</div>}

          <div className="consent-section">
            <div className="consent-item" onClick={() => toggleConsent('terms')}>
              <div className={`consent-checkbox ${consents.terms ? 'checked' : ''}`}>
                {consents.terms && '✓'}
              </div>
              <span className="consent-text">
                <a href="#" onClick={(e) => e.stopPropagation()}>개인정보처리방침</a> 및{' '}
                <a href="#" onClick={(e) => e.stopPropagation()}>이용약관</a>에 동의합니다.
              </span>
            </div>
            <div className="consent-item" onClick={() => toggleConsent('ai')}>
              <div className={`consent-checkbox ${consents.ai ? 'checked' : ''}`}>
                {consents.ai && '✓'}
              </div>
              <span className="consent-text">
                ⚠️ AI는 틀릴 수 있습니다. 중요한 결정은 반드시 검증하세요.
              </span>
            </div>
          </div>

          <button 
            className="google-btn"
            onClick={handleGoogleLogin}
            disabled={loading}
          >
            {loading ? (
              <span className="btn-loading">로그인 중...</span>
            ) : (
              <>
                <svg className="google-icon" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                <span>Google로 시작하기</span>
              </>
            )}
          </button>

          <p className="footer-text">
            최초 가입 시 <strong>3일간 무료</strong>로 모든 기능 이용 가능
          </p>
        </div>
      </div>
    </div>
  );
}

export default LoginScreen;
