import { Outlet } from 'react-router-dom';
import TopBar from './components/TopBar';

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
