import React from 'react';
import { render } from 'react-dom';

import Review from './Review';
import '../../assets/css/start_review.css';

render(<Review />, window.document.querySelector('#app-container'));
