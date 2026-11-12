// import getNodeSelector from './getNodeSelector';
import getNodeSelector from './finder';
import getBestElement from './getBestElement';
import getCustomSelector, {
  dataTestAttrs,
  getTestAncestor,
  getTestAttrSelector,
  isStableClassName,
} from './getCustomSelector';
import getXPath from './getXPath';

const oNodes = {};
const lastNodes = {
  keydown: null,
  return: null,
  blur: null,
  change: null,
  click: null,
  dblclick: null,
  contextmenu: null,
  focus: null,
  mouseover: null,
  mouseout: null,
};

let stoMouseover = false;
let pendingInput = null;
let flushedInput = null;
const keystrokeBuffers = new WeakMap();
let pendingCanvasInput = null;
let canvasKeystrokeBuffer = '';
let lastRecordedClick = null;
// A checkbox/radio "change" this soon after a recorded click on another
// element was caused by that click (e.g. custom checkboxes calling
// input.click()), so replaying both would toggle it twice.
const SIDE_EFFECT_CHANGE_MS = 100;
const watchedShadowRoots = new WeakSet();

// "change" is not a composed event, so it never reaches the document
// listeners from inside a shadow root; listen on each open root instead.
function watchShadowRoots(composedPath, doc, ifrSelector, callback) {
  for (const item of composedPath) {
    if (item instanceof ShadowRoot && !watchedShadowRoots.has(item)) {
      watchedShadowRoots.add(item);
      item.addEventListener(
        'change',
        (ev) => {
          // slotted (light DOM) targets also reach the outer listeners
          if (ev.target && ev.target.getRootNode() === item) {
            interceptEvents(ev, doc, ifrSelector, callback);
          }
        },
        true
      );
    }
  }
}

function getEffectiveValue(element) {
  const domValue = element.value;
  if (domValue && domValue.trim()) {
    return domValue;
  }
  return keystrokeBuffers.get(element) || domValue;
}

function isBufferedValue(element) {
  const domValue = element.value;
  return !(domValue && domValue.trim()) && keystrokeBuffers.has(element);
}

function isCanvasSurface(element) {
  if (element.nodeName.toLowerCase() === 'canvas') return true;
  if (element.shadowRoot) {
    try {
      if (element.shadowRoot.querySelector('canvas')) return true;
    } catch (ex) { /* ignore */ }
  }
  for (const child of element.children || []) {
    if (child.shadowRoot) {
      try {
        if (child.shadowRoot.querySelector('canvas')) return true;
      } catch (ex) { /* ignore */ }
    }
  }
  return false;
}

const finderOptions = {
  attr: (name) => dataTestAttrs.includes(name),
  idName: (name) => {
    return !/^[0-9]+.*/i.test(name);
  },
  className: isStableClassName,
};

// The same test id can appear more than once (repeated widgets, other tab
// panes), so anchor it further up when it isn't unique on its own.
function getTestAncestorSelector(testAncestor, doc) {
  const attrSelector = getTestAttrSelector(testAncestor);
  try {
    if (doc.querySelectorAll(attrSelector).length === 1) {
      return attrSelector;
    }
  } catch (ex) {
    // ignore
  }
  return getFallbackSelector(testAncestor, doc);
}

// Prefer a selector anchored on the nearest QA/test-attribute ancestor; the
// plain finder stops at the first unique class and would skip it.
function getFallbackSelector(element, doc) {
  const testAncestor = getTestAncestor(element);
  if (testAncestor) {
    try {
      const inner = getNodeSelector(element, {
        ...finderOptions,
        root: testAncestor,
      });
      const scoped = `${getTestAncestorSelector(testAncestor, doc)} ${inner}`;
      const foundElms = doc.querySelectorAll(scoped);
      if (foundElms.length === 1 && foundElms[0] === element) {
        return scoped;
      }
    } catch (ex) {
      // ignore
    }
  }
  return getNodeSelector(element, { ...finderOptions, root: doc });
}

function getElementSelector(element, doc) {
  let selector = null;
  try {
    selector = getCustomSelector(element, doc);
  } catch (ex) {
    // ignore
  }
  if (!selector) {
    try {
      selector = getFallbackSelector(element, doc);
    } catch (ex) {
      // ignore
    }
  }
  return selector;
}

function getStableInputSelector(element, doc) {
  const dynamicPatterns = ['focus', 'highlight', 'editable', 'caret'];
  const classes = Array.from(element.classList || []).filter((cls) => {
    const lower = cls.toLowerCase();
    return (
      !dynamicPatterns.some((p) => lower.includes(p)) && isStableClassName(cls)
    );
  });
  for (const cls of classes) {
    const sel = '.' + cls;
    try {
      const matches = doc.querySelectorAll(sel);
      if (matches.length === 1 && matches[0] === element) {
        return sel;
      }
    } catch (ex) {
      // ignore
    }
  }
  return null;
}

export function interceptEvents(event, doc, ifrSelector, callback) {
  let hasKeyReturn = false;
  let tgt = null;
  let composedPath = null;
  if (event && event.composed && event.composedPath) {
    composedPath = event.composedPath();
  }
  let shadowRootIdx = -1;
  if (composedPath && composedPath.length > 0) {
    shadowRootIdx = composedPath.findIndex(
      (item) => item instanceof ShadowRoot
    );
  }
  if (shadowRootIdx > -1) {
    tgt = composedPath[0];
    watchShadowRoots(composedPath, doc, ifrSelector, callback);
  } else {
    tgt = event.target;
  }
  const isInShadowRoot =
    shadowRootIdx > -1 ||
    !!(tgt && tgt.getRootNode && tgt.getRootNode() instanceof ShadowRoot);
  const type = event.type;
  let nodeName = null;
  let nodeType = null;
  if (tgt && tgt.getAttribute) {
    nodeName = tgt.nodeName.toLowerCase();
    nodeType = tgt.getAttribute('type');
  } else {
    return;
  }
  const isToggleInput =
    nodeName === 'input' && (tgt.type === 'checkbox' || tgt.type === 'radio');
  // console.log(
  //   'CAPTURED EVENT :: ',
  //   type,
  //   ' :: ',
  //   tgt.value || '',
  //   ' :: ',
  //   tgt,
  //   ' :: event :: ',
  //   event
  // );
  let bestElm = null;
  try {
    bestElm = getBestElement(tgt, doc);
  } catch (ex) {
    // ignore
  }
  const selector = getElementSelector(bestElm, doc);
  if (selector && selector.toLowerCase() === 'html') {
    if (!(type === 'keydown' && pendingCanvasInput)) {
      return;
    }
  }
  let xpath = null;
  try {
    xpath = getXPath(bestElm, doc);
  } catch (ex) {
    // ignore
  }
  if (isInShadowRoot) {
    xpath = '/html/node/shadow';
  }

  let oEventBase = {
    timestamp: new Date().getTime(),
    css: selector || tgt,
    xpath: xpath || '',
  };

  let oEventToSend = {};

  if (type === 'click') {
    lastNodes.click = tgt;

    if (pendingInput && pendingInput.element !== tgt && callback) {
      const useBuffer = isBufferedValue(pendingInput.element);
      const fillEvent = {
        ...pendingInput.oEventBase,
        type: useBuffer ? 'bfill_value' : 'fill_value',
        value: getEffectiveValue(pendingInput.element),
        frame: pendingInput.frame,
      };
      if (useBuffer) {
        const stableSel = getStableInputSelector(pendingInput.element, doc);
        if (stableSel) {
          fillEvent.css = stableSel;
        }
      }
      callback({ messageType: 'events', event: { ...fillEvent } });
      keystrokeBuffers.delete(pendingInput.element);
      flushedInput = pendingInput.element;
      pendingInput = null;
    }

    if (pendingCanvasInput && canvasKeystrokeBuffer.length > 0 && callback) {
      const canvasFillEvent = {
        ...pendingCanvasInput.oEventBase,
        type: 'bfill_value',
        value: canvasKeystrokeBuffer,
        frame: pendingCanvasInput.frame,
      };
      if (pendingCanvasInput.shadow_host_css) {
        canvasFillEvent.shadow_host_css = pendingCanvasInput.shadow_host_css;
      }
      callback({ messageType: 'events', event: { ...canvasFillEvent } });
    }
    canvasKeystrokeBuffer = '';
    pendingCanvasInput = null;

    if (
      lastNodes.return === lastNodes.change &&
      tgt !== lastNodes.return &&
      (nodeName === 'input' || nodeName === 'button') &&
      (nodeType === 'submit' || nodeType === 'image') &&
      lastNodes.return !== null
    ) {
      // ignore this click, already submitted
      return;
    }
    if (isToggleInput) {
      return;
    }
    // the resulting "change" records the selection; replaying the click as
    // well would just reopen the dropdown
    if (
      nodeName === 'select' ||
      ((nodeName === 'option' || nodeName === 'optgroup') &&
        tgt.closest('select'))
    ) {
      return;
    }
    let clickedElm = tgt;
    const parentLabel = tgt.closest && tgt.closest('label');
    if (parentLabel) {
      // Clicks on interactive descendants (links, buttons, other fields) are
      // not forwarded by the browser to the labeled control.
      const interactiveHit = tgt.closest('a, button, input, select, textarea');
      const forwardsToControl =
        !interactiveHit || !parentLabel.contains(interactiveHit);
      const control = parentLabel.control;
      if (
        forwardsToControl &&
        control &&
        control.nodeName.toLowerCase() === 'input' &&
        (control.type === 'checkbox' || control.type === 'radio')
      ) {
        // Record the label click instead of the control's "change": setting
        // .checked on replay bypasses framework handlers (e.g. React), and
        // custom toggles often swap the inner icon when the state changes.
        const labelSelector = getElementSelector(parentLabel, doc);
        if (labelSelector) {
          clickedElm = parentLabel;
          let labelXPath = '';
          try {
            labelXPath = getXPath(parentLabel, doc) || '';
          } catch (ex) {
            // ignore
          }
          oEventBase = {
            ...oEventBase,
            css: labelSelector,
            xpath: isInShadowRoot ? oEventBase.xpath : labelXPath,
          };
        }
      }
    }
    let typeStr = 'click';
    if (isCanvasSurface(tgt)) {
      const rect = tgt.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const width = rect.width;
      const height = rect.height;

      const clickData = { x, y, width, height };
      oEventBase = { ...oEventBase, coords: clickData };

      typeStr = 'bclick';
    }
    oEventToSend = {
      ...oEventBase,
      type: typeStr,
      value: (clickedElm.value || clickedElm.textContent || '')
        .trim()
        .substr(0, 20)
        .replace(/\n/gi, ''),
      frame: ifrSelector,
    };
    lastRecordedClick = { element: clickedElm, timestamp: oEventBase.timestamp };

    // Add shadow host CSS selector for bclick events inside shadow DOM
    if (typeStr === 'bclick' && shadowRootIdx > -1 && composedPath) {
      const shadowRoot = composedPath[shadowRootIdx];
      const shadowHost = shadowRoot.host;
      if (shadowHost) {
        let shadowHostSelector = null;
        try {
          shadowHostSelector = getCustomSelector(shadowHost, doc);
        } catch (ex) {
          // ignore
        }
        if (!shadowHostSelector) {
          try {
            shadowHostSelector = getFallbackSelector(shadowHost, doc);
          } catch (ex) {
            // ignore
          }
        }
        if (shadowHostSelector) {
          oEventToSend.shadow_host_css = shadowHostSelector;
        }
      }
    }
    if (typeStr === 'bclick') {
      pendingCanvasInput = {
        element: tgt,
        oEventBase: { ...oEventBase },
        frame: ifrSelector,
        shadow_host_css: oEventToSend.shadow_host_css || null,
      };
    }
  } else if (type === 'dblclick') {
    lastNodes.dblclick = tgt;
    oEventToSend = {
      ...oEventBase,
      type: 'dblclick',
      value: (tgt.value || tgt.textContent || '')
        .trim()
        .substr(0, 20)
        .replace(/\n/gi, ''),
      frame: ifrSelector,
    };
  } else if (type === 'contextmenu') {
    lastNodes.contextmenu = tgt;
    oEventToSend = {
      ...oEventBase,
      type: 'contextmenu',
      value: (tgt.value || tgt.textContent || '')
        .trim()
        .substr(0, 20)
        .replace(/\n/gi, ''),
      frame: ifrSelector,
    };
  } else if (type === 'focus') {
    // lastNodes.focus = tgt;
    // oEventToSend = {
    //   ...oEventBase,
    //   type: 'focus',
    //   value: (tgt.value || tgt.textContent || '')
    //     .substr(0, 20)
    //     .replace(/\n/gi, ''),
    //   frame: ifrSelector,
    // };
  } else if (type === 'mouseover') {
    if (stoMouseover) {
      clearTimeout(stoMouseover);
      stoMouseover = false;
    }
    stoMouseover = setTimeout(() => {
      stoMouseover = false;
      lastNodes.mouseover = tgt;
      oEventToSend = {
        ...oEventBase,
        type: 'mouseover',
        value: (tgt.value || tgt.textContent || '')
          .trim()
          .substr(0, 20)
          .replace(/\n/gi, ''),
        frame: ifrSelector,
      };
      if (oEventToSend && oEventToSend.type && callback) {
        callback({
          messageType: 'events',
          event: { ...oEventToSend },
        });
      }
    }, 500);
  } else if (type === 'mouseout') {
    // lastNodes.mouseout = tgt;
    // oEventToSend = {
    //   ...oEventBase,
    //   type: 'mouseout',
    //   value: (tgt.value || tgt.textContent || '')
    //     .substr(0, 20)
    //     .replace(/\n/gi, ''),
    //   frame: ifrSelector,
    // };
  } else if (type === 'keydown') {
    lastNodes.keydown = tgt;
    if (['input', 'textarea'].indexOf(nodeName) > -1 && !isToggleInput) {
      oNodes[tgt] = tgt.value;
      pendingInput = { element: tgt, oEventBase: { ...oEventBase }, frame: ifrSelector };
      if (event.key && event.key.length === 1) {
        const buf = keystrokeBuffers.get(tgt) || '';
        keystrokeBuffers.set(tgt, buf + event.key);
      } else if (event.key === 'Backspace') {
        const buf = keystrokeBuffers.get(tgt) || '';
        if (buf.length > 0) {
          keystrokeBuffers.set(tgt, buf.slice(0, -1));
        }
      }
    } else if (pendingCanvasInput) {
      if (event.key && event.key.length === 1) {
        canvasKeystrokeBuffer += event.key;
      } else if (event.key === 'Backspace') {
        if (canvasKeystrokeBuffer.length > 0) {
          canvasKeystrokeBuffer = canvasKeystrokeBuffer.slice(0, -1);
        }
      }
    }
    if (
      nodeName === 'input' &&
      // tgt.type !== 'checkbox' &&
      // tgt.type !== 'radio' &&
      event.keyCode === 13
    ) {
      hasKeyReturn = true;
      // lastSelectorWithReturn = selector;
      lastNodes.return = tgt;
      if (!isToggleInput) {
        const useBuffer = isBufferedValue(tgt);
        oEventToSend = {
          ...oEventBase,
          type: useBuffer ? 'bfill_value' : 'fill_value',
          value: getEffectiveValue(tgt),
          frame: ifrSelector,
        };
        if (useBuffer) {
          const stableSel = getStableInputSelector(tgt, doc);
          if (stableSel) {
            oEventToSend.css = stableSel;
          }
        }
        keystrokeBuffers.delete(tgt);
      }
    } else if (pendingCanvasInput && event.keyCode === 13) {
      if (canvasKeystrokeBuffer.length > 0 && callback) {
        const canvasFillEvent = {
          ...pendingCanvasInput.oEventBase,
          type: 'bfill_value',
          value: canvasKeystrokeBuffer,
          frame: pendingCanvasInput.frame,
        };
        if (pendingCanvasInput.shadow_host_css) {
          canvasFillEvent.shadow_host_css = pendingCanvasInput.shadow_host_css;
        }
        callback({ messageType: 'events', event: { ...canvasFillEvent } });
        canvasKeystrokeBuffer = '';
      }
      if (callback) {
        const canvasReturnEvent = {
          ...pendingCanvasInput.oEventBase,
          timestamp: new Date().getTime(),
          type: 'press_key',
          value: 13,
          frame: pendingCanvasInput.frame,
        };
        callback({ messageType: 'events', event: { ...canvasReturnEvent } });
      }
      pendingCanvasInput = null;
    }
  } else if (type === 'blur') {
    lastNodes.blur = tgt;
    if (tgt === flushedInput) {
      flushedInput = null;
      return;
    }
    if (pendingInput && pendingInput.element === tgt) {
      pendingInput = null;
    }
    if (['input', 'textarea'].indexOf(nodeName) > -1 && !isToggleInput) {
      oNodes[tgt] = tgt.value;
      if (tgt === lastNodes.return) {
        lastNodes.return = null;
        return;
      }
      if (
        nodeName === 'input' &&
        (tgt.type === 'submit' || tgt.type === 'button' || tgt.type === 'image')
      ) {
        return;
      }
      const useBuffer = isBufferedValue(tgt);
      oEventToSend = {
        ...oEventBase,
        type: useBuffer ? 'bfill_value' : 'fill_value',
        value: getEffectiveValue(tgt),
        frame: ifrSelector,
      };
      if (useBuffer) {
        const stableSel = getStableInputSelector(tgt, doc);
        if (stableSel) {
          oEventToSend.css = stableSel;
        }
      }
      keystrokeBuffers.delete(tgt);
    }
  } else if (type === 'change') {
    lastNodes.change = tgt;
    if (nodeName === 'input') {
      if (nodeType === 'checkbox' || nodeType === 'radio') {
        if (
          lastRecordedClick &&
          lastRecordedClick.element !== tgt &&
          oEventBase.timestamp - lastRecordedClick.timestamp <
          SIDE_EFFECT_CHANGE_MS
        ) {
          return;
        }
        oEventToSend = {
          ...oEventBase,
          type: 'change',
          subtype: 'check',
          checked: tgt.checked,
          frame: ifrSelector,
        };
      } else {
        // if (tgt === lastNodes.return) {
        //   oEventToSend = {
        //     ...oEventBase,
        //     type: 'press_key',
        //     value: 13,
        //     frame: ifrSelector,
        //   };
        // }
      }
    } else if (nodeName === 'select') {
      if (tgt.multiple) {
        const aSelected = [];
        for (let i = 0; i < tgt.options.length; i++) {
          aSelected.push(!!tgt.options[i].selected);
        }
        oEventToSend = {
          ...oEventBase,
          type: 'change',
          subtype: 'select_multi',
          selected: [].concat(aSelected),
          value: tgt.value,
          frame: ifrSelector,
        };
      } else {
        const selectedIndex = tgt.selectedIndex;
        oEventToSend = {
          ...oEventBase,
          type: 'change',
          subtype: 'select',
          selected: selectedIndex,
          value: tgt.value,
          frame: ifrSelector,
        };
      }
    }
  }

  if (oEventToSend && oEventToSend.type && callback) {
    callback({
      messageType: 'events',
      event: { ...oEventToSend },
    });
  }
  if (hasKeyReturn && callback) {
    const oReturnEvent = {
      ...oEventBase,
      timestamp: new Date().getTime(),
      type: 'press_key',
      value: 13,
      frame: ifrSelector,
    };
    callback({
      messageType: 'events',
      event: { ...oReturnEvent },
    });
  }
}
