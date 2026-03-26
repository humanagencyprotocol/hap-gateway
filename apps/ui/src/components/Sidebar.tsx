import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useState, useEffect } from 'react';
import { spClient } from '../lib/sp-client';

interface NavItem {
  to: string;
  icon: string;
  label: string;
  statusKey?: 'integrations' | 'assistant' | 'authorizations';
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', icon: '\u25A1', label: 'Dashboard' },
  { to: '/agent/new', icon: '\u25C8', label: 'Authorize Agents' },
  { to: '/authorizations', icon: '\u2630', label: 'Agent Authorizations', statusKey: 'authorizations' },
  { to: '/audit', icon: '\u25A3', label: 'Agent Receipts' },
  { to: '/groups', icon: '\u25C9', label: 'Manage Groups' },
  { to: '/proposals', icon: '\u25B7', label: 'Proposals', statusKey: 'proposals' },
  { to: '/integrations', icon: '\u29D7', label: 'Integrations', statusKey: 'integrations' },
  { to: '/settings', icon: '\u2699', label: 'AI Assistant', statusKey: 'assistant' },
];

function useNavStatus() {
  const { activeDomain } = useAuth();
  const [statuses, setStatuses] = useState<Record<string, boolean>>({});

  useEffect(() => {
    async function poll() {
      try {
        const [intData, healthData, authData, proposalData] = await Promise.all([
          spClient.getMcpIntegrations().catch(() => null),
          spClient.getMcpHealth().catch(() => null),
          spClient.getMyAttestations().catch(() => null),
          spClient.getProposals(activeDomain || 'owner').catch(() => null),
        ]);

        const next: Record<string, boolean> = {};

        // Integrations: warn if any registered but not running
        if (intData?.integrations) {
          const all = intData.integrations;
          if (all.length > 0 && all.some(i => !i.running)) {
            next.integrations = true;
          }
        }

        // AI Assistant: warn if no active sessions
        if (healthData) {
          if (healthData.activeSessions === 0) {
            next.assistant = true;
          }
        }

        // Authorizations: warn if any expired
        if (authData) {
          const hasExpired = authData.some(
            a => a.remaining_seconds === null || a.remaining_seconds <= 0
          );
          if (hasExpired) {
            next.authorizations = true;
          }
        }

        // Proposals: warn if any pending
        if (proposalData && proposalData.length > 0) {
          next.proposals = true;
        }

        setStatuses(next);
      } catch {
        // Ignore errors
      }
    }

    poll();
    const interval = setInterval(poll, 15000);
    return () => clearInterval(interval);
  }, [activeDomain]);

  return statuses;
}

const DOT_STYLE: React.CSSProperties = {
  width: '0.4rem',
  height: '0.4rem',
  borderRadius: '50%',
  background: 'var(--warning)',
  flexShrink: 0,
  marginLeft: 'auto',
};

export function Sidebar() {
  const { activeGroup, activeDomain } = useAuth();
  const warnings = useNavStatus();

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
              <span className="icon">{item.icon}</span>
              {item.label}
              {item.statusKey && warnings[item.statusKey] && (
                <span style={DOT_STYLE} />
              )}
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
