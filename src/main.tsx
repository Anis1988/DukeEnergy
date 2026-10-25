import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AppUpdateCheck } from './components/AppUpdate';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppUpdateCheck />
    <App />
  </React.StrictMode>,
);
