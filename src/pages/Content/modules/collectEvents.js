import getNodeSelector from './getNodeSelector';
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

export function interceptEvents(event, doc, ifrSelector, callback) {
  let hasKeyReturn = false;
  const tgt = event.target;
  const type = event.type;
  let nodeName = null;
  let nodeType = null;
  if (tgt && tgt.getAttribute) {
    nodeName = tgt.nodeName.toLowerCase();
    nodeType = tgt.getAttribute('type');
  } else {
    return;
  }
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
  const selector = getNodeSelector(tgt, {
    root: doc,
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
    seedMinLength: 3,
    optimizedMinLength: 3,
  });
  if (selector && selector.toLowerCase() === 'html') {
    return;
  }
  const xpath = getXPath(tgt, doc);

  let oEventBase = {
    timestamp: new Date().getTime(),
    css: selector || tgt,
    xpath: xpath,
  };

  let oEventToSend = {};

  if (type === 'click') {
    lastNodes.click = tgt;

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
    if (
      nodeName === 'input' &&
      (nodeType === 'checkbox' || nodeType === 'radio')
    ) {
      return;
    }
    if (nodeName === 'label') {
      const forAttr = tgt.getAttribute('for');
      if (forAttr && document.getElementById(forAttr)) {
        // can be ignored... will fire checkbox
        return;
      }
    }
    oEventToSend = {
      ...oEventBase,
      type: 'click',
      value: (tgt.value || tgt.textContent || '')
        .substr(0, 20)
        .replace(/\n/gi, ''),
      frame: ifrSelector,
    };
  } else if (type === 'dblclick') {
    lastNodes.dblclick = tgt;
    oEventToSend = {
      ...oEventBase,
      type: 'dblclick',
      value: (tgt.value || tgt.textContent || '')
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
    if (['input', 'textarea'].indexOf(nodeName) > -1) {
      oNodes[tgt] = tgt.value;
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
      oEventToSend = {
        ...oEventBase,
        type: 'fill_value',
        value: tgt.value,
        frame: ifrSelector,
      };
    }
  } else if (type === 'blur') {
    lastNodes.blur = tgt;
    if (['input', 'textarea'].indexOf(nodeName) > -1) {
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
      oEventToSend = {
        ...oEventBase,
        type: 'fill_value',
        value: tgt.value,
        frame: ifrSelector,
      };
    }
  } else if (type === 'change') {
    lastNodes.change = tgt;
    if (nodeName === 'input') {
      if (nodeType === 'checkbox' || nodeType === 'radio') {
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
