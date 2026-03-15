import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../hooks/useTheme';

const THEME_ICONS: Record<string, string> = {
  system: '\u25D1',
  light: '\u2600',
  dark: '\u263E',
};

export function TopNav() {
  const { user, activeDomain, activeGroup, logout } = useAuth();
  const { theme, toggle } = useTheme();

  return (
    <nav className="top-nav">
      <div className="top-nav-inner">
        <div className="logo-group">
          <span className="logo">HAP</span>
          <span className="version-badge">Alpha</span>
        </div>
        <div className="nav-spacer" />
        <div className="nav-actions">
          {user ? (
            <>
              <span className="user-chip">
                <strong>{user.name}</strong>
                {activeDomain && (
                  <>
                    <span className="dot" />
                    <span>{activeDomain}</span>
                  </>
                )}
                {activeGroup && (
                  <>
                    <span className="dot" />
                    <span style={{ color: 'var(--text-tertiary)' }}>{activeGroup.name}</span>
                  </>
                )}
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
      </div>
    </nav>
  );
}
