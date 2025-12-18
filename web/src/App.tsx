import { Outlet } from 'react-router-dom';
import TopBar from './components/TopBar';
import './rtl-overrides.css';

export default function App() {
  return (
    <div className="app">
      <TopBar />
      <div className="content">
        <Outlet />
      </div>
    </div>
  );
}
