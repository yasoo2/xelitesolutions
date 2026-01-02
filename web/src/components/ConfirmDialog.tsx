import React from 'react';
import { useTranslation } from 'react-i18next';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({ isOpen, onClose, onConfirm, title, message }) => {
  const { t } = useTranslation();

  if (!isOpen) return null;

  return (
    <div className="dialog-overlay">
      <div className="dialog-box">
        <h3>{title}</h3>
        <p>{message}</p>
        <div className="dialog-actions">
          <button onClick={onClose} className="btn btn-secondary">{t('cancel', 'Cancel')}</button>
          <button onClick={onConfirm} className="btn btn-danger">{t('confirm', 'Confirm')}</button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
