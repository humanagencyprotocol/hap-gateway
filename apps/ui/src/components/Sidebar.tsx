import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useState, useCallback } from 'react';
import { spClient } from '../lib/sp-client';
import { useVisiblePolling } from '../hooks/useVisiblePolling';
import { useIntegrationStatus } from '../contexts/IntegrationStatusContext';

interface NavItem {
  to: string;
  icon: string;
  label: string;
  statusKey?: 'integrations' | 'assistant' | 'authorizations' | 'proposals' | 'brief';
  teamOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', icon: '\u25A1', label: 'Dashboard' },
  { to: '/proposals', icon: '\u25B7', label: 'Pending Approvals', statusKey: 'proposals' },
  { to: '/authorizations', icon: '\u2630', label: 'Authorizations', statusKey: 'authorizations' },
  { to: '/agent-brief', icon: '▤', label: 'Agent Brief', statusKey: 'brief' },
  { to: '/audit', icon: '\u25A3', label: 'Receipts' },
  { to: '/groups', icon: '\u25C9', label: 'Team', teamOnly: true },
  { to: '/integrations', icon: '\u29D7', label: 'Integrations', statusKey: 'integrations' },
  { to: '/settings', icon: '\u2699', label: 'AI Assistant', statusKey: 'assistant' },
];

/**
 * Non-integration badge counts (AI config, authorizations, proposals).
 * Integration counts come from the shared IntegrationStatusContext below
 * so Sidebar / Dashboard / IntegrationsPage can't disagree.
 */
function useOtherNavStatus() {
  const { activeDomain } = useAuth();
  const [counts, setCounts] = useState<Record<string, number>>({});

  const poll = useCallback(async () => {
    try {
      const [aiStatus, authData, proposalData, briefText] = await Promise.all([
        spClient.getCredential('ai-config').catch(() => null),
        spClient.getMyAttestations().catch(() => null),
        spClient.getProposals(activeDomain || 'owner').catch(() => null),
        spClient.getAgentContext().catch(() => ''),
      ]);

      const next: Record<string, number> = {};
      if (aiStatus && !aiStatus.configured) next.assistant = 1;
      if (authData) {
        const expired = authData.filter(
          a => a.remaining_seconds === null || a.remaining_seconds <= 0,
        ).length;
        if (expired > 0) next.authorizations = expired;
      }
      if (proposalData && proposalData.length > 0) {
        next.proposals = proposalData.length;
      }
      // Empty agent brief → badge nudges the owner to author one.
      if (!briefText || !briefText.trim()) next.brief = 1;
      setCounts(next);
    } catch {
      // ignore
    }
  }, [activeDomain]);

  useVisiblePolling(poll, 60_000, activeDomain);
  return counts;
}

const BADGE_STYLE: React.CSSProperties = {
  marginLeft: 'auto',
  minWidth: '1.25rem',
  height: '1.25rem',
  padding: '0 0.375rem',
  borderRadius: '0.625rem',
  background: 'var(--warning)',
  color: 'var(--bg-elevated)',
  fontSize: '0.7rem',
  fontWeight: 600,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
};

export function Sidebar() {
  const { mode, group, domain } = useAuth();
  const other = useOtherNavStatus();
  const { attentionCount } = useIntegrationStatus();
  const counts: Record<string, number> = { ...other };
  if (attentionCount > 0) counts.integrations = attentionCount;

  const visibleItems = NAV_ITEMS.filter(item => !item.teamOnly || mode === 'team');

  return (
    <div className="sidebar">
      <ul className="sidebar-nav">
        {visibleItems.map(item => {
          const count = item.statusKey ? counts[item.statusKey] : 0;
          return (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) => `sidebar-item${isActive ? ' active' : ''}`}
              >
                <span className="icon">{item.icon}</span>
                {item.label}
                {count ? <span style={BADGE_STYLE}>{count}</span> : null}
              </NavLink>
            </li>
          );
        })}
      </ul>
      <div className="sidebar-context">
        <div className="ctx-label">Active context</div>
        <div className="ctx-value">
          {mode === 'personal' ? 'personal' : group ? `${group.name} / ${domain}` : domain}
        </div>
      </div>
    </div>
  );
}
