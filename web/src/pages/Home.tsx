import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Sparkles, ArrowRight, Zap } from 'lucide-react';

export default function Home() {
  const { t } = useTranslation();
  const nav = useNavigate();
  return (
    <div className="home-page">
      {/* Background Elements */}
      <div className="home-bg-glow-1" />
      <div className="home-bg-glow-2" />
      
      <div className="home-content">
        <div className="home-logo-container">
          <div className="home-logo-ring">
            <span className="home-logo-text">J</span>
          </div>
        </div>
        
        <h1 className="home-title">
          JOE <span className="home-title-accent">AI</span>
        </h1>
        
        <p className="home-subtitle">
          {t('homeSubtitle', 'Your intelligent coding companion')}
        </p>
        
        <div className="home-actions">
          <button className="home-btn-primary" onClick={() => nav('/login')}>
            <span>{t('start_now', 'Start Now')}</span>
            <ArrowRight size={20} />
          </button>
          
          <button className="home-btn-secondary" onClick={() => window.open('https://xelitesolutions.com', '_blank')}>
            <span>{t('learn_more', 'Learn More')}</span>
            <Zap size={18} />
          </button>
        </div>
      </div>
      
      <div className="home-footer">
        © 2025 Xelite Solutions. All rights reserved.
      </div>
    </div>
  );
}
