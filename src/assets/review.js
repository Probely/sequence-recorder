(() => {
  let aData = null;

  chrome.runtime.onMessage.addListener((data, sender, sendResponse) => {
    if (data.messageType === 'recording_data') {
      aData = data.recordingData || [];
      console.log(aData);
    }
  });
  chrome.runtime.sendMessage({
    messageType: 'give_recording_data',
  });
})();
