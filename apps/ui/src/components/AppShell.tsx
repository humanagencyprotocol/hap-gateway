import { Outlet } from 'react-router-dom';
import { TopNav } from './TopNav';
import { Sidebar } from './Sidebar';

export function AppShell() {
  return (
    <>
      <TopNav />
      <Sidebar />
      <div className="main-content">
        <div className="page-inner">
          <Outlet />
        </div>
      </div>
    </>
  );
}
