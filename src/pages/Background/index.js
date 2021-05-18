import '../../assets/img/icon-34.png';
import '../../assets/img/icon-128.png';

(function () {
  // console.log('This is the background page.');
  let startURLDomensionsUpdated = false;
  let aEvents = [];

  chrome.storage.sync.get(['isRecording'], (data) => {
    if (data.isRecording) {
      chrome.browserAction.setBadgeText(
        {
          text: '🔴',
        },
        () => {}
      );
    } else {
      chrome.browserAction.setBadgeText(
        {
          text: '',
        },
        () => {}
      );
    }
  });

  chrome.runtime.onMessage.addListener((data, sender, sendResponse) => {
    if (data.messageType === 'events') {
      if (!startURLDomensionsUpdated) {
        startURLDomensionsUpdated = true;
        if (aEvents.length === 1 && data.event.type === 'goto') {
          aEvents[0].windowWidth = data.event.windowWidth;
          aEvents[0].windowHeight = data.event.windowHeight;

          if (aEvents[0].url === data.event.url) {
            return;
          }
        }
      }
      aEvents.push(data.event);
    } else if (data.messageType === 'start') {
      startURLDomensionsUpdated = false;
      aEvents = [data.event];
    } else if (data.messageType === 'clear') {
      startURLDomensionsUpdated = false;
      aEvents = [];
    } else if (data.messageType === 'give_recording_data') {
      chrome.runtime.sendMessage({
        messageType: 'recording_data',
        recordingData: [].concat(aEvents),
      });
    }
  });
})();
