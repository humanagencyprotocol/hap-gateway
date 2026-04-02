import { profileDisplayName } from '../lib/profile-display';

interface Props {
  profileId?: string;
  path?: string;
  bounds?: string;
  groupName?: string;
  domain?: string;
  onSwitch?: () => void;
}

export function ContextStrip({ profileId, path, bounds, groupName, domain, onSwitch }: Props) {
  return (
    <div className="context-strip">
      {groupName && (
        <>
          <span className="context-strip-label">Team:</span>
          <span><strong>{groupName}</strong>{domain ? ` / ${domain}` : ''}</span>
        </>
      )}
      {profileId && <span><strong>Profile:</strong> {profileDisplayName(profileId)}</span>}
      {path && <span><strong>Path:</strong> {path}</span>}
      {bounds && <span><strong>Bounds:</strong> {bounds}</span>}
      {onSwitch && (
        <button
          className="btn btn-ghost btn-sm"
          style={{ marginLeft: 'auto', padding: '0.2rem 0.5rem', fontSize: '0.7rem' }}
          onClick={onSwitch}
        >
          Switch
        </button>
      )}
    </div>
  );
}
