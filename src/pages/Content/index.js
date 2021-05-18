import { interceptEvents } from './modules/collectEvents';
import getNodeSelector from './modules/getNodeSelector';

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
      // console.log('IS CONTENT STRING RECORDING ???? => ', data);
      if (!data.isRecording) {
        return;
      }
      function eventInterceptopMainHandler(ev) {
        interceptEvents(ev, window.document, null, (obj) => {
          chrome.runtime.sendMessage(obj);
        });
      }
      if (data.isRecording) {
        isRecording = true;
        originalTitle = document.title;
        changePageTitle();
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

      function addEventsToIframe(ifr, force) {
        const ifrSelector = getNodeSelector(ifr, {
          root: window.document,
          seedMinLength: 3,
          optimizedMinLength: 3,
        });
        function eventInterceptopFrameHandler(ev) {
          interceptEvents(
            ev,
            ifr.contentWindow.document,
            ifrSelector,
            (obj) => {
              chrome.runtime.sendMessage(obj);
            }
          );
        }
        const iframeAddEventsCollector = () => {
          try {
            if (data.isRecording) {
              // Leaving this here, maybe Ill need it in the future
              // ifr.contentWindow.addEventListener('load', (ev) => {
              //   addMutationObserver(ifr.contentWindow.document);
              // });
              if (ifr.contentWindow.____probely_sequence_recorder) {
                return;
              }
              ifr.contentWindow.____probely_sequence_recorder = true;

              ifr.contentWindow.document.addEventListener(
                'click',
                eventInterceptopFrameHandler,
                true
              );
              ifr.contentWindow.document.addEventListener(
                'mouseover',
                eventInterceptopFrameHandler,
                true
              );
              ifr.contentWindow.document.addEventListener(
                'dblclick',
                eventInterceptopFrameHandler,
                true
              );
              ifr.contentWindow.document.addEventListener(
                'contextmenu',
                eventInterceptopFrameHandler,
                true
              );
              ifr.contentWindow.document.addEventListener(
                'keydown',
                eventInterceptopFrameHandler,
                true
              );
              ifr.contentWindow.document.addEventListener(
                'blur',
                eventInterceptopFrameHandler,
                true
              );
              ifr.contentWindow.document.addEventListener(
                'change',
                eventInterceptopFrameHandler,
                true
              );
            }
          } catch (ex) {
            // ignore - doesn't have access
          }
        };
        if (force) {
          iframeAddEventsCollector();
        } else {
          ifr.addEventListener('load', iframeAddEventsCollector);
        }
      }

      const aIfrs = document.querySelectorAll('iframe, frame');
      aIfrs.forEach((ifr) => {
        addEventsToIframe(ifr);
        setTimeout(() => {
          try {
            if (!ifr.contentWindow.____probely_sequence_recorder) {
              addEventsToIframe(ifr, true);
            }
          } catch (ex) {
            // ignore
          }
        }, 2000);
      });

      const mutationConfig = {
        attributes: true,
        childList: true,
        subtree: true,
      };
      const onMutationCallback = async (mutationsList, observer) => {
        for (const mutation of mutationsList) {
          for (let i = 0; i < mutation.addedNodes.length; i++) {
            const mutationNode = mutation.addedNodes[i];
            if (
              mutationNode &&
              mutationNode.nodeType === 1 &&
              mutationNode.querySelectorAll
            ) {
              let aIfrsMut = [];
              if (
                mutationNode &&
                mutationNode.nodeName &&
                ['iframe', 'frame'].indexOf(
                  mutationNode.nodeName.toLowerCase()
                ) > -1
              ) {
                aIfrsMut = [mutationNode];
              } else {
                aIfrsMut = mutationNode.querySelectorAll('iframe, frame');
              }
              aIfrsMut.forEach((ifr) => {
                addEventsToIframe(ifr);
                setTimeout(() => {
                  try {
                    if (!ifr.contentWindow.____probely_sequence_recorder) {
                      addEventsToIframe(ifr, true);
                    }
                  } catch (ex) {
                    // ignore
                  }
                }, 2000);
              });
            }
          }
        }
      };
      const observer = new MutationObserver(onMutationCallback);
      observer.observe(document.documentElement, mutationConfig);
    });
  }
})();
