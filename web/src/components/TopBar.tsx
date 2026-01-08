import { useEffect, useMemo, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Sun, Moon, LogIn, LogOut, Globe, ChevronDown, Wrench, Search, X } from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';
import { API_URL as API } from '../config';

type ToolPermission = 'read' | 'write' | 'deploy' | 'delete' | 'execute' | 'internet';

type ToolDefinition = {
  name: string;
  description?: string;
  version: string;
  tags: string[];
  inputSchema: Record<string, any>;
  outputSchema: Record<string, any>;
  permissions: ToolPermission[];
  sideEffects: ToolPermission[];
  rateLimitPerMinute: number;
  auditFields: string[];
  mockSupported: boolean;
};

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'ar', label: 'العربية' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'ru', label: 'Русский' },
  { code: 'es', label: 'Español' }
];

// Corresponds to Section 3 (Core Product) and Section 4 (Internationalization) of the JOE MASTER SPEC
// Provides global navigation, theme switching, and language selection.
export default function TopBar() {
  const { i18n, t } = useTranslation();
  const [theme, setTheme] = useState<'dark' | 'light'>(() => (localStorage.getItem('theme') as any) || 'dark');
  const [lang, setLang] = useState<string>(() => localStorage.getItem('lang') || 'en');
  const [isLangOpen, setIsLangOpen] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isToolsOpen, setIsToolsOpen] = useState(false);
  const [tools, setTools] = useState<ToolDefinition[]>([]);
  const [toolsMeta, setToolsMeta] = useState<{ count: number; realCount: number; noopCount: number } | null>(null);
  const [toolsLoading, setToolsLoading] = useState(false);
  const [toolsError, setToolsError] = useState<string | null>(null);
  const [toolsQuery, setToolsQuery] = useState('');
  const [activeGroup, setActiveGroup] = useState<'all' | 'search' | 'read' | 'write' | 'shell' | 'browse' | 'image' | 'git' | 'security' | 'payments' | 'database' | 'ui' | 'other'>('all');
  const [activeToolName, setActiveToolName] = useState<string | null>(null);
  const langMenuRef = useRef<HTMLDivElement>(null);
  const nav = useNavigate();

  useEffect(() => {
    localStorage.setItem('theme', theme);
    document.documentElement.dataset.theme = theme;
    if (theme === 'light') {
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
    }
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('lang', lang);
    i18n.changeLanguage(lang);
    document.documentElement.setAttribute('lang', lang);
    document.documentElement.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
  }, [lang, i18n]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (langMenuRef.current && !langMenuRef.current.contains(event.target as Node)) {
        setIsLangOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isToolsOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsToolsOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isToolsOpen]);

  useEffect(() => {
    if (!isToolsOpen) return;
    let cancelled = false;
    setToolsLoading(true);
    setToolsError(null);
    (async () => {
      try {
        const res = await fetch(`${API}/tools`, { method: 'GET' });
        const raw = await res.text();
        const data = raw ? JSON.parse(raw) : null;
        if (!res.ok) throw new Error(String(data?.error || data?.message || raw || `HTTP ${res.status}`));
        const nextTools = Array.isArray(data?.tools) ? data.tools : [];
        const meta = {
          count: Number(data?.count || nextTools.length),
          realCount: Number(data?.realCount || 0),
          noopCount: Number(data?.noopCount || 0),
        };
        if (cancelled) return;
        setTools(nextTools);
        setToolsMeta(meta);
        setActiveToolName((prev) => prev || (nextTools.length ? (String(nextTools[0]?.name || '') || null) : null));
      } catch (e: any) {
        if (cancelled) return;
        setToolsError(String(e?.message || e));
      } finally {
        if (!cancelled) setToolsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isToolsOpen]);

  const toolGroups = useMemo(() => {
    return [
      { id: 'all' as const, label: t('toolCatalogAll', 'الكل') },
      { id: 'search' as const, label: t('toolCategorySearch', 'بحث') },
      { id: 'read' as const, label: t('toolCategoryRead', 'قراءة') },
      { id: 'write' as const, label: t('toolCategoryWrite', 'كتابة') },
      { id: 'shell' as const, label: t('toolCategoryShell', 'Terminal') },
      { id: 'browse' as const, label: t('toolCategoryBrowse', 'Browser') },
      { id: 'image' as const, label: t('toolCategoryImage', 'Image') },
      { id: 'git' as const, label: t('toolGroupGit', 'Git') },
      { id: 'security' as const, label: t('toolGroupSecurity', 'Security') },
      { id: 'payments' as const, label: t('toolGroupPayments', 'Payments') },
      { id: 'database' as const, label: t('toolGroupDatabase', 'Database') },
      { id: 'ui' as const, label: t('toolGroupUI', 'UI') },
      { id: 'other' as const, label: t('toolGroupOther', 'Other') },
    ];
  }, [t]);

  const getToolGroup = (tool: ToolDefinition) => {
    const name = String(tool?.name || '').toLowerCase();
    const tags = Array.isArray(tool?.tags) ? tool.tags.map(x => String(x || '').toLowerCase()) : [];
    const hasTag = (...needles: string[]) => needles.some(n => tags.includes(n));

    if (name.startsWith('browser_')) return 'browse' as const;
    if (name.includes('image_generate') || hasTag('image')) return 'image' as const;
    if (name.includes('git') || name.includes('github') || hasTag('git', 'github')) return 'git' as const;
    if (name.includes('payment') || hasTag('payments', 'stripe')) return 'payments' as const;
    if (name.includes('secret') || name.includes('policy') || name.includes('auth') || hasTag('security')) return 'security' as const;
    if (name.includes('db') || hasTag('database', 'db')) return 'database' as const;
    if (name.startsWith('ui_') || hasTag('ui', 'frontend')) return 'ui' as const;
    if (name.includes('web_search') || name.includes('knowledge') || name.includes('deep_research') || name.includes('http_fetch') || name.includes('html_extract') || hasTag('search')) return 'search' as const;
    if (name.includes('shell') || name.includes('install') || name.includes('check_syntax') || name.includes('quality_run') || hasTag('shell')) return 'shell' as const;

    const isRead =
      name.includes('file_read') ||
      name.includes('read_file_tree') ||
      name === 'ls' ||
      name.includes('grep_search') ||
      name.includes('fs_glob');
    const isWrite =
      name.includes('file_write') ||
      name.includes('file_edit') ||
      name.includes('scaffold');
    if (isWrite) return 'write' as const;
    if (isRead) return 'read' as const;

    return 'other' as const;
  };

  const activeTool = useMemo(() => {
    if (!activeToolName) return null;
    return tools.find(tl => String(tl?.name || '') === activeToolName) || null;
  }, [activeToolName, tools]);

  const filteredTools = useMemo(() => {
    const q = toolsQuery.trim().toLowerCase();
    return tools
      .filter((tool) => {
        if (activeGroup === 'all') return true;
        return getToolGroup(tool) === activeGroup;
      })
      .filter((tool) => {
        if (!q) return true;
        const hay = [
          tool.name,
          tool.description || '',
          ...(Array.isArray(tool.tags) ? tool.tags : []),
          ...(Array.isArray(tool.permissions) ? tool.permissions : []),
          ...(Array.isArray(tool.sideEffects) ? tool.sideEffects : []),
        ]
          .map((x) => String(x || '').toLowerCase())
          .join(' ');
        return hay.includes(q);
      })
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }, [activeGroup, tools, toolsQuery]);

  const currentLangLabel = LANGUAGES.find(l => l.code === lang)?.label || 'English';

  return (
    <div className="topbar">
      <div className="brand" onClick={() => nav('/')}>
        <span>J</span>
        <span className="logo-letter-yellow">O</span>
        <span>E</span>
      </div>
      <div className="spacer" />
      
      <div className="topbar-actions">
        
        {/* Language Dropdown */}
        <div className="lang-dropdown" ref={langMenuRef}>
          <button 
            className={`lang-btn ${isLangOpen ? 'active' : ''}`}
            onClick={() => setIsLangOpen(!isLangOpen)}
          >
            <Globe size={20} />
            <span className="lang-label">{currentLangLabel}</span>
            <ChevronDown size={16} className={`chevron ${isLangOpen ? 'open' : ''}`} />
          </button>
          
          {isLangOpen && (
            <div className="lang-menu">
              {LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  className={`lang-option ${lang === l.code ? 'active' : ''}`}
                  onClick={() => {
                    setLang(l.code);
                    setIsLangOpen(false);
                  }}
                >
                  {l.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          className={`action-btn ${isToolsOpen ? 'active' : ''}`}
          aria-label={t('toolCatalogTitle', 'كتالوج الأدوات')}
          title={t('toolCatalogTitle', 'كتالوج الأدوات')}
          onClick={() => {
            setIsLangOpen(false);
            setIsToolsOpen(true);
          }}
        >
          <Wrench size={20} />
        </button>

        {/* Theme Toggle */}
        <button
          className="action-btn"
          aria-label={t('toggleTheme')}
          title={t('toggleTheme')}
          onClick={() => {
            const next = theme === 'dark' ? 'light' : 'dark';
            setTheme(next);
          }}
        >
          {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
        </button>

        {/* Login/Logout Button */}
        <button 
          className="action-btn"
          onClick={() => {
            if (localStorage.getItem('token')) {
              setIsConfirmOpen(true);
            } else {
                nav('/login');
            }
          }} 
          title={localStorage.getItem('token') ? t('logout', 'Logout') : t('login')}
        >
          {localStorage.getItem('token') ? <LogOut size={20} /> : <LogIn size={20} />}
        </button>
      </div>
      <ConfirmDialog
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={() => {
          localStorage.removeItem('token');
          setIsConfirmOpen(false);
          nav('/login');
        }}
        title={t('confirmLogout', 'Confirm Logout')}
        message={t('areYouSureLogout', 'Are you sure you want to logout?')}
      />

      {isToolsOpen && (
        <div className="providers-modal-overlay" onClick={() => setIsToolsOpen(false)}>
          <div className="providers-modal" onClick={(e) => e.stopPropagation()}>
            <div className="providers-left">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontWeight: 800 }}>
                <Wrench size={18} />
                <span>{t('toolCatalogTitle', 'كتالوج الأدوات')}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {toolGroups.map((g) => {
                  const isActive = activeGroup === g.id;
                  return (
                    <button
                      key={g.id}
                      onClick={() => setActiveGroup(g.id)}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 14,
                        border: `1px solid ${isActive ? 'rgba(var(--accent-primary-rgb),0.65)' : 'var(--border-color)'}`,
                        background: isActive ? 'rgba(var(--accent-primary-rgb),0.14)' : 'rgba(255,255,255,0.02)',
                        color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                        cursor: 'pointer',
                        fontWeight: 800,
                        fontSize: 13,
                        textAlign: 'start',
                      }}
                    >
                      {g.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="providers-right">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ fontSize: 16, fontWeight: 900 }}>{t('toolCatalogTitle', 'كتالوج الأدوات')}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {toolsMeta
                      ? t('toolCatalogCounts', 'الإجمالي: {{count}} • الفعلية: {{real}} • الوهمية: {{noop}}', {
                          count: toolsMeta.count,
                          real: toolsMeta.realCount,
                          noop: toolsMeta.noopCount,
                        })
                      : null}
                  </div>
                </div>
                <button
                  onClick={() => setIsToolsOpen(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                  aria-label={t('close', 'إغلاق')}
                  title={t('close', 'إغلاق')}
                >
                  <X size={20} />
                </button>
              </div>

              <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center' }}>
                <div style={{ flex: 1, position: 'relative' }}>
                  <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    value={toolsQuery}
                    onChange={(e) => setToolsQuery(e.target.value)}
                    placeholder={t('toolCatalogSearchPlaceholder', 'ابحث عن أداة بالاسم/الوصف/الوسوم…')}
                    style={{
                      width: '100%',
                      height: 40,
                      borderRadius: 14,
                      border: '1px solid var(--border-color)',
                      background: 'rgba(255,255,255,0.03)',
                      color: 'var(--text-primary)',
                      paddingLeft: 38,
                      paddingRight: 12,
                      outline: 'none',
                      fontSize: 13,
                      fontWeight: 700,
                    }}
                  />
                </div>
                <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-muted)' }}>
                  {t('toolCatalogFilteredCount', '{{n}} نتيجة', { n: filteredTools.length })}
                </div>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'stretch' }}>
                <div
                  style={{
                    flex: '0 0 330px',
                    width: 330,
                    minWidth: 280,
                    maxWidth: '100%',
                    border: '1px solid var(--border-color)',
                    borderRadius: 18,
                    background: 'rgba(255,255,255,0.02)',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    maxHeight: '60vh',
                  }}
                >
                  <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', fontSize: 12, fontWeight: 900, color: 'var(--text-secondary)' }}>
                    {t('toolCatalogToolsList', 'الأدوات')}
                  </div>
                  <div style={{ overflow: 'auto' }}>
                    {toolsLoading ? (
                      <div style={{ padding: 12, color: 'var(--text-muted)', fontSize: 13 }}>{t('toolCatalogLoading', 'جارٍ تحميل الأدوات…')}</div>
                    ) : toolsError ? (
                      <div style={{ padding: 12, color: 'var(--text-muted)', fontSize: 13 }}>
                        {t('toolCatalogError', 'تعذر تحميل الأدوات')} {String(toolsError || '')}
                      </div>
                    ) : filteredTools.length === 0 ? (
                      <div style={{ padding: 12, color: 'var(--text-muted)', fontSize: 13 }}>{t('toolCatalogNoResults', 'لا توجد أدوات مطابقة.')}</div>
                    ) : (
                      filteredTools.map((tool) => {
                        const isActive = String(tool.name) === String(activeToolName || '');
                        return (
                          <button
                            key={tool.name}
                            onClick={() => setActiveToolName(tool.name)}
                            style={{
                              width: '100%',
                              textAlign: 'start',
                              padding: '10px 12px',
                              border: 0,
                              borderBottom: '1px solid rgba(255,255,255,0.04)',
                              background: isActive ? 'rgba(var(--accent-primary-rgb),0.12)' : 'transparent',
                              cursor: 'pointer',
                              color: 'var(--text-primary)',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 4,
                            }}
                          >
                            <div style={{ fontSize: 13, fontWeight: 900 }}>{tool.name}</div>
                            {tool.description ? (
                              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                                {String(tool.description).slice(0, 90)}
                                {String(tool.description).length > 90 ? '…' : ''}
                              </div>
                            ) : null}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>

                <div
                  style={{
                    flex: '1 1 420px',
                    minWidth: 280,
                    border: '1px solid var(--border-color)',
                    borderRadius: 18,
                    background: 'rgba(255,255,255,0.02)',
                    overflow: 'auto',
                    padding: 14,
                    maxHeight: '60vh',
                  }}
                >
                  {!activeTool ? (
                    <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{t('toolCatalogSelectHint', 'اختر أداة لعرض التفاصيل.')}</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ fontSize: 16, fontWeight: 950 }}>{activeTool.name}</div>
                        {activeTool.description ? (
                          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{activeTool.description}</div>
                        ) : null}
                      </div>

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        <div
                          style={{
                            padding: '6px 10px',
                            borderRadius: 999,
                            border: '1px solid var(--border-color)',
                            background: 'rgba(255,255,255,0.03)',
                            fontSize: 12,
                            fontWeight: 900,
                            color: 'var(--text-secondary)',
                          }}
                        >
                          {t('toolCatalogVersion', 'الإصدار')}: {activeTool.version}
                        </div>
                        <div
                          style={{
                            padding: '6px 10px',
                            borderRadius: 999,
                            border: '1px solid var(--border-color)',
                            background: 'rgba(255,255,255,0.03)',
                            fontSize: 12,
                            fontWeight: 900,
                            color: 'var(--text-secondary)',
                          }}
                        >
                          {t('toolCatalogRateLimit', 'الحد/دقيقة')}: {Number(activeTool.rateLimitPerMinute || 0)}
                        </div>
                        <div
                          style={{
                            padding: '6px 10px',
                            borderRadius: 999,
                            border: '1px solid var(--border-color)',
                            background: 'rgba(255,255,255,0.03)',
                            fontSize: 12,
                            fontWeight: 900,
                            color: 'var(--text-secondary)',
                          }}
                        >
                          {t('toolCatalogMockSupported', 'يدعم المحاكاة')}: {activeTool.mockSupported ? t('yes', 'نعم') : t('no', 'لا')}
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ fontSize: 12, fontWeight: 950, color: 'var(--text-secondary)' }}>{t('toolCatalogTags', 'الوسوم')}</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {(Array.isArray(activeTool.tags) ? activeTool.tags : []).length ? (
                            activeTool.tags.map((tag) => (
                              <span
                                key={tag}
                                style={{
                                  padding: '6px 10px',
                                  borderRadius: 999,
                                  border: '1px solid var(--border-color)',
                                  background: 'rgba(255,255,255,0.03)',
                                  fontSize: 12,
                                  fontWeight: 900,
                                  color: 'var(--text-secondary)',
                                }}
                              >
                                {tag}
                              </span>
                            ))
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{t('none', 'لا يوجد')}</span>
                          )}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        <div style={{ flex: '1 1 220px' }}>
                          <div style={{ fontSize: 12, fontWeight: 950, color: 'var(--text-secondary)', marginBottom: 8 }}>
                            {t('toolCatalogPermissions', 'الصلاحيات')}
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {(Array.isArray(activeTool.permissions) ? activeTool.permissions : []).length ? (
                              activeTool.permissions.map((p) => (
                                <span
                                  key={p}
                                  style={{
                                    padding: '6px 10px',
                                    borderRadius: 999,
                                    border: '1px solid var(--border-color)',
                                    background: 'rgba(255,255,255,0.03)',
                                    fontSize: 12,
                                    fontWeight: 900,
                                    color: 'var(--text-secondary)',
                                  }}
                                >
                                  {p}
                                </span>
                              ))
                            ) : (
                              <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{t('none', 'لا يوجد')}</span>
                            )}
                          </div>
                        </div>
                        <div style={{ flex: '1 1 220px' }}>
                          <div style={{ fontSize: 12, fontWeight: 950, color: 'var(--text-secondary)', marginBottom: 8 }}>
                            {t('toolCatalogSideEffects', 'الآثار الجانبية')}
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {(Array.isArray(activeTool.sideEffects) ? activeTool.sideEffects : []).length ? (
                              activeTool.sideEffects.map((p) => (
                                <span
                                  key={p}
                                  style={{
                                    padding: '6px 10px',
                                    borderRadius: 999,
                                    border: '1px solid var(--border-color)',
                                    background: 'rgba(255,255,255,0.03)',
                                    fontSize: 12,
                                    fontWeight: 900,
                                    color: 'var(--text-secondary)',
                                  }}
                                >
                                  {p}
                                </span>
                              ))
                            ) : (
                              <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{t('none', 'لا يوجد')}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div style={{ fontSize: 12, fontWeight: 950, color: 'var(--text-secondary)' }}>{t('toolCatalogInputSchema', 'مخطط الإدخال')}</div>
                        <pre
                          className="log-viewer"
                          style={{ margin: 0, maxHeight: 260, overflow: 'auto', borderRadius: 14, border: '1px solid var(--border-color)' }}
                        >
                          {JSON.stringify(activeTool.inputSchema ?? {}, null, 2)}
                        </pre>
                        <div style={{ fontSize: 12, fontWeight: 950, color: 'var(--text-secondary)' }}>{t('toolCatalogOutputSchema', 'مخطط الإخراج')}</div>
                        <pre
                          className="log-viewer"
                          style={{ margin: 0, maxHeight: 260, overflow: 'auto', borderRadius: 14, border: '1px solid var(--border-color)' }}
                        >
                          {JSON.stringify(activeTool.outputSchema ?? {}, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
