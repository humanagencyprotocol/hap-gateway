import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { TopNav } from './TopNav';
import { Sidebar } from './Sidebar';
import { UpdateBanner } from './UpdateBanner';
import { MobileMenu } from './MobileMenu';

export function AppShell() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <>
      <TopNav onMenuToggle={() => setMobileMenuOpen(!mobileMenuOpen)} />
      <UpdateBanner />
      <Sidebar />
      <MobileMenu open={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />
      <div className="main-content">
        <div className="page-inner">
          <Outlet />
        </div>
      </div>
    </>
  );
}
