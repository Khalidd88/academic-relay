import React from 'react';

export function Footer() {
  return (
    <footer className="border-t border-[#E5E7EB] py-6 text-center text-xs text-gray-500 bg-white mt-auto">
      <div className="max-w-5xl mx-auto px-4">
        <p>© {new Date().getFullYear()} UEU Academic Radar — Micro-SaaS Independen Mahasiswa Universitas Esa Unggul.</p>
      </div>
    </footer>
  );
}
