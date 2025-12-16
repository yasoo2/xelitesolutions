import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  en: {
    translation: {
      login: 'Login',
      toggleTheme: 'Toggle Theme',
      homeSubtitle: 'A simple entry to the World of JOE',
      email: 'Email',
      password: 'Password',
      register: 'Register'
    }
  },
  ar: {
    translation: {
      login: 'تسجيل الدخول',
      toggleTheme: 'تبديل السمة',
      homeSubtitle: 'بوابة الدخول إلى عالم جو',
      email: 'البريد الإلكتروني',
      password: 'كلمة المرور',
      register: 'تسجيل'
    }
  }
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: localStorage.getItem('lang') || 'en',
    fallbackLng: 'en',
    interpolation: { escapeValue: false }
  });

export default i18n;
