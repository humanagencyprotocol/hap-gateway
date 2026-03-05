import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const NAV_ITEMS = [
  { to: '/', icon: '\u25A1', label: 'Dashboard' },
  { to: '/agent/new', icon: '\u25C8', label: 'Agent Auth' },
  { to: '/deploy', icon: '\u21B7', label: 'Deploy Review' },
];

const MANAGE_ITEMS = [
  { to: '/groups', icon: '\u25C9', label: 'Groups' },
  { to: '/audit', icon: '\u2630', label: 'Audit Trail' },
  { to: '/settings/services', icon: '\u2699', label: 'Settings' },
];

export function Sidebar() {
  const { activeGroup, activeDomain } = useAuth();

  return (
    <div className="sidebar">
      <ul className="sidebar-nav">
        {NAV_ITEMS.map(item => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => `sidebar-item${isActive ? ' active' : ''}`}
            >
              <span className="icon">{item.icon}</span> {item.label}
            </NavLink>
          </li>
        ))}
        <div className="sidebar-section-label">Manage</div>
        {MANAGE_ITEMS.map(item => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              className={({ isActive }) => `sidebar-item${isActive ? ' active' : ''}`}
            >
              <span className="icon">{item.icon}</span> {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
      <div className="sidebar-context">
        <div className="ctx-label">Active context</div>
        <div className="ctx-value">
          {activeGroup ? `${activeGroup.name} / ${activeDomain}` : activeDomain || 'Not set'}
        </div>
      </div>
    </div>
  );
}
