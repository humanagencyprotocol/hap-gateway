import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../hooks/useTheme';

const THEME_ICONS: Record<string, string> = {
  system: '\u25D1',
  light: '\u2600',
  dark: '\u263E',
};

function ContextLabel() {
  const { mode, group, domain } = useAuth();
  if (mode === 'personal') return <span>personal</span>;
  if (group) return <span>{group.name} / {domain}</span>;
  return <span>{domain}</span>;
}

interface TopNavProps {
  onMenuToggle?: () => void;
}

export function TopNav({ onMenuToggle }: TopNavProps) {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();

  return (
    <nav className="top-nav">
      <div className="top-nav-inner">
        <div className="logo-group">
          <span className="logo">HAP</span>
          <span className="version-badge">Local Gateway</span>
        </div>
        <div className="nav-spacer" />
        <div className="nav-actions nav-actions-desktop">
          {user ? (
            <>
              <span className="user-chip">
                <strong>{user.name}</strong>
                <span className="dot" />
                <ContextLabel />
              </span>
              <button className="theme-toggle" onClick={toggle} title={`Theme: ${theme}`}>
                {THEME_ICONS[theme]}
              </button>
              <button className="nav-logout" onClick={logout}>Logout</button>
            </>
          ) : (
            <>
              <a href="https://humanagencyprotocol.org" target="_blank" rel="noopener noreferrer"
                style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
                What is HAP?
              </a>
              <button className="theme-toggle" onClick={toggle} title={`Theme: ${theme}`}>
                {THEME_ICONS[theme]}
              </button>
            </>
          )}
        </div>
        {user && onMenuToggle && (
          <button className="mobile-menu-btn" onClick={onMenuToggle} aria-label="Menu">
            {'\u2630'}
          </button>
        )}
      </div>
    </nav>
  );
}
