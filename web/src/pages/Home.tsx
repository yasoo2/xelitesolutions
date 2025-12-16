import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

export default function Home() {
  const { t } = useTranslation();
  const nav = useNavigate();
  return (
    <div className="home">
      <h1 className="title">JOE</h1>
      <p className="subtitle">{t('homeSubtitle')}</p>
      <button className="btn btn-yellow" onClick={() => nav('/login')}>{t('login')}</button>
    </div>
  );
}
