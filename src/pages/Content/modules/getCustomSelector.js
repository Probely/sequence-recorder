export const dataTestAttrs = [
  'data-test-id',
  'data-testid',
  'data-test',
  'data-cy',
  'data-qa',
  'data-automation-id',
];
const MAX_TEST_ANCESTOR_DEPTH = 10;
// CSS-in-JS generated names (Emotion/react-select "css-1pahdxg-control",
// styled-components "sc-...", JSS "jss12") change with component state and
// between builds, so they can't be replayed reliably.
const generatedClassPattern = /^(css-[a-z0-9]+|sc-[a-z0-9]+|jss\d+)(-|$)/i;

export function isStableClassName(name) {
  return (
    !name.includes('focus') &&
    !name.includes('highlight') &&
    !/^[0-9]/.test(name) &&
    !generatedClassPattern.test(name)
  );
}

export function getTestAttrSelector(node) {
  for (const attr of dataTestAttrs) {
    const value = node.getAttribute(attr);
    if (value) {
      return `[${attr}="${CSS.escape(value)}"]`;
    }
  }
  return '';
}

export function getTestAncestor(node) {
  let parent = node.parentElement;
  for (let i = 0; parent && i < MAX_TEST_ANCESTOR_DEPTH; i++) {
    if (getTestAttrSelector(parent)) {
      return parent;
    }
    parent = parent.parentElement;
  }
  return null;
}

function getUniqueScope(node) {
  const rootNode = node.getRootNode();
  // <frameset> documents have no <body>
  return (
    node.closest('body') ||
    (rootNode.nodeType === Node.DOCUMENT_NODE ? rootNode : null)
  );
}

function getFrameSrcSelector(node, nodeName) {
  const src = (node.getAttribute('src') || '').trim();
  if (!src || /^(about|javascript|data|blob):/i.test(src)) {
    return null;
  }
  // query strings and hashes often carry session tokens or cache busters
  const path = src.split(/[?#]/)[0];
  if (!path) {
    return null;
  }
  const op = path === src ? '=' : '^=';
  return `${nodeName}[src${op}"${CSS.escape(path)}"]`;
}

// Tries one distinguishing attribute at a time, most stable first, and
// returns the first selector that matches only this frame.
function getFrameSelector(node, nodeName) {
  const scope = getUniqueScope(node);
  if (!scope) {
    return '';
  }
  const candidates = [];
  const id = node.getAttribute('id');
  if (id) {
    candidates.push(`${nodeName}#${CSS.escape(id)}`);
  }
  for (const attr of [...dataTestAttrs, 'name', 'title', 'aria-label']) {
    const value = node.getAttribute(attr);
    if (value) {
      candidates.push(`${nodeName}[${attr}="${CSS.escape(value)}"]`);
    }
  }
  const srcSelector = getFrameSrcSelector(node, nodeName);
  if (srcSelector) {
    candidates.push(srcSelector);
  }
  const testAncestor = getTestAncestor(node);
  const prefix = testAncestor ? `${getTestAttrSelector(testAncestor)} ` : '';
  for (const candidate of candidates.map((c) => `${prefix}${c}`)) {
    try {
      const foundElms = scope.querySelectorAll(candidate);
      if (foundElms.length === 1 && foundElms[0] === node) {
        return candidate;
      }
    } catch (ex) {
      // ignore
    }
  }
  return '';
}

export default function getCustomSelector(node, doc) {
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
    if (nodeName === 'frame' || nodeName === 'iframe') {
      return getFrameSelector(node, nodeName);
    }
    selector = `${nodeName}`;
    if (node.getAttribute('id')) {
      selector = `${selector}#${CSS.escape(node.getAttribute('id'))}`;
      ignoreAriaLabel = true;
    }
    selector = `${selector}${getTestAttrSelector(node)}`;
    let formClosest = null;
    let formSelector = '';
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
      formClosest = node.closest('form');
      if (formClosest) {
        formSelector = 'form';
        if (formClosest.getAttribute('id')) {
          formSelector = `${formSelector}#${CSS.escape(
            formClosest.getAttribute('id')
          )}`;
        }
      }
    }
    let prefix = formSelector;
    const testAncestor = getTestAncestor(node);
    if (testAncestor) {
      const ancestorSelector = getTestAttrSelector(testAncestor);
      if (testAncestor === formClosest) {
        prefix = `${formSelector}${ancestorSelector}`;
      } else if (formClosest && formClosest.contains(testAncestor)) {
        prefix = `${formSelector} ${ancestorSelector}`;
      } else {
        prefix = formSelector
          ? `${ancestorSelector} ${formSelector}`
          : ancestorSelector;
      }
    }
    if (prefix) {
      selector = `${prefix} ${selector}`;
    }
    // check if there's a "aria-label" and is unique
    const ariaLabelValue = node.getAttribute('aria-label');
    if (ariaLabelValue && !ignoreAriaLabel) {
      selector = `${selector}[aria-label="${CSS.escape(ariaLabelValue)}"]`;
    }
    // check if selector is the only one in the page
    if (selector) {
      const scope = getUniqueScope(node);
      if (scope) {
        try {
          const foundElms = scope.querySelectorAll(selector);
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
