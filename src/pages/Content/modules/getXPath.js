export default function getXPath(node, doc) {
  let elm = node;
  let path = [];
  let result;
  while (elm) {
    let pos = 0;
    let sibling = elm.previousElementSibling;
    while (sibling) {
      if (sibling.nodeName === elm.nodeName) {
        pos++;
      }
      sibling = sibling.previousElementSibling;
    }
    let exp = elm.nodeName.toLowerCase();
    if (pos > 0) {
      exp = exp + '[' + (pos + 1) + ']';
    }
    if (elm !== doc) {
      path.unshift(exp);
    }
    elm = elm.parentNode;
  }
  result = '/' + path.join('/');
  if (executeXPath(result, doc) === node) {
    return result;
  }
}

function executeXPath(exp, doc) {
  const iterator = doc.evaluate(exp, doc, null, XPathResult.ANY_TYPE, null);
  const elm = iterator.iterateNext();
  return elm;
}
