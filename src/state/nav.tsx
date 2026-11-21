import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Screen } from '../types';

interface Nav { screen: Screen; focus: string | null; go: (s: Screen, focus?: string | null) => void }
const NavCtx = createContext<Nav | null>(null);
export const useNav = (): Nav => {
  const c = useContext(NavCtx);
  if (!c) throw new Error('NavProvider отсутствует');
  return c;
};
const SCREENS: Screen[] = ['base', 'hangar', 'build', 'research', 'battle', 'quests', 'profile'];

export function NavProvider({ children }: { children: ReactNode }) {
  const initial = (): Screen => {
    const h = window.location.hash.replace('#', '') as Screen;
    return SCREENS.includes(h) ? h : 'base';
  };
  const [state, setState] = useState<{ screen: Screen; focus: string | null }>({ screen: initial(), focus: null });
  const go = useCallback((screen: Screen, focus: string | null = null) => {
    setState({ screen, focus });
    try { window.history.replaceState(null, '', `#${screen}`); } catch { /* ignore */ }
    window.scrollTo?.({ top: 0 });
  }, []);
  const value = useMemo(() => ({ ...state, go }), [state, go]);
  return <NavCtx.Provider value={value}>{children}</NavCtx.Provider>;
}
export const SCREEN_LIST = SCREENS;
