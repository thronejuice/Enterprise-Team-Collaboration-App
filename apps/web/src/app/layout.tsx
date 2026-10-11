import type { Metadata, Viewport } from 'next';
import { ReactNode } from 'react';
import { ToastProvider } from '@/components/toast';
import { AuthProvider } from '@/lib/auth';
import './globals.css';

export const metadata: Metadata = {
  title: 'Nexus Meet',
  description: 'Enterprise meetings with secure room codes and recording',
};

export const viewport: Viewport = { themeColor: '#0f172a' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
