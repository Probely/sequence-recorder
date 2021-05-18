import React from 'react';
import logo from '../../assets/img/logo_probely.svg';

const Start = (props) => {
  return (
    <div className="App">
      <header className="instructions">
        <div className="header">
          <img src={logo} alt="probely" />
          <h1>Sequence Recorder</h1>
        </div>
      </header>
      <div className="main">
        <p>Open your target in this tab and make sure you perform each step of your sequence so{' '}
        that every necessary action is recorded by the extension.</p>
        <p>Then, when you finish, go to the plugin window and "stop recording".</p>
      </div>
    </div>
  );
};

export default Start;
