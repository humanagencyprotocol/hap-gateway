import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { SelectionCard } from './SelectionCard';

export function GroupSelector() {
  const { groups, activeGroup, activeDomain, setActiveContext } = useAuth();
  const [expanded, setExpanded] = useState(!activeGroup && !activeDomain);

  if (groups.length === 0 && !activeGroup) return null;

  return (
    <div className="card" style={{ marginBottom: '1.5rem' }}>
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
        onClick={() => setExpanded(!expanded)}
      >
        <div>
          <h3 className="card-title" style={{ marginBottom: '0.125rem' }}>Group</h3>
          {!expanded && (
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
              {activeGroup ? <><strong>{activeGroup.name}</strong>{activeDomain ? ` / ${activeDomain}` : ''}</> : 'Single Domain'}
            </p>
          )}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); setExpanded(!expanded); }}>
          {expanded ? 'Collapse' : 'Change'}
        </button>
      </div>

      {expanded && (
        <div style={{ marginTop: '0.75rem' }}>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            Choose how this authorization is governed.
          </p>
          <div className="selection-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(12rem, 1fr))' }}>
            <SelectionCard
              selected={!activeGroup}
              onClick={() => { setActiveContext(null, activeDomain); setExpanded(false); }}
              style={{ padding: '1rem' }}
            >
              <div className="selection-card-title" style={{ fontSize: '0.9rem' }}>Single Domain</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '0.125rem' }}>
                No group &mdash; you are the sole attester
              </div>
            </SelectionCard>
            {groups.map(g => (
              <SelectionCard
                key={g.id}
                selected={activeGroup?.id === g.id}
                onClick={() => {
                  setActiveContext(g, g.myDomains[0] || activeDomain);
                  setExpanded(false);
                }}
                style={{ padding: '1rem' }}
              >
                <div className="selection-card-title" style={{ fontSize: '0.9rem' }}>{g.name}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '0.125rem' }}>
                  {g.myDomains.length > 0
                    ? <>Your domain{g.myDomains.length > 1 ? 's' : ''}: <strong style={{ color: 'var(--text-secondary)' }}>{g.myDomains.join(', ')}</strong></>
                    : 'No domains assigned yet'}
                </div>
              </SelectionCard>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
