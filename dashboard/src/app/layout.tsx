import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Joe Admin Dashboard',
  description: 'System control center for Joe Autonomous Agent',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-gray-950 text-gray-100`}>
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="flex-1 ml-64">
            <Header />
            <main className="mt-16 p-6">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
