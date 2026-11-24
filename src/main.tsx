import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { setupTelegram } from './lib/telegram';
import { applySettings } from './lib/settings';
import './index.css';
import './styles/app.css';

setupTelegram();
applySettings();
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
