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
        <div className="home-logo-container mb-6">
          <div className="brand-text-3d" style={{ fontSize: '80px', lineHeight: 1.2 }}>JOE</div>
          <div className="brand-ai-badge" style={{ fontSize: '16px', letterSpacing: '4px' }}>ARTIFICIAL INTELLIGENCE</div>
        </div>

        <p className="home-subtitle">
          {t('homeSubtitle', 'Your intelligent coding companion')}
        </p>

        <div className="home-actions">
          <button className="home-btn-primary" onClick={() => nav('/login')}>
            <span>{t('start_now', 'Start Now')}</span>
            <ArrowRight size={20} />
          </button>
        </div>
      </div>

      <div className="home-footer">
        © 2025 Xelite Solutions. All rights reserved.
      </div>
    </div>
  );
}
