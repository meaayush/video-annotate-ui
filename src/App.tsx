import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { VideoListPage } from './pages/VideoListPage';
import { VideoDetailPage } from './pages/VideoDetailPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<VideoListPage />} />
        <Route path="/video/:id" element={<VideoDetailPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
