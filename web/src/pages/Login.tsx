import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { API_URL as API } from '../config';

export default function Login() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function register() {
    setError(null);
    const res = await fetch(`${API}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, role: 'OWNER' }),
    });
    if (!res.ok) {
      const text = await res.text();
      setError(text);
      return;
    }
    await login();
  }

  async function login() {
    setError(null);
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data?.error || 'Login failed');
      return;
    }
    localStorage.setItem('token', data.token);
    nav('/joe');
  }

  return (
    <div className="login">
      <h2>{t('login')}</h2>
      <div className="form">
        <label>{t('email')}</label>
        <input value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
        <label>{t('password')}</label>
        <input value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder="••••••••" />
        {error && <div className="error">{error}</div>}
        <div className="row">
          <button className="btn btn-yellow" onClick={login}>{t('login')}</button>
          <button className="btn" onClick={register}>{t('register')}</button>
        </div>
      </div>
    </div>
  );
}
