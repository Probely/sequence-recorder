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
const watchedShadowRoots = new WeakSet();

// A trusted pointerdown/keydown starts a new user activation. The browser
// forwards a label click to its control within the same task, so any other
// trusted click on a checkbox/radio is the user's own action. A change or click
// with no trusted event of its own is an effect of an activation: replaying the
// activation's recorded action reproduces it, but when nothing was recorded
// (e.g. Space on a custom widget) the effect itself has to be.
function newActivation(target) {
  return {
    target,
    // label clicks not yet forwarded; the label's handlers can replace its
    // control or change its "for", so it's looked up when the click arrives
    labels: new Set(),
    // toggle input -> 'label' (forwarded) or 'user'
    toggleClicks: new WeakMap(),
    recordedAction: false,
    // while one of its trusted events is being handled
    inTask: false,
  };
}
let activation = newActivation(null);
// An effect can come later (a timer, a request) and land after the user's
// next action started.
const recentActivations = [activation];
const MAX_RECENT_ACTIVATIONS = 5;

function composedParent(node) {
  return node.parentNode instanceof ShadowRoot
    ? node.parentNode.host
    : node.parentNode;
}

function commonAncestorDepth(a, b) {
  const chain = [];
  for (let node = b; node; node = composedParent(node)) {
    chain.unshift(node);
  }
  const depths = new Map(chain.map((node, i) => [node, i]));
  for (let node = a; node; node = composedParent(node)) {
    if (depths.has(node)) {
      return depths.get(node);
    }
  }
  return -1;
}

// An effect during an activation's own task is that activation's. A later one
// is attributed to the recent activation whose target is closest to it in the
// page, the latest on ties.
function causeOf(element) {
  if (activation.inTask) {
    return activation;
  }
  let cause = activation;
  let best = -1;
  for (const candidate of recentActivations) {
    const depth = candidate.target
      ? commonAncestorDepth(candidate.target, element)
      : -1;
    if (depth >= best) {
      best = depth;
      cause = candidate;
    }
  }
  return cause;
}

function markInTask(current) {
  current.inTask = true;
  setTimeout(() => {
    current.inTask = false;
  }, 0);
}

// Moving focus or holding a modifier is not an action of its own, so a later
// effect of the previous action still belongs to it.
const NON_ACTION_KEYS = [
  'Tab',
  'Shift',
  'Control',
  'Alt',
  'AltGraph',
  'Meta',
  'CapsLock',
];
const USER_INPUT_TYPES = [
  'pointerdown',
  'keydown',
  'click',
  'dblclick',
  'contextmenu',
];
// steps that replay the user's action itself
const ACTION_STEP_TYPES = [
  'click',
  'bclick',
  'dblclick',
  'contextmenu',
  'fill_value',
  'bfill_value',
  'press_key',
];

// Elements added to a label already in the page (e.g. an icon created on
// hover or swapped when the state changes) may be missing when the recording
// is replayed on a fresh page. Content added in the same batch as its label is
// part of the label as rendered.
const lateLabelContent = new WeakSet();
let labelContentObserver = null;

function insertedWith(node, addedNodes) {
  for (let item = node; item; item = item.parentNode) {
    if (addedNodes.has(item)) {
      return true;
    }
  }
  return false;
}

function onLabelContentMutations(mutations) {
  const addedNodes = new Set();
  for (const mutation of mutations) {
    mutation.addedNodes.forEach((node) => addedNodes.add(node));
  }
  for (const mutation of mutations) {
    const label = mutation.target.closest && mutation.target.closest('label');
    if (!label || insertedWith(label, addedNodes)) {
      continue;
    }
    mutation.addedNodes.forEach((node) => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        lateLabelContent.add(node);
      }
    });
  }
}

export function watchLabelContent(root) {
  if (!labelContentObserver) {
    labelContentObserver = new MutationObserver(onLabelContentMutations);
  }
  labelContentObserver.observe(root, { childList: true, subtree: true });
}

function isLateLabelContent(element, label) {
  for (let item = element; item && item !== label; item = item.parentElement) {
    if (lateLabelContent.has(item)) {
      return true;
    }
  }
  return false;
}

// the closest ancestor that was there before the late content, whose hover
// most likely created it
function getHoverTarget(element, label) {
  for (
    let item = element.parentElement;
    item && item !== label;
    item = item.parentElement
  ) {
    if (!isLateLabelContent(item, label)) {
      return item;
    }
  }
  return label;
}

// "change" is not a composed event, so it never reaches the document
// listeners from inside a shadow root; listen on each open root instead.
function watchShadowRoots(composedPath, doc, ifrSelector, callback) {
  for (const item of composedPath) {
    if (item instanceof ShadowRoot && !watchedShadowRoots.has(item)) {
      watchedShadowRoots.add(item);
      watchLabelContent(item);
      item.addEventListener(
        'change',
        (ev) => {
          // slotted (light DOM) targets also reach the outer listeners,
          // composed events the document ones, and retargeted events the
          // inner root's own listener
          const path = ev.composedPath();
          if (
            !path.includes(doc) &&
            ev.target &&
            ev.target.getRootNode() === item &&
            path[0] === ev.target
          ) {
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
  // CSS can't represent NUL, so such a value would never match
  attr: (name, value) => dataTestAttrs.includes(name) && !value.includes('\0'),
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

function getRecordedTarget(element, doc) {
  const css = getElementSelector(element, doc);
  if (!css) {
    return null;
  }
  let xpath = '';
  try {
    xpath = getXPath(element, doc) || '';
  } catch (ex) {
    // ignore
  }
  return { css, xpath };
}

// A trusted click is held, with everything recorded after it, until its task
// ends: a label may still forward it to its control (then its fallback target
// is the label), and its handlers may still click other elements (then it's
// replayed as real input, as handlers checking event.isTrusted only click them
// again for that).
const heldEvents = [];

function emit(callback, payload) {
  if (heldEvents.length) {
    heldEvents.push({ callback, payload });
  } else {
    callback(payload);
  }
}

function releaseHeldEvents() {
  for (const held of heldEvents.splice(0)) {
    let { event } = held.payload;
    if (held.forwarded && held.whenForwarded) {
      event = { ...event, ...held.whenForwarded };
    }
    if (held.clickedByHandlers) {
      event = { ...event, type: 'bclick' };
      if (held.coords) {
        event.coords = held.coords;
      }
    }
    held.callback({ ...held.payload, event });
  }
}

function markRecordedAction(event, type) {
  if (event.isTrusted && ACTION_STEP_TYPES.includes(type)) {
    activation.recordedAction = true;
  }
}

// a page script clicked something while a held click of the activation was
// being handled
function noteHandlerClick(cause) {
  if (cause !== activation || !activation.inTask) {
    return;
  }
  for (const held of heldEvents) {
    if (held.activation === activation && held.replayableAsInput) {
      held.clickedByHandlers = true;
    }
  }
}

export function interceptEvents(event, doc, ifrSelector, callback) {
  // The page may go away before the timer releasing held clicks runs. This
  // can come while a label click is still being handled, so a click not yet
  // forwarded keeps the element actually clicked as its fallback.
  if (event && event.type === 'beforeunload') {
    if (event.isTrusted) {
      releaseHeldEvents();
    }
    return;
  }
  const startsActivation =
    event &&
    event.isTrusted &&
    (event.type === 'pointerdown' ||
      (event.type === 'keydown' && !NON_ACTION_KEYS.includes(event.key)));
  if (heldEvents.length && event && event.type === 'click') {
    const origin = event.composedPath()[0];
    for (let i = heldEvents.length - 1; i >= 0; i--) {
      const held = heldEvents[i];
      if (
        held.labelElm &&
        !held.forwarded &&
        held.labelElm.control === origin &&
        held.isTrusted === event.isTrusted
      ) {
        held.forwarded = true;
        break;
      }
    }
  }
  if (startsActivation) {
    releaseHeldEvents();
    activation = newActivation(
      event.composedPath ? event.composedPath()[0] : event.target
    );
    recentActivations.push(activation);
    if (recentActivations.length > MAX_RECENT_ACTIVATIONS) {
      recentActivations.shift();
    }
  }
  // "change" is trusted even when a page script's click caused it
  if (event && event.isTrusted && USER_INPUT_TYPES.includes(event.type)) {
    markInTask(activation);
  }
  if (event && event.type === 'pointerdown') {
    return;
  }
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
      emit(callback, { messageType: 'events', event: { ...fillEvent } });
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
      emit(callback, { messageType: 'events', event: { ...canvasFillEvent } });
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
      // the "change" records it; untrusted clicks come from page scripts
      if (event.isTrusted) {
        const { labels } = activation;
        const forwardedBy = [...labels].find((label) => label.control === tgt);
        labels.delete(forwardedBy);
        activation.toggleClicks.set(tgt, forwardedBy ? 'label' : 'user');
      } else {
        activation.toggleClicks.delete(tgt);
        noteHandlerClick(causeOf(tgt));
      }
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
    // A page script's click (e.g. a handler calling button.click()) is an
    // effect of an activation, like a toggle's "change": replaying its
    // recorded action runs that script again.
    if (!event.isTrusted) {
      const cause = causeOf(tgt);
      if (cause.recordedAction) {
        noteHandlerClick(cause);
        return;
      }
    }
    let labelClick = null;
    let hoverStep = null;
    // the element "css" selects, which replay offsets refer to
    let clickElm = bestElm || tgt;
    const parentLabel = tgt.closest && tgt.closest('label');
    if (parentLabel) {
      // Clicks on interactive descendants (links, buttons, other fields) are
      // not forwarded by the browser to the labeled control.
      const interactiveHit = tgt.closest('a, button, input, select, textarea');
      const forwardsToControl =
        !interactiveHit || !parentLabel.contains(interactiveHit);
      const control = parentLabel.control;
      const labelsToggle =
        control &&
        control.nodeName.toLowerCase() === 'input' &&
        (control.type === 'checkbox' || control.type === 'radio');
      // the guess above can be wrong (an <a> without href is forwarded), so
      // the forwarded click itself must still be attributed to the label
      const { labels } = activation;
      labels.add(parentLabel);
      // a canceled click or disabled control is never forwarded
      setTimeout(() => labels.delete(parentLabel), 0);
      if (forwardsToControl && labelsToggle) {
        // Record the click instead of the control's "change": setting
        // .checked on replay bypasses framework handlers (e.g. React). It's
        // recorded on the element actually clicked, not a promoted ancestor,
        // as handlers can depend on event.target (e.g. canceling clicks on the
        // label itself).
        const clicked = getRecordedTarget(tgt, doc);
        if (clicked) {
          clickElm = tgt;
          oEventBase = {
            ...oEventBase,
            css: clicked.css,
            xpath: isInShadowRoot ? oEventBase.xpath : clicked.xpath,
          };
        }
        // Content added to the label later (e.g. an icon created on hover)
        // may be missing on a fresh page: hover its stable ancestor first,
        // and fall back to the label, by XPath, when the label forwarded the
        // click. The replay can't hover inside a shadow root, so there it's
        // recorded on the label.
        const labelTarget =
          isLateLabelContent(tgt, parentLabel) &&
          getRecordedTarget(parentLabel, doc);
        if (labelTarget && isInShadowRoot) {
          labelClick = {
            labelElm: parentLabel,
            whenForwarded: {
              css: labelTarget.css,
              value: (parentLabel.textContent || '')
                .trim()
                .substr(0, 20)
                .replace(/\n/gi, ''),
            },
          };
        } else if (labelTarget) {
          labelClick = {
            labelElm: parentLabel,
            whenForwarded: { xpath: labelTarget.xpath },
          };
          const hoverElm = getHoverTarget(tgt, parentLabel);
          const hovered = getRecordedTarget(hoverElm, doc);
          if (hovered) {
            hoverStep = {
              timestamp: oEventBase.timestamp,
              css: hovered.css,
              xpath: hovered.xpath,
              type: 'mouseover',
              value: (hoverElm.textContent || '')
                .trim()
                .substr(0, 20)
                .replace(/\n/gi, ''),
              frame: ifrSelector,
            };
          }
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
      value: (tgt.value || tgt.textContent || '')
        .trim()
        .substr(0, 20)
        .replace(/\n/gi, ''),
      frame: ifrSelector,
    };
    if (
      typeStr === 'click' &&
      callback &&
      (labelClick || (event.isTrusted && !isInShadowRoot))
    ) {
      if (hoverStep) {
        emit(callback, { messageType: 'events', event: hoverStep });
      }
      markRecordedAction(event, typeStr);
      const replayableAsInput = event.isTrusted && !isInShadowRoot;
      let coords = null;
      // keyboard clicks have no pointer position: replay uses the center
      if (replayableAsInput && event.detail > 0) {
        const rect = clickElm.getBoundingClientRect();
        coords = {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
          width: rect.width,
          height: rect.height,
        };
      }
      heldEvents.push({
        ...labelClick,
        activation,
        coords,
        replayableAsInput,
        isTrusted: event.isTrusted,
        callback,
        payload: { messageType: 'events', event: oEventToSend },
      });
      // the label forwards the click, and synchronous handlers click other
      // elements, before this task ends
      setTimeout(releaseHeldEvents, 0);
      return;
    }

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
        emit(callback, {
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
      // the typed value is recorded as a fill
      markRecordedAction(event, 'fill_value');
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
    } else if (pendingCanvasInput && !isToggleInput) {
      markRecordedAction(event, 'bfill_value');
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
        emit(callback, {
          messageType: 'events',
          event: { ...canvasFillEvent },
        });
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
        emit(callback, {
          messageType: 'events',
          event: { ...canvasReturnEvent },
        });
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
      if (isToggleInput) {
        const activatedBy = activation.toggleClicks.get(tgt);
        activation.toggleClicks.delete(tgt);
        // the recorded label click replays it
        if (activatedBy === 'label') {
          return;
        }
        if (!activatedBy && causeOf(tgt).recordedAction) {
          return;
        }
        // replaying the user's own toggle clicks it or dispatches its "change",
        // which runs the handlers that caused anything else
        if (activatedBy === 'user') {
          activation.recordedAction = true;
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
    markRecordedAction(event, oEventToSend.type);
    emit(callback, {
      messageType: 'events',
      event: { ...oEventToSend },
    });
  }
  if (hasKeyReturn && callback) {
    markRecordedAction(event, 'press_key');
    const oReturnEvent = {
      ...oEventBase,
      timestamp: new Date().getTime(),
      type: 'press_key',
      value: 13,
      frame: ifrSelector,
    };
    emit(callback, {
      messageType: 'events',
      event: { ...oReturnEvent },
    });
  }
}
