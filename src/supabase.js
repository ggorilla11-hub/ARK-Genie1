// supabase.js - Supabase 클라이언트 설정
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// 카카오 로그인 함수
export const signInWithKakao = async () => {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'kakao',
    options: {
      redirectTo: window.location.origin
    }
  });
  if (error) {
    console.error('카카오 로그인 실패:', error);
    throw error;
  }
  return data;
};

// 로그아웃 함수
export const signOutSupabase = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error('로그아웃 실패:', error);
    throw error;
  }
};

// 현재 세션 확인
export const getSession = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
};
