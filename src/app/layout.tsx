import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'جمعية غصون زهران الخيرية',
  description: 'نظام إدارة الجمعية الخيرية',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body className="font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
