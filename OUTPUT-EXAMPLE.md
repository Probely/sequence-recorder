# Output Example

JSON example containing all possible step types produced by the sequence recorder.

```json
[
  {
    "timestamp": 1718723999000,
    "type": "goto",
    "url": "https://example.com/login",
    "windowWidth": 1280,
    "windowHeight": 720
  },
  {
    "timestamp": 1718724000000,
    "css": "#login-button",
    "xpath": "/html/body/div/button",
    "type": "click",
    "value": "Login",
    "frame": ""
  },
  {
    "timestamp": 1718724001000,
    "css": "canvas.game-surface",
    "xpath": "/html/body/div/canvas",
    "type": "bclick",
    "value": "",
    "frame": "",
    "coords": {
      "x": 150,
      "y": 200,
      "width": 800,
      "height": 600
    }
  },
  {
    "timestamp": 1718724002000,
    "css": "canvas.shadow-canvas",
    "xpath": "/html/node/shadow",
    "type": "bclick",
    "value": "",
    "frame": "",
    "coords": {
      "x": 100,
      "y": 50,
      "width": 640,
      "height": 480
    },
    "shadow_host_css": "#my-web-component"
  },
  {
    "timestamp": 1718724003000,
    "css": ".row-item",
    "xpath": "/html/body/div/table/tr[2]",
    "type": "dblclick",
    "value": "Edit row",
    "frame": ""
  },
  {
    "timestamp": 1718724005000,
    "css": ".nav-menu > li:nth-child(2)",
    "xpath": "/html/body/nav/ul/li[2]",
    "type": "mouseover",
    "value": "Products",
    "frame": ""
  },
  {
    "timestamp": 1718724006000,
    "css": "#username",
    "xpath": "/html/body/div/form/input[1]",
    "type": "fill_value",
    "value": "user@example.com",
    "frame": ""
  },
  {
    "timestamp": 1718724007000,
    "css": ".search-input",
    "xpath": "/html/body/div/form/input[2]",
    "type": "bfill_value",
    "value": "search query",
    "frame": ""
  },
  {
    "timestamp": 1718724008000,
    "css": "#username",
    "xpath": "/html/body/div/form/input[1]",
    "type": "press_key",
    "value": 13,
    "frame": ""
  },
  {
    "timestamp": 1718724009000,
    "css": "#accept-terms",
    "xpath": "/html/body/div/form/input[3]",
    "type": "change",
    "subtype": "check",
    "checked": true,
    "frame": ""
  },
  {
    "timestamp": 1718724010000,
    "css": "#country",
    "xpath": "/html/body/div/form/select[1]",
    "type": "change",
    "subtype": "select",
    "selected": 2,
    "value": "us",
    "frame": ""
  },
  {
    "timestamp": 1718724011000,
    "css": "#tags",
    "xpath": "/html/body/div/form/select[2]",
    "type": "change",
    "subtype": "select_multi",
    "selected": [true, false, true, false],
    "value": "tag-a",
    "frame": ""
  },
  {
    "timestamp": 1718724012000,
    "css": "#iframe-btn",
    "xpath": "/html/body/div/button",
    "type": "click",
    "value": "Submit",
    "frame": "#content-iframe"
  },
  {
    "timestamp": 1718724013000,
    "css": ".nested-btn",
    "xpath": "/html/body/div/button",
    "type": "click",
    "value": "Confirm",
    "frame": "#outer-iframe >>> #inner-iframe"
  }
]
```

## Step Types Reference

| Type | Description |
|------|-------------|
| `goto` | Navigate to a URL; first step in every recording |
| `click` | Standard left click on an element |
| `bclick` | Click on a canvas surface, includes `coords` (`x`, `y`, `width`, `height`). May include `shadow_host_css` when targeting a canvas inside a shadow DOM |
| `dblclick` | Double click on an element |
| `mouseover` | Hover over an element (debounced at 500ms) |
| `fill_value` | Value entered into an `<input>` or `<textarea>` (captured on blur or Enter) |
| `bfill_value` | Buffered fill — keystroke-reconstructed value when the DOM `.value` is empty (e.g. virtual keyboards, frameworks that clear the field) |
| `press_key` | Key press, currently only Enter (`value: 13`), emitted after a `fill_value`/`bfill_value` on Enter |
| `change` (`check`) | Checkbox or radio button toggled; includes `checked` boolean |
| `change` (`select`) | Single `<select>` dropdown changed; includes `selected` index and `value` |
| `change` (`select_multi`) | Multi-select `<select>` changed; includes `selected` boolean array and `value` |

## Common Fields

| Field | Description |
|-------|-------------|
| `timestamp` | Unix timestamp in milliseconds |
| `css` | CSS selector for the target element |
| `xpath` | XPath selector for the target element |
| `type` | Event type identifier |
| `value` | Element value or trimmed text content (max 20 chars for clicks) |
| `frame` | CSS selector of the containing iframe, empty string if top-level. For nested iframes, selectors are joined with ` >>> ` from outermost to innermost (e.g. `#outer-iframe >>> #inner-iframe`) |
