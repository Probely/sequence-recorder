import '../../assets/img/icon-34.png';
import '../../assets/img/icon-128.png';

(function () {
  let startURLDimensionsUpdated = false;
  let aEvents = [];

  chrome.storage.local.get(['recordingEvents', 'startURLDimensionsUpdated', 'recordingTimestamp'], (data) => {
    const now = Date.now();
    const dataTTL = 10 * 60 * 1000;

    if (data.recordingTimestamp && (now - data.recordingTimestamp) > dataTTL) {
      chrome.storage.local.remove(['recordingEvents', 'startURLDimensionsUpdated', 'recordingTimestamp']);
      aEvents = [];
      startURLDimensionsUpdated = false;
    } else {
      if (data.recordingEvents && Array.isArray(data.recordingEvents)) {
        aEvents = data.recordingEvents;
      }
      if (data.startURLDimensionsUpdated !== undefined) {
        startURLDimensionsUpdated = data.startURLDimensionsUpdated;
      }
    }
  });

  chrome.storage.sync.get(['isRecording'], (data) => {
    if (data.isRecording) {
      (chrome.action || chrome.browserAction).setBadgeText(
        {
          text: '🔴',
        },
        () => { }
      );
    } else {
      (chrome.action || chrome.browserAction).setBadgeText(
        {
          text: '',
        },
        () => { }
      );
    }
  });

  function saveEventsToStorage() {
    chrome.storage.local.set({
      recordingEvents: aEvents,
      startURLDimensionsUpdated: startURLDimensionsUpdated,
      recordingTimestamp: Date.now()
    });
  }

  chrome.runtime.onMessage.addListener((data, sender, sendResponse) => {
    if (data.messageType === 'events') {
      if (!startURLDimensionsUpdated) {
        startURLDimensionsUpdated = true;
        if (aEvents.length === 1 && data.event.type === 'goto') {
          aEvents[0].windowWidth = data.event.windowWidth;
          aEvents[0].windowHeight = data.event.windowHeight;

          if (aEvents[0].url === data.event.url) {
            saveEventsToStorage();
            return;
          }
        }
      }
      aEvents.push(data.event);
      saveEventsToStorage();
    } else if (data.messageType === 'start') {
      startURLDimensionsUpdated = false;
      aEvents = [data.event];
      saveEventsToStorage();
    } else if (data.messageType === 'clear') {
      startURLDimensionsUpdated = false;
      aEvents = [];
      chrome.storage.local.remove(['recordingEvents', 'startURLDimensionsUpdated', 'recordingTimestamp']);
    } else if (data.messageType === 'give_recording_data') {
      chrome.runtime.sendMessage({
        messageType: 'recording_data',
        recordingData: [].concat(aEvents),
      });
    }
  });
})();
