import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { VideoListPage } from './pages/VideoListPage';
import { VideoDetailPage } from './pages/VideoDetailPage';
import './App.css';

function TopNav() {
  return (
    <header className="top-nav">
      <span className="top-nav-title">Video Annotate Project</span>
    </header>
  );
}

function App() {
  return (
    <BrowserRouter>
      <TopNav />
      <div className="app-body">
        <Routes>
          <Route path="/" element={<VideoListPage />} />
          <Route path="/video/:id" element={<VideoDetailPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
