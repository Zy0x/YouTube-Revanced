import fs from 'node:fs';

let content = fs.readFileSync('web/index.html', 'utf8');

// 1. Collapse SVGs to single line
content = content.replace(/<svg\b[^>]*>([\s\S]*?)<\/svg>/g, (m) => {
  return m.replace(/\s*\n\s*/g, ' ').replace(/>\s+</g, '><');
});

// 2. Collapse self-closing or empty elements
content = content.replace(/<(path|circle|polygon|polyline|line|rect)([^>]*)\s*>\s*<\/\1>/g, '<$1$2/>');

// 3. Repeatedly collapse leaf/inline tags containing text or other inline tags
const leafTags = ['span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'button', 'label', 'a', 'td', 'th', 'title', 'strong', 'em', 'code', 'small', 'li', 'option', 'textarea'];
for (let pass = 0; pass < 5; pass++) {
  for (const tag of leafTags) {
    const re = new RegExp('<' + tag + '([^>]*)>([\\s\\S]*?)<\\/' + tag + '>', 'gi');
    content = content.replace(re, (match, attrs, inner) => {
      // If inner has no block-level tags (div, section, header, main, nav, ul, ol, table)
      if (!/<(div|section|header|main|nav|ul|ol|table|form|fieldset)\b/i.test(inner)) {
        const collapsed = inner.replace(/\s*\n\s*/g, ' ').trim();
        return `<${tag}${attrs}>${collapsed}</${tag}>`;
      }
      return match;
    });
  }
}

// 4. Collapse simple wrappers: <div class="..."> <span/p/button>... </div>
content = content.replace(/<div([^>]*)>\s*(<(?:span|p|button|label|h[1-6]|svg)[^>]*>[\s\S]*?<\/(?:span|p|button|label|h[1-6]|svg)>)\s*<\/div>/gi, (m, attrs, inner) => {
  if (!inner.includes('\n')) {
    return `<div${attrs}>${inner}</div>`;
  }
  return m;
});

// Additional pass: collapse inline SVG containers, cards, and modal rows
content = content.replace(/<(div|li|header|nav|section|tr|td|th)([^>]*)>\s*([^<\n]+)\s*<\/\1>/gi, '<$1$2>$3</$1>');

// Collapse elements like:
// <div class="...">
//   <span ...>...</span>
// </div>
content = content.replace(/<(div|li|span|p)([^>]*)>\s*(<[a-z0-9_-]+[^>]*>.*?<\/[a-z0-9_-]+>)\s*<\/\1>/gi, (m, tag, attrs, child) => {
  if (!child.includes('\n')) {
    return `<${tag}${attrs}>${child}</${tag}>`;
  }
  return m;
});

// Collapse pairs of elements inside small divs (e.g. icon + text, label + value)
content = content.replace(/<(div|li|span)([^>]*)>\s*(<[a-z0-9_-]+[^>]*>.*?<\/[a-z0-9_-]+>)\s*(<[a-z0-9_-]+[^>]*>.*?<\/[a-z0-9_-]+>)\s*<\/\1>/gi, (m, tag, attrs, c1, c2) => {
  if (!c1.includes('\n') && !c2.includes('\n')) {
    return `<${tag}${attrs}>${c1} ${c2}</${tag}>`;
  }
  return m;
});

// Repeat leaf tag collapse
for (let pass = 0; pass < 3; pass++) {
  content = content.replace(/<(div|li|span)([^>]*)>\s*(<[a-z0-9_-]+[^>]*>.*?<\/[a-z0-9_-]+>)\s*<\/\1>/gi, (m, tag, attrs, child) => {
    if (!child.includes('\n')) {
      return `<${tag}${attrs}>${child}</${tag}>`;
    }
    return m;
  });
}

// 5. Remove blank lines and trim
let lines = content.split('\n').map(l => l.trimEnd()).filter(l => l.trim().length > 0);
console.log('Resulting lines:', lines.length);
fs.writeFileSync('web/index.compact.html', lines.join('\n') + '\n');


