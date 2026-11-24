import React from 'react';
import Link from 'next/link';

export function Navbar() {
  return (
    <header className="border-b border-[#E5E7EB] bg-white sticky top-0 z-40">
      <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-bold text-lg text-[#1E3A8A]">
          <span className="w-8 h-8 rounded-lg bg-[#1E3A8A] text-white flex items-center justify-center text-sm font-black shadow-sm">
            UR
          </span>
          <span className="tracking-tight">UEU Academic Radar</span>
        </Link>
        <div className="flex items-center gap-4 text-xs sm:text-sm">
          <Link
            href="/admin"
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:text-[#1E3A8A] hover:bg-gray-50 transition-colors font-medium"
          >
            Admin Panel
          </Link>
        </div>
      </div>
    </header>
  );
}
