// /frontend/src/app/tools/code-graph/lib/highlight.ts
'use client';

import { createHighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';

// Fine-grained, tree-shakeable imports (Shiki v3)
import darkPlus from '@shikijs/themes/dark-plus';
import javascript from '@shikijs/langs/javascript';
import python from '@shikijs/langs/python';
import html from '@shikijs/langs/html';
import css from '@shikijs/langs/css';
import c from '@shikijs/langs/c';

let highlighterPromise: Promise<any> | null = null;

export async function highlightVSCodeHTML(code: string, lang: string): Promise<string> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighterCore({
      themes: [darkPlus],                            // VS Code Dark+
      langs: [javascript, python, html, css, c],     // add more if you support more
      engine: createJavaScriptRegexEngine(),         // no WASM needed in the browser
    });
  }
  const highlighter = await highlighterPromise;
  return highlighter.codeToHtml(code, { lang, theme: 'dark-plus' });
}
