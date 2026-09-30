'use client';

import { ReactNode } from 'react';
import { AuthProvider } from './contexts/AuthContext';
import { FirmProvider } from './contexts/FirmContext';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <FirmProvider>
      <AuthProvider>{children}</AuthProvider>
    </FirmProvider>
  );
}
