import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'FaroAI',
  description: 'Discover jewelry with FaroAI.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><body>{children}</body></html>;
}
