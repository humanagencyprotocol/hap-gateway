import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { spClient, type SPUser, type SPGroup } from '../lib/sp-client';

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
  /** @deprecated No longer needed */
  refreshGroups: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SPUser | null>(null);
  const [mode, setMode] = useState<GatewayMode>('personal');
  const [group, setGroup] = useState<SPGroup | null>(null);
  const [domain, setDomain] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Fetch mode from control plane health endpoint on mount
  useEffect(() => {
    fetch('/health')
      .then(r => r.json())
      .then(data => {
        if (data.mode === 'team' || data.mode === 'personal') {
          setMode(data.mode);
        }
      })
      .catch(() => {}); // default to personal
  }, []);

  const login = useCallback(async (apiKey: string) => {
    setIsLoading(true);
    setError('');
    try {
      spClient.setApiKey(apiKey);
      const u = await spClient.login(apiKey);
      setUser(u);

      // v0.4: every user has a personal group auto-provisioned at registration.
      // In personal mode the gateway uses that group as the parent for every
      // attestation; in team mode it picks the (first) team group instead.
      // Either way, group is non-null and group_id is always sent on attest.
      const allGroups = await spClient.getGroups();

      if (mode === 'personal') {
        const personal = allGroups.find(g => g.isPersonal) ?? null;
        setGroup(personal);
        setDomain('owner');
      } else {
        const teamGroup =
          allGroups.find(g => !g.isPersonal && !g.isAdmin) ??
          allGroups.find(g => !g.isPersonal) ??
          null;
        setGroup(teamGroup);
        if (teamGroup && teamGroup.myDomains.length > 0) {
          setDomain(teamGroup.myDomains[0]);
        }
      }
    } catch (e) {
      spClient.clearApiKey();
      setError(e instanceof Error ? e.message : 'Login failed');
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, [mode]);

  const logout = useCallback(async () => {
    await spClient.logout();
    spClient.clearApiKey();
    setUser(null);
    setGroup(null);
    setDomain('');
    setError('');
  }, []);

  const clearError = useCallback(() => setError(''), []);

  // Backward compat
  const setActiveContext = useCallback((g: SPGroup | null, d: string) => {
    setGroup(g);
    setDomain(d);
  }, []);
  const refreshGroups = useCallback(async () => {}, []);

  return (
    <AuthContext.Provider value={{
      user, mode, group, domain,
      groupId: group?.id ?? null,
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
