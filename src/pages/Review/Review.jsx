import React, { useEffect, useState } from 'react';
import logo from '../../assets/img/logo_probely.svg';

let hasData = false;

const Review = (props) => {

  const [recordingDataOriginal, setRecordingDataOriginal] = useState([]);
  const [recordingData, setRecordingData] = useState([]);
  const [recordingDataDownload, setRecordingDataDownload] = useState([]);
  const [copyStatus, setCopyStatus] = useState({status: false, error: false, msg: 'Successfully copied to clipboard'});
  const [showAdvanced, setShowAdvanced] = useState(true);

  useEffect(() => {
    chrome.runtime.onMessage.addListener((data, sender, sendResponse) => {
      if (data.messageType === 'recording_data' && !hasData) {
        hasData = true;
        setRecordingDataOriginal(data.recordingData || []);
        const aOriginal = setDefaultValues([].concat(data.recordingData));
        setRecordingData(aOriginal);
        processSetRecordingDataDownload(aOriginal);
      }
    });
    chrome.runtime.sendMessage({
      messageType: 'give_recording_data',
    });
  }, []);

  function setDefaultValues(aArr) {
    return aArr.map((item, idx) => {
      item.opt = {};
      item.opt.checked = true;
      if (item.type === 'goto') {
        if (idx === 0) {
          item.opt.urlType = 'force';
          item.opt.urlDisabled = true;
        } else {
          item.opt.urlType = 'ignore';
          item.opt.urlDisabled = false;
        }
      }
      return item;
    });
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
    let blob = null;
    if (process.env.NODE_ENV === 'development') {
      const newData = {
        spider: {
          scope: {},
          sequences: []
        }
      };
      newData.spider.sequences.push(recordingDataDownload);
      blob = new Blob([JSON.stringify(newData, null, 2)], {
        type: "text/plain;charset=utf-8"
      });
    } else {
      blob = new Blob([JSON.stringify(recordingDataDownload, null, 2)], {
        type: "text/plain;charset=utf-8"
      });
    }
    if (!blob) {
      return;
    }
    const a = document.createElement('a');
    a.download = 'snyk-api-and-web-recording.json';
    a.rel = 'noopener';
    a.href = URL.createObjectURL(blob);
    try {
      a.dispatchEvent(new MouseEvent('click'));
    } catch (e) {
      const evt = document.createEvent('MouseEvents')
      evt.initMouseEvent('click', true, true, window, 0, 0, 0, 80, 20, false, false, false, false, 0, null);
      a.dispatchEvent(evt);
    }
  }

  function onChangeReviewAdvanced(ev) {
    const tgt = ev.target;
    if (tgt.checked) {
      setShowAdvanced(true);
    } else {
      setShowAdvanced(false);
    }
  }

  function processSetRecordingDataDownload(arr) {
    const newArr = JSON.parse(JSON.stringify(arr));
    const tmp = [];
    newArr.forEach((item) => {
      if (item.opt.checked) {
        if (item.type === 'goto') {
          item.urlType = item.opt.urlType;
        }
        delete item.opt;
        tmp.push(item);
      }
    });
    setRecordingDataDownload(tmp);
  }

  function onChangeTableCheck(ev, idx) {
    const tgt = ev.target;
    const tmp = JSON.parse(JSON.stringify(recordingData));
    tmp[idx].opt.checked = !!tgt.checked;
    setRecordingData(tmp);
    processSetRecordingDataDownload(tmp);
  }

  function onChangeTableUrlType(ev, idx) {
    
    const tgt = ev.target;
    const tmp = JSON.parse(JSON.stringify(recordingData));
    const val = tgt.value;
    // This will be used in the future
    // if (idx === 0 && val !== 'force' && val !== 'loggedin_start_url') {
    //   return;
    // }
    
    // For now only allow "force" and "ignore"
    if (idx === 0 && val !== 'force') {
      return;
    } else if (idx !== 0 && val !== 'ignore') {
      return;
    }
    tmp[idx].opt.urlType = tgt.value;
    setRecordingData(tmp);
    processSetRecordingDataDownload(tmp);
  }

  function onClickEdit(ev, idx, type) {
    if (['css', 'fill_value'].indexOf(type) === -1) {
      return;
    }
    // const tgt = ev.target;
    const tmp = JSON.parse(JSON.stringify(recordingData));
    if (type === 'css') {
      tmp[idx].opt.cssEditMode = true;
      tmp[idx].opt.cssOldValue = tmp[idx].css;
    } else if (type === 'fill_value') {
      tmp[idx].opt.fillValueEditMode = true;
      tmp[idx].opt.fillValueOldValue = tmp[idx].value;
    }
    setRecordingData(tmp);
    processSetRecordingDataDownload(tmp);
  }

  function onChangeEdit(ev, idx, type) {
    if (['css', 'fill_value'].indexOf(type) === -1) {
      return;
    }
    const tgt = ev.target;
    const tmp = JSON.parse(JSON.stringify(recordingData));

    if (type === 'css') {
      tmp[idx].css = tgt.value;
    } else if (type === 'fill_value') {
      tmp[idx].value = tgt.value;
    }
    setRecordingData(tmp);
    processSetRecordingDataDownload(tmp);
  }

  function onClickCancelEdit(ev, idx, type) {
    if (['css', 'fill_value'].indexOf(type) === -1) {
      return;
    }
    const tmp = JSON.parse(JSON.stringify(recordingData));
    if (type === 'css') {
      tmp[idx].css = tmp[idx].opt.cssOldValue;
      tmp[idx].opt.cssEditMode = false;
    } else if (type === 'fill_value') {
      tmp[idx].value = tmp[idx].opt.fillValueOldValue;
      tmp[idx].opt.fillValueEditMode = false;
    }
    setRecordingData(tmp);
    processSetRecordingDataDownload(tmp);
  }

  function onSubmitEdit(ev, idx, type) {
    ev.preventDefault();
    if (['css', 'fill_value'].indexOf(type) === -1) {
      return;
    }
    const tmp = JSON.parse(JSON.stringify(recordingData));
    if (type === 'css') {
      tmp[idx].opt.cssEditMode = false;
    } else if (type === 'fill_value') {
      tmp[idx].opt.fillValueEditMode = false;
    }
    setRecordingData(tmp);
    processSetRecordingDataDownload(tmp);
  }

  function humanType(type) {
    let newType = type;
    switch (type) {
      case 'fill_value':
        newType = 'fill with value';
        break;
      case 'press_key':
        newType = 'press [ENTER]';
        break;
      case 'goto':
        newType = 'go to';
        break;
      default:
        newType = type;
        break;
    }
    return newType;
  }

  return (
    <div className="App">
      <header className="instructions">
        <div className="header">
          <img src={logo} alt="Snyk API & Web" />
          <h1>Sequence Recorder</h1>
        </div>
      </header>
      <div className="main">
        {recordingData && recordingData.length ?
        <>
          <p>You can copy or download the recorded information here or through the plugin window.</p>
          <div className="buttons-container">
            <button
              type="button"
              className="App-button"
              onClick={() => { onClickCopyToClipboard(); }}
            >Copy to clipboard</button>
            <button
              type="button"
              className="App-button"
              onClick={() => { onClickDownload(); }}
            >Download</button>
          </div>
          <div className="advance_check_container">
            <input
              type="checkbox"
              id="review_advanced_options"
              value="1"
              className="form-control input_custom"
              checked={showAdvanced}
              onChange={(ev) => { onChangeReviewAdvanced(ev); }}
            /><label htmlFor="review_advanced_options" className="review_advanced_options_text">Advanced options</label>
          </div>
          <p>After saving your sequence, make sure to import it to your target settings at Snyk API & Web, so it is followed during scans.</p>
        </>
        : <h3><strong>No data has been recorded</strong></h3>}
        <div className="copy-status-container">
          {copyStatus.status ?
          <div className={copyStatus.error ? 'copy-status error' : 'copy-status success'}>{copyStatus.msg}</div>
          : null}
        </div>
        {recordingData && recordingData.length && showAdvanced ?
          <>
            <div className="advanced_instructions">
              <p className="center">You can review the steps recorded below.{' '}
              Note that changing the sequence in any way could prevent the crawler from successfully replaying it.</p>
              <p>Some tips:</p>
              <ul>
                <li>You can edit the CSS selectors (click on the CSS selector) to adjust some possible variable selectors.{' '}
                For instance for the selector "<code><b>#foo &gt; .nav-item.item_42</b></code>" where "42" is an ID,{' '}
                using "<code><b>.item_42</b></code>" is not recomended.
                </li>
                <li>You can edit "<b>fill with value</b>" values (click on the text value) to use random values. 
                  For instance, in a registration form where the email needs to be unique,{' '}
                  you can use the value <code>email+<b>&#123;RAND_STRING&#125;</b>@example.com</code>.<br />
                  Possible values: 
                    <ul>
                      <li><code><b>&#123;RAND_STRING&#125;</b></code> - random string</li>
                      <li><code><b>&#123;RAND_STRING[5]&#125;</b></code> - random string with length X (e.g. 5)</li>
                      <li><code><b>&#123;RAND_NUMBER&#125;</b></code> - random number</li>
                      <li><code><b>&#123;RAND_NUMBER[10-99]&#125;</b></code> - random number between X and Y (e.g. 10 and 99)</li>
                    </ul>
                </li>
                {/* <li>
                  For "<b>go to</b>" items, you can define if the URL needs to be checked or forced.
                  <ul>
                    <li><code><b>Ignore</b></code> - Default, let the crawler do its job.</li>
                    <li><code><b>Go to URL</b></code> - Default for the first step. The page will be redirected to the given URL.</li>
                    <li><code><b>Check URL</b></code> - The URL is checked and the current URL during the sequence needs to be equal to the given URL.</li>
                    <li><code><b>Go to URL after login</b></code> - When URL after login is variable (e.g. has a session token there), use this option to start the sequence with the URL after login done.</li>
                  </ul>
                </li> */}
              </ul>
            </div>
            <table className="review_table">
              <thead>
                <tr>
                  <th className="table_id"></th>
                  <th className="table_type"></th>
                  <th className="table_selector"></th>
                  <th className="table_value"></th>
                </tr>
              </thead>
              <tbody>
                {recordingData.map((item, idx) => {
                  return (
                    <tr className={`table_tr ${idx % 2 === 0 ? 'odd' : 'even'}`} key={`item_${idx}`}> 
                      <td>
                        <input
                          type="checkbox"
                          name={`item_name_${idx}`}
                          value={idx}
                          disabled={idx === 0}
                          checked={item.opt.checked}
                          className="t_line_checkbox"
                          onChange={(ev) => { onChangeTableCheck(ev, idx); }}
                        />
                      </td>
                      <td><span className="t_item_type ">{humanType(item.type)}</span></td>
                      <td>{item.type === 'goto' ? (
                        <span className="t_url">{item.url}</span>
                      ) : (
                        item.opt.cssEditMode ?
                          <form
                            method="post"
                            action=""
                            onSubmit={(ev) => {onSubmitEdit(ev, idx, 'css');}}
                          >
                            <input
                              type="text"
                              className="t_selector_input"
                              value={item.css}
                              onChange={(ev) => {onChangeEdit(ev, idx, 'css');}}
                            />
                            <button type="submit" className="t_btn_ok">Save</button>
                            <button
                              type="button"
                              className="t_btn_cancel"
                              onClick={(ev) => {onClickCancelEdit(ev,idx, 'css');}}
                            >Cancel</button>
                          </form>
                          :
                          <span
                            className="t_selector"
                            onClick={(ev) => {onClickEdit(ev, idx, 'css');}}
                          >{item.css}</span>
                      )}</td>
                      <td>
                        {item.type === 'fill_value' ? 
                          item.opt.fillValueEditMode ?
                            <form
                              method="post"
                              action=""
                              onSubmit={(ev) => {onSubmitEdit(ev, idx, 'fill_value');}}
                            >
                              <input
                                type="text"
                                className="t_fill_value_input"
                                value={item.value}
                                onChange={(ev) => {onChangeEdit(ev, idx, 'fill_value');}}
                              />
                              <button type="submit" className="t_btn_ok">Save</button>
                              <button
                                type="button"
                                className="t_btn_cancel"
                                onClick={(ev) => {onClickCancelEdit(ev,idx, 'fill_value');}}
                              >Cancel</button>
                            </form>
                          :
                          <span
                            className="t_selector"
                            onClick={(ev) => {onClickEdit(ev, idx, 'fill_value');}}
                          >{item.value}</span>
                        : null}
                        {item.type === 'change' && item.subtype === 'check' ? item.checked ? 'checked' : 'not checked' : null}
                        {item.type === 'change' && item.subtype === 'select' ? `index ${item.selected}` : null}
                        {item.type === 'goto' ? (
                          <span>Navigate to URL</span>
                          // <select
                          //   value={item.opt.urlType}
                          //   // disabled={item.opt.urlDisabled}
                          //   // readOnly={item.opt.urlDisabled}
                          //   className="t_selector_select"
                          //   onChange={(ev) => { onChangeTableUrlType(ev, idx); }}
                          // >
                          //   <option
                          //     value="force"
                          //   >Go to URL</option>
                          //   <option
                          //     value="loggedin_start_url"
                          //     disabled={!item.opt.urlDisabled}
                          //     readOnly={!item.opt.urlDisabled}
                          //   >Go to URL after login</option>
                          //   <option
                          //     value="ignore"
                          //     disabled={item.opt.urlDisabled}
                          //     readOnly={item.opt.urlDisabled}
                          //   >Ignore</option>
                          //   <option
                          //     value="check"
                          //     disabled={item.opt.urlDisabled}
                          //     readOnly={item.opt.urlDisabled}
                          //   >Check URL</option>
                          // </select>
                        ) : null}
                      </td>
                    </tr>    
                  )
                })}
              </tbody>
            </table>
          </>
        : null}
      </div>
      <div>
      </div>
      {recordingData.length ? 
        <textarea
          id="input-copy-to-clipboard"
          readOnly
          value={JSON.stringify(recordingDataDownload, null, 2)}
        ></textarea>
      : null}
    </div>
  );
};

export default Review;
