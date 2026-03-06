import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { spClient, type SPUser, type SPGroup } from '../lib/sp-client';

interface AuthContextValue {
  user: SPUser | null;
  groups: SPGroup[];
  activeGroup: SPGroup | null;
  activeDomain: string;
  isLoading: boolean;
  error: string;
  login: (apiKey: string) => Promise<void>;
  logout: () => Promise<void>;
  setActiveContext: (group: SPGroup | null, domain: string) => void;
  refreshGroups: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SPUser | null>(null);
  const [groups, setGroups] = useState<SPGroup[]>([]);
  const [activeGroup, setActiveGroup] = useState<SPGroup | null>(null);
  const [activeDomain, setActiveDomain] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const login = useCallback(async (apiKey: string) => {
    setIsLoading(true);
    setError('');
    try {
      // Set API key on client BEFORE login call so the header is sent
      spClient.setApiKey(apiKey);
      const u = await spClient.login(apiKey);
      const allGroups = await spClient.getGroups();
      setUser(u);
      setGroups(allGroups);

      // Auto-select if only one group
      if (allGroups.length === 1) {
        setActiveGroup(allGroups[0]);
        if (allGroups[0].myDomains.length === 1) {
          setActiveDomain(allGroups[0].myDomains[0]);
        }
      }
    } catch (e) {
      // Clear API key on failed login
      spClient.clearApiKey();
      setError(e instanceof Error ? e.message : 'Login failed');
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    await spClient.logout();
    spClient.clearApiKey();
    setUser(null);
    setGroups([]);
    setActiveGroup(null);
    setActiveDomain('');
    setError('');
  }, []);

  const refreshGroups = useCallback(async () => {
    try {
      const allGroups = await spClient.getGroups();
      setGroups(allGroups);
    } catch {
      // silently fail — groups will stay stale
    }
  }, []);

  const setActiveContext = useCallback((group: SPGroup | null, domain: string) => {
    setActiveGroup(group);
    setActiveDomain(domain);
  }, []);

  const clearError = useCallback(() => setError(''), []);

  return (
    <AuthContext.Provider value={{
      user, groups, activeGroup, activeDomain,
      isLoading, error, login, logout,
      setActiveContext, refreshGroups, clearError,
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
