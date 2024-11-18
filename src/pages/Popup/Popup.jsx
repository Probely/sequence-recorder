import React, { useEffect, useState } from 'react';
import logo from '../../assets/img/logo_probely.svg';
import help from '../../assets/img/help.svg';
import './Popup.css';

const helpURL = 'https://help.probely.com/';

const Popup = (props) => {
  // 🔴
  // console.log('PROPS :: ', props);
  const [isRecording, setIsRecording] = useState(false);
  const [startURL, setStartURL] = useState('');
  const [recordingData, setRecordingData] = useState([]);
  const [copyStatus, setCopyStatus] = useState({status: false, error: false, msg: 'Successfully copied to clipboard'});

  useEffect(() => {
    if (chrome && chrome.storage) {
      chrome.storage.sync.get(['isRecording'], (data) => {
        const recording = data.isRecording;
        if(recording) {
          setIsRecording(true);
          (chrome.action || chrome.browserAction).setBadgeText({
            text: '🔴',
          }, () => {});
        } else {
          setIsRecording(false);
          (chrome.action || chrome.browserAction).setBadgeText({
            text: '',
          }, () => {});
        }
      });
      chrome.runtime.onMessage.addListener((data, sender, sendResponse) => {
        if (data.messageType === 'recording_data') {
          setRecordingData(data.recordingData || []);
        }
      });
      askForRecordingData();
    }
  }, []);

  function askForRecordingData() {
    chrome.runtime.sendMessage({
      messageType: 'give_recording_data',
    });
  }

  function onClickStartStopRecording(ev, recordingState) {
    setIsRecording(recordingState);
    if (recordingState === true) {
      setRecordingData([]);
      if (chrome) {
        (chrome.action || chrome.browserAction).setBadgeText({
          text: '🔴',
        }, () => {});
        chrome.storage.sync.set({isRecording: true}, () => {
          chrome.runtime.sendMessage({
            messageType: 'start',
            event: {
              type: 'goto',
              timestamp: new Date().getTime(),
              windowWidth: null,
              windowHeight: null,
              url: startURL,
            },
          });
          chrome.tabs.create({active: true, url: startURL}, (aa) => {
          });
        });
      }
    } else {
      if (ev) {
        ev.preventDefault();
      }
      if (chrome) {
        (chrome.action || chrome.browserAction).setBadgeText({
          text: '',
        }, () => {});
        chrome.storage.sync.set({isRecording: false}, () => {
          askForRecordingData();

          chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (tabs && tabs.length) {
              const curTab = tabs[0];
              chrome.tabs.remove(curTab.id);
              chrome.tabs.create({active: true, url: './review.html'}, (aa) => {
              });
            }
          });
        });
      }
    }
  }

  function onChangeStartURL(ev) {
    const tgt = ev.target;
    setStartURL(tgt.value);
  }

  function onSubmitStartRecording(ev) {
    ev.preventDefault();
    if (startURL) {
      onClickStartStopRecording(null, true);
    }
  }

  function onClickCopyToClipboard() {
    const elm = document.getElementById('input-copy-to-clipboard');
    if (elm) {
      elm.select();
      const text = elm.value;
      let successful = false;
      try {
        successful = document.execCommand('copy');
      } catch (error) {
        try {
          window.clipboardData.setData('text', text);
          successful = true;
        } catch (err) {
          // console.error('unable to copy using clipboardData: ', err);
        }
      }
      if (successful) {
        setCopyStatus({
          status: true,
          error: false,
          msg: 'Successfully copied to clipboard'
        });
        setTimeout(() => {
          setCopyStatus({status: false, error: false, msg: ''});
        }, 3000);
      } else {
        setCopyStatus({
          status: true,
          error: true,
          msg: 'Error on copy to clipboard'
        });
        setTimeout(() => {
          setCopyStatus({status: false, error: false, msg: ''});
        }, 5000);
      }
    }
  }

  function onClickDownload() {
    var blob = new Blob([JSON.stringify(recordingData, null, 2)], {
      type: "text/plain;charset=utf-8"
     });
    var a = document.createElement('a');
    a.download = 'probely-recording.json';
    a.rel = 'noopener';
    a.href = URL.createObjectURL(blob);
    try {
      a.dispatchEvent(new MouseEvent('click'));
    } catch (e) {
      var evt = document.createEvent('MouseEvents')
      evt.initMouseEvent('click', true, true, window, 0, 0, 0, 80, 20, false, false, false, false, 0, null);
      a.dispatchEvent(evt);
    }
  }

  function onClickClearData() {
    if (chrome) {
      chrome.runtime.sendMessage({
        messageType: 'clear',
      });
      setRecordingData([]);
    }
  }

  function onClickHelpLink(ev) {
    ev.preventDefault();
    chrome.tabs.create({active: true, url: helpURL}, (aa) => {
    });
  }

  return (
    <div className="App">
      <header className="App-header">
        <img src={logo} className="App-logo" alt="logo" />
        <h1 className="App-title">Sequence Recorder</h1>
      </header>
      <div className="App-container">
        <p>
        Use this plugin to record a sequence of steps to be followed by Probely during a scan.{' '}
        When you finish recording, upload the script to your target settings. 
        </p>
        <p className="help-container">
          <a
            href={helpURL}
            className="help-link"
            rel="noreferrer"
            onClick={(ev) => { onClickHelpLink(ev); }}
          >Usage instructions <img src={help} className="help-logo" alt="Help" /></a>
        </p>
      </div>
      <form
        method="post"
        action="#"
        className="url-form"
        onSubmit={(ev) => { onSubmitStartRecording(ev); }}
      >
        <div className="input-url-container">
          {isRecording ?
            null
          :
            <>
              <label className="start_url_label" htmlFor="start_url">Type the start URL to be recorded</label>
              <input
                type="url"
                name="start_url"
                id="start_url"
                required
                className="start-url"
                placeholder="https://your-target-url.com/"
                autoComplete="off"
                pattern="^https?://.*"
                onChange={(ev) => { onChangeStartURL(ev); }}
                value={startURL}
              />
            </>
          }
        </div>
        <div className="buttons-container">
          {isRecording ? 
            // eslint-disable-next-line jsx-a11y/anchor-is-valid
            <p><a
              href="#"
              className="App-button"
              onClick={(ev) => { onClickStartStopRecording(ev, false); }}
            >Stop recording</a></p>
          : 
            <button
              type="submit"
              className="App-button"
            >{recordingData.length ? 'Start new recording' : 'Start recording'}</button>
          }
        </div>
      </form>
      {!isRecording && recordingData.length ?
        <>
          <div className="buttons-container">
            <button
              type="button"
              className="App-button"
              onClick={() => { onClickCopyToClipboard(); }}
            >Copy to clipboard</button>
          </div>
          <div className="buttons-container">
            <button
              type="button"
              className="App-button"
              onClick={() => { onClickDownload(); }}
            >Download</button>
          </div>
          <div className="buttons-container">
            <button
              type="button"
              className="App-button App-button-secondary"
              onClick={() => { onClickClearData(); }}
            >Clear recording data</button>
          </div>
        </>
      : null}
      <div className="copy-status-container">
        {copyStatus.status ?
        <div className={copyStatus.error ? 'copy-status error' : 'copy-status success'}>{copyStatus.msg}</div>
        : null}
      </div>
      {recordingData.length ? 
        <textarea id="input-copy-to-clipboard" defaultValue={JSON.stringify(recordingData, null, 2)}></textarea>
      : null}
    </div>
  );
};

export default Popup;
