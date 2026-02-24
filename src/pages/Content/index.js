import { interceptEvents } from './modules/collectEvents';
import getNodeSelector from './modules/getNodeSelector';
import getCustomSelector from './modules/getCustomSelector';

(function () {
  // console.log('CONTENT SCRIPT HAS BEEN LOADED');
  const iconRecording = '🔴';
  let originalTitle = document.title;
  let isRecording = false;
  let stoTitle = false;
  let hasIcon = false;

  function changePageTitle() {
    if (!isRecording) {
      document.title = `${originalTitle}`;
      hasIcon = false;
      if (stoTitle) {
        clearInterval(stoTitle);
        stoTitle = false;
      }
      return;
    }
    stoTitle = setInterval(() => {
      if (!hasIcon) {
        document.title = `${iconRecording} ${originalTitle}`;
        hasIcon = true;
      } else {
        document.title = `${originalTitle}`;
        hasIcon = false;
      }
    }, 1000);
  }

  if (chrome) {
    chrome.storage.sync.get(['isRecording'], (data) => {
      // console.log('IS CONTENT SCRIPT RECORDING ???? => ', data);
      if (!data.isRecording) {
        return;
      }

      let mutationDetected = false;
      let stoMutation = null;

      // wait for messages from iframes in the top frame
      if (window === window.top) {
        window.addEventListener('message', (evMsg) => {
          if (
            evMsg.data &&
            evMsg.data.source &&
            evMsg.data.source === 'event-from-iframe'
          ) {
            // Verify the message actually came from a child iframe
            const aFrames = document.querySelectorAll('iframe, frame');
            let isFromChildFrame = false;
            for (const frame of aFrames) {
              if (frame.contentWindow === evMsg.source) {
                isFromChildFrame = true;
                break;
              }
            }
            if (!isFromChildFrame) {
              return; // Message didn't come from any of our iframes
            }

            const obj = { ...evMsg.data.obj };
            const framePath = evMsg.data.framePath || [];
            for (const frame of aFrames) {
              if (frame.contentWindow === evMsg.source) {
                let frameSelector = null;
                try {
                  frameSelector = getCustomSelector(frame);
                } catch (ex) {
                  // ignore
                }
                if (!frameSelector) {
                  try {
                    frameSelector = getNodeSelector(frame, {
                      root: window.document,
                      idName: (name) => {
                        return !/^[0-9]+.*/i.test(name);
                      },
                      className: (name) => {
                        return (
                          !name.includes('focus') &&
                          !name.includes('highlight') &&
                          !/^[0-9]+.*/i.test(name)
                        );
                      },
                      // seedMinLength: 3,
                      // optimizedMinLength: 3,
                    });
                  } catch (ex) {
                    // ignore
                  }
                }
                if (frameSelector && obj.event) {
                  // Build the complete frame path: [outermost, ..., innermost]
                  const completeFramePath = [frameSelector, ...framePath];
                  obj.event.frame = completeFramePath.join(' >>> ');
                  chrome.runtime.sendMessage(obj);
                }
                break;
              }
            }
          }
        });
      }

      // intermediate frames: listen for messages from child iframes and forward to parent
      if (window !== window.top) {
        window.addEventListener('message', (evMsg) => {
          if (
            evMsg.data &&
            evMsg.data.source &&
            evMsg.data.source === 'event-from-iframe'
          ) {
            // Verify the message actually came from a child iframe
            const aFrames = document.querySelectorAll('iframe, frame');
            let isFromChildFrame = false;
            for (const frame of aFrames) {
              if (frame.contentWindow === evMsg.source) {
                isFromChildFrame = true;
                break;
              }
            }
            if (!isFromChildFrame) {
              return; // Message didn't come from any of our iframes
            }

            // This is an intermediate frame - find the child iframe and add to path
            const framePath = evMsg.data.framePath || [];

            for (const frame of aFrames) {
              if (frame.contentWindow === evMsg.source) {
                let frameSelector = null;
                try {
                  frameSelector = getCustomSelector(frame);
                } catch (ex) {
                  // ignore
                }
                if (!frameSelector) {
                  try {
                    frameSelector = getNodeSelector(frame, {
                      root: window.document,
                      idName: (name) => {
                        return !/^[0-9]+.*/i.test(name);
                      },
                      className: (name) => {
                        return (
                          !name.includes('focus') &&
                          !name.includes('highlight') &&
                          !/^[0-9]+.*/i.test(name)
                        );
                      },
                    });
                  } catch (ex) {
                    // ignore
                  }
                }

                // Forward to parent with this frame's selector added to path
                if (frameSelector) {
                  framePath.push(frameSelector);
                }

                window.parent.postMessage(
                  {
                    source: 'event-from-iframe',
                    obj: evMsg.data.obj,
                    framePath: framePath,
                  },
                  '*'
                );
                break;
              }
            }
          }
        });
      }

      function eventInterceptopMainHandler(ev) {
        if (ev && ev.type === 'mouseover' && !mutationDetected) {
          return;
        }
        interceptEvents(ev, window.document, null, (obj) => {
          if (window !== window.top) {
            // If the event is inside a frame, send it to the parent
            window.parent.postMessage(
              {
                source: 'event-from-iframe',
                obj: { ...obj },
                framePath: [], // Start with empty path, will be built as message bubbles up
              },
              '*'
            );
          } else {
            // if in the top frame, send to background
            chrome.runtime.sendMessage(obj);
          }
        });
      }
      if (data.isRecording) {
        isRecording = true;
        originalTitle = document.title;
        changePageTitle();
        if (window === window.top) {
          // save "goto" only on top frames
          chrome.runtime.sendMessage({
            messageType: 'events',
            event: {
              type: 'goto',
              timestamp: new Date().getTime(),
              windowWidth: window.innerWidth,
              windowHeight: window.innerHeight,
              url: window.location.href,
            },
          });
        }
        // Leaving this, maybe I need in the future
        // window.addEventListener('load', (ev) => {
        //   addMutationObserver(document);
        // });
        document.addEventListener('click', eventInterceptopMainHandler, true);
        // document.addEventListener('focus', eventInterceptopMainHandler, true);
        document.addEventListener(
          'mouseover',
          eventInterceptopMainHandler,
          true
        );
        // document.addEventListener(
        //   'mouseout',
        //   eventInterceptopMainHandler,
        //   true
        // );
        document.addEventListener(
          'dblclick',
          eventInterceptopMainHandler,
          true
        );
        document.addEventListener(
          'contextmenu',
          eventInterceptopMainHandler,
          true
        );
        document.addEventListener('keydown', eventInterceptopMainHandler, true);
        document.addEventListener('blur', eventInterceptopMainHandler, true);
        document.addEventListener('change', eventInterceptopMainHandler, true);
        // document.addEventListener('paste', eventInterceptopMainHandler, true);
      }

      const mutationConfig = {
        attributes: false,
        childList: true,
        subtree: true,
      };
      const onMutationCallback = async (mutationsList, observer) => {
        mutationDetected = true;
        if (stoMutation) {
          clearTimeout(stoMutation);
          stoMutation = null;
        }
        stoMutation = setTimeout(() => {
          // keep "mutationDetected" enabled within 200ms
          mutationDetected = false;
        }, 200);
      };
      const observer = new MutationObserver(onMutationCallback);
      if (document.body) {
        observer.observe(document.body, mutationConfig);
      }
    });
  }
})();
