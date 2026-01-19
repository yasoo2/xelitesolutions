import React from 'react';
import { useTranslation } from 'react-i18next';
import { User, Shield, Mail, Calendar } from 'lucide-react';

interface ProfileDialogProps {
    isOpen: boolean;
    onClose: () => void;
    user: {
        name: string;
        email: string;
        role: string;
        picture?: string;
    };
}

const ProfileDialog: React.FC<ProfileDialogProps> = ({ isOpen, onClose, user }) => {
    const { t } = useTranslation();

    if (!isOpen) return null;

    return (
        <div className="dialog-overlay" onClick={onClose}>
            <div className="dialog-box profile-dialog" onClick={(e) => e.stopPropagation()}>
                <div className="profile-header">
                    <div className="profile-avatar-large">
                        {user.picture ? (
                            <img src={user.picture} alt={user.name} />
                        ) : (
                            <User size={48} />
                        )}
                    </div>
                    <h3>{user.name || 'User'}</h3>
                    <div className="profile-role-badge">
                        <Shield size={14} />
                        <span>{user.role}</span>
                    </div>
                </div>

                <div className="profile-details">
                    <div className="detail-item">
                        <Mail size={16} className="detail-icon" />
                        <div className="detail-content">
                            <label>{t('email', 'Email')}</label>
                            <span>{user.email}</span>
                        </div>
                    </div>
                    {/* We could add joined date if available in JWT later */}
                    <div className="detail-item">
                        <Calendar size={16} className="detail-icon" />
                        <div className="detail-content">
                            <label>{t('joined', 'Joined')}</label>
                            <span>Just now</span>
                        </div>
                    </div>
                </div>

                <div className="dialog-actions">
                    <button onClick={onClose} className="btn btn-primary">{t('close', 'Close')}</button>
                </div>
            </div>
        </div>
    );
};

export default ProfileDialog;
