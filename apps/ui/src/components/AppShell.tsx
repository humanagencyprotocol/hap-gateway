import { Outlet } from 'react-router-dom';
import { TopNav } from './TopNav';
import { Sidebar } from './Sidebar';
import { UpdateBanner } from './UpdateBanner';

export function AppShell() {
  return (
    <>
      <TopNav />
      <Sidebar />
      <div className="main-content">
        <UpdateBanner />
        <div className="page-inner">
          <Outlet />
        </div>
      </div>
    </>
  );
}
