import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const NAV_ITEMS = [
  { to: '/', icon: '\u25A1', label: 'Dashboard' },
  { to: '/agent/new', icon: '\u25C8', label: 'Authorize Agents' },
  { to: '/authorizations', icon: '\u2630', label: 'Authorizations' },
  { to: '/groups', icon: '\u25C9', label: 'Manage Groups' },
  { to: '/integrations', icon: '\u29D7', label: 'Integrations' },
  { to: '/settings', icon: '\u2699', label: 'Settings' },
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
