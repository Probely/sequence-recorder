function getBestElement(node, doc) {
  let nodeName = null;
  try {
    nodeName =
      node.nodeName && typeof node.nodeName === 'string'
        ? node.nodeName.toLowerCase()
        : null;
    if (!nodeName) {
      return node;
    }
    // check if a wanted deeper one, return node itself
    if (
      [
        'input',
        'button',
        'a',
        'textarea',
        'select',
        'option',
        'progress',
      ].includes(nodeName)
    ) {
      return node;
    }
    // check if inside a "button", "a". Return these instead of original
    const buttonOrLinkTag = node.closest('button,a');
    if (buttonOrLinkTag) {
      return buttonOrLinkTag;
    }
    // check if inside a "svg". Return "svg" instead of original
    const svgTag = node.closest('svg');
    if (svgTag) {
      // return svgTag;
      node = svgTag;
    }
    // check if node or parent has some "data-test" attibute
    const dataTestAttrs = [
      'data-test-id',
      'data-testid',
      'data-test',
      'data-cy',
    ];
    if (
      node.matches(dataTestAttrs.map((dataAttr) => `[${dataAttr}]`).join(','))
    ) {
      return node;
    } else {
      // check parent
      if (
        node.parentNode.matches(
          dataTestAttrs.map((dataAttr) => `[${dataAttr}]`).join(',')
        )
      ) {
        return node.parentNode;
      }
    }
  } catch (ex) {
    // ignore
  }
  return node;
}

function getCustomSelector(node, doc) {
  let selector = '';
  let nodeName = null;
  let ignoreAriaLabel = false;
  try {
    nodeName =
      node.nodeName && typeof node.nodeName === 'string'
        ? node.nodeName.toLowerCase()
        : null;
    if (!nodeName) {
      return null;
    }
    selector = `${nodeName}`;
    if (node.getAttribute('id')) {
      selector = `${selector}#${CSS.escape(node.getAttribute('id'))}`;
      ignoreAriaLabel = true;
    }
    const dataTestAttrs = [
      'data-test-id',
      'data-testid',
      'data-test',
      'data-cy',
    ];
    if (
      node.matches(dataTestAttrs.map((dataAttr) => `[${dataAttr}]`).join(','))
    ) {
      for (const testAttr of dataTestAttrs) {
        const testAttrValue = node.getAttribute(testAttr);
        if (testAttrValue) {
          selector = `${selector}[${testAttr}="${CSS.escape(testAttrValue)}"]`;
          break;
        }
      }
    }
    if (
      ['input', 'button', 'textarea', 'select', 'option'].includes(nodeName)
    ) {
      if (node.getAttribute('type')) {
        selector = `${selector}[type="${CSS.escape(
          node.getAttribute('type')
        )}"]`;
      }
      if (node.getAttribute('name')) {
        selector = `${selector}[name="${CSS.escape(
          node.getAttribute('name')
        )}"]`;
      }
      const formClosest = node.closest('form');
      if (formClosest) {
        let form = 'form';
        if (formClosest.getAttribute('id')) {
          form = `${form}#${CSS.escape(formClosest.getAttribute('id'))}`;
        }
        selector = `${form} ${selector}`;
      }
    }
    // check if there's a "aria-label" and is unique
    const ariaLabelValue = node.getAttribute('aria-label');
    if (ariaLabelValue && !ignoreAriaLabel) {
      selector = `${selector}[aria-label="${CSS.escape(ariaLabelValue)}"]`;
    }
    // check if selector is the only one in the page
    if (selector) {
      const docBody = node.closest('body');
      if (docBody) {
        try {
          const foundElms = docBody.querySelectorAll(selector);
          if (foundElms.length !== 1) {
            selector = '';
          }
        } catch (ex2) {
          selector = '';
        }
      }
    }
  } catch (ex) {
    // ignore
  }
  return selector;
}
