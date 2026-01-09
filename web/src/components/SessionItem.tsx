import { useState, useRef, useEffect } from 'react';
import { MoreVertical, Trash2, Pin, Share2, Folder, Loader } from 'lucide-react';

interface SessionItemProps {
  session: { id: string; title: string; lastSnippet?: string; isPinned?: boolean; folderId?: string };
  isActive: boolean;
  isLoading?: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onPin: () => void;
  onShare: () => void;
  folders?: Array<{ _id: string; name: string }>;
  onMoveToFolder?: (folderId: string | null) => void;
  showInlineDelete?: boolean;
}

export default function SessionItem({
  session,
  isActive,
  isLoading,
  onSelect,
  onDelete,
  onPin,
  onShare,
  folders,
  onMoveToFolder,
  showInlineDelete,
}: SessionItemProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [menuView, setMenuView] = useState<'main' | 'move'>('main');
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
        setMenuView('main');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!showMenu) setMenuView('main');
  }, [showMenu]);

  const hasMoveTargets = Boolean(onMoveToFolder) && Array.isArray(folders) && folders.length > 0;

  return (
    <div className={`session-item ${isActive ? 'active' : ''}`}>
      <button className="session-btn" onClick={onSelect}>
        <div className="session-info">
          <div className="session-title">
             {session.isPinned && <Pin size={12} className="pin-icon" />}
             <span>{session.title}</span>
          </div>
          {session.lastSnippet && <div className="session-snippet">{session.lastSnippet}</div>}
        </div>
      </button>
      <button 
        className="menu-trigger" 
        onClick={(e) => {
          e.stopPropagation();
          setShowMenu(!showMenu);
        }}
        title="المزيد من الخيارات"
      >
        <MoreVertical size={16} />
      </button>

      {showInlineDelete ? (
        <button
          className="inline-delete-trigger"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
            setShowMenu(false);
          }}
          title="حذف"
          disabled={isLoading}
        >
          {isLoading ? <Loader size={16} className="animate-spin" /> : <Trash2 size={16} />}
        </button>
      ) : null}
      
      {showMenu && (
        <div className="session-menu" ref={menuRef}>
          {menuView === 'main' ? (
            <>
              <button onClick={(e) => { e.stopPropagation(); onPin(); setShowMenu(false); }}>
                <Pin size={14} /> {session.isPinned ? 'إلغاء التثبيت' : 'تثبيت'}
              </button>
              <button onClick={(e) => { e.stopPropagation(); onShare(); setShowMenu(false); }}>
                <Share2 size={14} /> مشاركة
              </button>
              {hasMoveTargets ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuView('move');
                  }}
                >
                  <Folder size={14} /> نقل إلى
                </button>
              ) : null}
              {onMoveToFolder && session.folderId ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onMoveToFolder(null);
                    setShowMenu(false);
                  }}
                >
                  <Folder size={14} /> إزالة من المجلد
                </button>
              ) : null}
              <div className="divider"></div>
              {isLoading ? (
                <button className="delete" disabled>
                  <Loader size={14} className="animate-spin" /> جاري الحذف...
                </button>
              ) : (
                <button className="delete" onClick={(e) => { e.stopPropagation(); onDelete(); setShowMenu(false); }}>
                  <Trash2 size={14} /> حذف
                </button>
              )}
            </>
          ) : (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuView('main');
                }}
              >
                رجوع
              </button>
              <div className="divider"></div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onMoveToFolder?.(null);
                  setShowMenu(false);
                }}
                disabled={!session.folderId}
              >
                <Folder size={14} /> جلسات أخرى
              </button>
              {(folders || []).map((f) => {
                const isCurrent = session.folderId === f._id;
                return (
                  <button
                    key={f._id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onMoveToFolder?.(f._id);
                      setShowMenu(false);
                    }}
                    disabled={isCurrent}
                  >
                    <Folder size={14} /> {f.name}
                  </button>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
