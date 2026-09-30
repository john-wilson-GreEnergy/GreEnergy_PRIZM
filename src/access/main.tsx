import React from 'react';
import {createRoot} from 'react-dom/client';
import SignInPage from './SignInPage';
import '../index.css';

createRoot(document.getElementById('root')!).render(<React.StrictMode><SignInPage/></React.StrictMode>);
