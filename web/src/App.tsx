import { Outlet } from 'react-router-dom';
import TopBar from './components/TopBar';
import { LiveBackground } from './components/LiveBackground';
import './rtl-overrides.css';

export default function App() {
  return (
    <div className="app">
      <LiveBackground />
      <TopBar />
      <div className="content">
        <Outlet />
      </div>
    </div>
  );
}
