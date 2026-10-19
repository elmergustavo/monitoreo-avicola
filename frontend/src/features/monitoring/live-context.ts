import { createContext, useContext } from 'react';

export type LiveStatus = 'connecting' | 'open' | 'reconnecting' | 'off';

export const LiveContext = createContext<{ status: LiveStatus; lastMessageAt: number | null }>({
  status: 'off',
  lastMessageAt: null,
});

export const useLiveStatus = () => useContext(LiveContext);
