import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'UEU Academic Radar - Notifikasi Tugas Kuliah WhatsApp',
  description: 'Pengingat deadline tugas kuliah otomatis via WhatsApp untuk mahasiswa Universitas Esa Unggul.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body className="min-h-screen bg-[#FAFAFA] text-[#111827] antialiased flex flex-col">
        {children}
      </body>
    </html>
  );
}
