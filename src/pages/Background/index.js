import '../../assets/img/icon-34.png';
import '../../assets/img/icon-128.png';

(function () {
  let startURLDimensionsUpdated = false;
  let aEvents = [];
  // tabs that sent events during the current recording
  let recordingTabIds = [];
  // A page can open a popup before its tab's first event arrives (e.g. from
  // window.onload on the start page), so keep the opener until it does.
  let popupSourceTabIds = [];

  const recordingStorageKeys = ['recordingEvents', 'startURLDimensionsUpdated', 'recordingTabIds', 'popupSourceTabIds', 'recordingTimestamp'];

  // The background can be restarted mid-recording, so listeners must wait for
  // the stored recording before changing (and re-saving) it.
  const storageLoaded = new Promise((resolve) => {
    chrome.storage.local.get(recordingStorageKeys, (data) => {
      const now = Date.now();
      const dataTTL = 10 * 60 * 1000;

      if (data.recordingTimestamp && (now - data.recordingTimestamp) > dataTTL) {
        chrome.storage.local.remove(recordingStorageKeys);
        aEvents = [];
        startURLDimensionsUpdated = false;
        recordingTabIds = [];
        popupSourceTabIds = [];
      } else {
        if (data.recordingEvents && Array.isArray(data.recordingEvents)) {
          aEvents = data.recordingEvents;
        }
        if (data.startURLDimensionsUpdated !== undefined) {
          startURLDimensionsUpdated = data.startURLDimensionsUpdated;
        }
        if (Array.isArray(data.recordingTabIds)) {
          recordingTabIds = data.recordingTabIds;
        }
        if (Array.isArray(data.popupSourceTabIds)) {
          popupSourceTabIds = data.popupSourceTabIds;
        }
      }
      resolve();
    });
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
      recordingTabIds: recordingTabIds,
      popupSourceTabIds: popupSourceTabIds,
      recordingTimestamp: Date.now()
    });
  }

  function onMessage(data, sender) {
    if (data.messageType === 'events') {
      if (sender.tab && recordingTabIds.indexOf(sender.tab.id) === -1) {
        recordingTabIds.push(sender.tab.id);
        if (popupSourceTabIds.indexOf(sender.tab.id) > -1 && aEvents.length) {
          aEvents[0].allow_popups = true;
        }
      }
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
      recordingTabIds = [];
      popupSourceTabIds = [];
      saveEventsToStorage();
    } else if (data.messageType === 'clear') {
      startURLDimensionsUpdated = false;
      aEvents = [];
      recordingTabIds = [];
      popupSourceTabIds = [];
      chrome.storage.local.remove(recordingStorageKeys);
    } else if (data.messageType === 'give_recording_data') {
      chrome.runtime.sendMessage({
        messageType: 'recording_data',
        recordingData: [].concat(aEvents),
      });
    }
  }

  chrome.runtime.onMessage.addListener((data, sender, sendResponse) => {
    storageLoaded.then(() => onMessage(data, sender));
  });

  // Fired for window.open() and target="_blank" links/forms, including popups
  // opened in a separate window (where tabs' openerTabId is not set).
  chrome.webNavigation.onCreatedNavigationTarget.addListener((details) => {
    storageLoaded.then(() => {
      chrome.storage.sync.get(['isRecording'], (data) => {
        if (!data.isRecording || !aEvents.length || aEvents[0].allow_popups) {
          return;
        }
        if (recordingTabIds.indexOf(details.sourceTabId) > -1) {
          aEvents[0].allow_popups = true;
        } else if (popupSourceTabIds.indexOf(details.sourceTabId) === -1) {
          popupSourceTabIds.push(details.sourceTabId);
        } else {
          return;
        }
        saveEventsToStorage();
      });
    });
  });
})();
