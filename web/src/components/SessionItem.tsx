import { useState, useRef, useEffect } from 'react';
import { MoreVertical, Trash2, Pin, Share2, MessageSquare } from 'lucide-react';

interface SessionItemProps {
  session: { id: string; title: string; lastSnippet?: string; isPinned?: boolean };
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onPin: () => void;
  onShare: () => void;
}

export default function SessionItem({ session, isActive, onSelect, onDelete, onPin, onShare }: SessionItemProps) {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={`session-item ${isActive ? 'active' : ''}`}>
      <button className="session-btn" onClick={onSelect}>
        <div className="session-info">
          <div className="session-title">
             {session.isPinned && <Pin size={12} className="pin-icon" fill="currentColor" />}
             <span>{session.title}</span>
          </div>
          {session.lastSnippet && <div className="session-snippet">{session.lastSnippet}</div>}
        </div>
      </button>
      <button 
        className="menu-trigger" 
        onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
      >
        <MoreVertical size={16} />
      </button>
      
      {showMenu && (
        <div className="session-menu" ref={menuRef}>
          <button onClick={(e) => { e.stopPropagation(); onPin(); setShowMenu(false); }}>
            <Pin size={14} /> {session.isPinned ? 'إلغاء التثبيت' : 'تثبيت'}
          </button>
          <button onClick={(e) => { e.stopPropagation(); onShare(); setShowMenu(false); }}>
            <Share2 size={14} /> مشاركة
          </button>
          <div className="divider"></div>
          <button className="delete" onClick={(e) => { e.stopPropagation(); onDelete(); setShowMenu(false); }}>
            <Trash2 size={14} /> حذف
          </button>
        </div>
      )}
    </div>
  );
}
