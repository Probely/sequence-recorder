export default function getBestElement(node, doc) {
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
      node = svgTag;
    }
    // check if node or parent has some "data-test" attribute
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
