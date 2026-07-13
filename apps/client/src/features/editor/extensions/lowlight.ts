import { createLowlight } from "lowlight";
import plaintext from "highlight.js/lib/languages/plaintext";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import css from "highlight.js/lib/languages/css";
import json from "highlight.js/lib/languages/json";
import bash from "highlight.js/lib/languages/bash";
import shell from "highlight.js/lib/languages/shell";
import python from "highlight.js/lib/languages/python";
import java from "highlight.js/lib/languages/java";
import sql from "highlight.js/lib/languages/sql";
import yaml from "highlight.js/lib/languages/yaml";
import markdown from "highlight.js/lib/languages/markdown";
import go from "highlight.js/lib/languages/go";

// Core set stays static: instant highlight and language auto-detection for
// the languages that cover the vast majority of code blocks. Everything else
// is fetched on demand via ensureCodeLanguage().
export const lowlight = createLowlight({
  plaintext,
  javascript,
  typescript,
  xml,
  css,
  json,
  bash,
  shell,
  python,
  java,
  sql,
  yaml,
  markdown,
  go,
});
lowlight.register("mermaid", plaintext);

type LanguageLoader = () => Promise<{ default: any }>;

const lazyLanguages: Record<string, LanguageLoader> = {
  arduino: () => import("highlight.js/lib/languages/arduino"),
  c: () => import("highlight.js/lib/languages/c"),
  cpp: () => import("highlight.js/lib/languages/cpp"),
  csharp: () => import("highlight.js/lib/languages/csharp"),
  diff: () => import("highlight.js/lib/languages/diff"),
  graphql: () => import("highlight.js/lib/languages/graphql"),
  ini: () => import("highlight.js/lib/languages/ini"),
  kotlin: () => import("highlight.js/lib/languages/kotlin"),
  less: () => import("highlight.js/lib/languages/less"),
  lua: () => import("highlight.js/lib/languages/lua"),
  makefile: () => import("highlight.js/lib/languages/makefile"),
  objectivec: () => import("highlight.js/lib/languages/objectivec"),
  perl: () => import("highlight.js/lib/languages/perl"),
  php: () => import("highlight.js/lib/languages/php"),
  "php-template": () => import("highlight.js/lib/languages/php-template"),
  "python-repl": () => import("highlight.js/lib/languages/python-repl"),
  r: () => import("highlight.js/lib/languages/r"),
  ruby: () => import("highlight.js/lib/languages/ruby"),
  rust: () => import("highlight.js/lib/languages/rust"),
  scss: () => import("highlight.js/lib/languages/scss"),
  swift: () => import("highlight.js/lib/languages/swift"),
  vbnet: () => import("highlight.js/lib/languages/vbnet"),
  wasm: () => import("highlight.js/lib/languages/wasm"),
  powershell: () => import("highlight.js/lib/languages/powershell"),
  erlang: () => import("highlight.js/lib/languages/erlang"),
  elixir: () => import("highlight.js/lib/languages/elixir"),
  dockerfile: () => import("highlight.js/lib/languages/dockerfile"),
  clojure: () => import("highlight.js/lib/languages/clojure"),
  fortran: () => import("highlight.js/lib/languages/fortran"),
  haskell: () => import("highlight.js/lib/languages/haskell"),
  scala: () => import("highlight.js/lib/languages/scala"),
  abap: () => import("highlightjs-sap-abap") as Promise<{ default: any }>,
};

// Full list for the language picker: static + lazily loadable.
export const supportedCodeLanguages: string[] = [
  ...lowlight.listLanguages(),
  ...Object.keys(lazyLanguages),
].sort();

const pending = new Map<string, Promise<boolean>>();

/**
 * Loads and registers a language on demand.
 * Resolves true when a new language was registered (callers should then
 * refresh code block decorations), false otherwise.
 */
export function ensureCodeLanguage(language: string): Promise<boolean> {
  if (!language || lowlight.registered(language)) {
    return Promise.resolve(false);
  }
  const loader = lazyLanguages[language];
  if (!loader) {
    return Promise.resolve(false);
  }
  let task = pending.get(language);
  if (!task) {
    task = loader()
      .then((mod) => {
        if (!lowlight.registered(language)) {
          lowlight.register(language, mod.default);
        }
        return true;
      })
      .catch(() => {
        pending.delete(language);
        return false;
      });
    pending.set(language, task);
  }
  return task;
}
