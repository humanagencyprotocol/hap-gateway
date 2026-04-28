import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { spClient, type SPUser, type SPGroup, type GroupMember } from '../lib/sp-client';

export type GatewayMode = 'personal' | 'team';

interface AuthContextValue {
  user: SPUser | null;
  mode: GatewayMode;
  /** In team mode: the user's group. In personal mode: null. */
  group: SPGroup | null;
  /** The user's active domain. Personal: 'owner'. Team: from group membership. */
  domain: string;
  /** In team mode: the group ID. Personal: null. */
  groupId: string | null;
  /** The active team group (null for personal-only users). */
  activeTeam: SPGroup | null;
  /** The caller's active membership record (null for personal-only users). */
  activeMembership: GroupMember | null;
  isLoading: boolean;
  error: string;
  login: (apiKey: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;

  // Kept for backward compat — components that haven't been updated yet
  /** @deprecated Use group */
  activeGroup: SPGroup | null;
  /** @deprecated Use domain */
  activeDomain: string;
  /** @deprecated Use group */
  groups: SPGroup[];
  /** @deprecated No longer needed */
  setActiveContext: (group: SPGroup | null, domain: string) => void;
  /** Refreshes team membership from SP and recomputes mode. */
  refreshGroups: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SPUser | null>(null);
  const [mode, setMode] = useState<GatewayMode>('personal');
  const [group, setGroup] = useState<SPGroup | null>(null);
  const [domain, setDomain] = useState('');
  const [activeTeam, setActiveTeam] = useState<SPGroup | null>(null);
  const [activeMembership, setActiveMembership] = useState<GroupMember | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Track whether we have an active API key (user is logged in) so
  // visibilitychange handler knows whether to fire refreshGroups.
  const hasApiKey = useRef(false);

  /**
   * Fetches /api/groups/me, updates activeTeam + activeMembership,
   * and computes mode = activeMembership ? 'team' : 'personal'.
   * Also syncs the legacy `group` / `domain` state for back-compat.
   */
  const refreshGroups = useCallback(async () => {
    if (!hasApiKey.current) return;
    try {
      const result = await spClient.getMyTeam();
      if (result) {
        const { group: teamGroup, membership } = result;
        setActiveTeam(teamGroup);
        setActiveMembership(membership);
        setMode('team');
        setGroup(teamGroup);
        const firstDomain = membership.domains[0] ?? teamGroup.myDomains[0] ?? 'owner';
        setDomain(firstDomain);
      } else {
        setActiveTeam(null);
        setActiveMembership(null);
        setMode('personal');
        // Keep existing personal group in `group` state; don't wipe domain
        // because we may have set it during login from getGroups.
      }
    } catch {
      // Network error — leave existing state as-is
    }
  }, []);

  // Refresh on tab refocus — catches joins/leaves done in another tab or SP UI
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshGroups();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [refreshGroups]);

  const login = useCallback(async (apiKey: string) => {
    setIsLoading(true);
    setError('');
    try {
      spClient.setApiKey(apiKey);
      hasApiKey.current = true;
      const u = await spClient.login(apiKey);
      setUser(u);

      // Always seed the personal group so group_id is non-null for personal mode.
      // We call getGroups once to get the personal group, then refreshGroups to
      // get the true team membership state from the SP singleton endpoint.
      const allGroups = await spClient.getGroups();
      const personal = allGroups.find(g => g.isPersonal) ?? allGroups[0] ?? null;
      setGroup(personal);
      setDomain('owner');

      // Derive mode from real membership — replaces the old HAP_MODE env branch
      await refreshGroups();
    } catch (e) {
      spClient.clearApiKey();
      hasApiKey.current = false;
      setError(e instanceof Error ? e.message : 'Login failed');
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, [refreshGroups]);

  const logout = useCallback(async () => {
    await spClient.logout();
    spClient.clearApiKey();
    hasApiKey.current = false;
    setUser(null);
    setGroup(null);
    setDomain('');
    setActiveTeam(null);
    setActiveMembership(null);
    setMode('personal');
    setError('');
  }, []);

  const clearError = useCallback(() => setError(''), []);

  // Backward compat
  const setActiveContext = useCallback((g: SPGroup | null, d: string) => {
    setGroup(g);
    setDomain(d);
  }, []);

  return (
    <AuthContext.Provider value={{
      user, mode, group, domain,
      groupId: group?.id ?? null,
      activeTeam,
      activeMembership,
      isLoading, error, login, logout, clearError,
      // Backward compat aliases
      activeGroup: group,
      activeDomain: domain,
      groups: group ? [group] : [],
      setActiveContext,
      refreshGroups,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
