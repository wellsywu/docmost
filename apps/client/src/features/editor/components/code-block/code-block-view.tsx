import { NodeViewContent, NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import {
  ActionIcon,
  Button,
  Combobox,
  Menu,
  Select,
  Tooltip,
  UnstyledButton,
  useCombobox,
} from "@mantine/core";
import { CopyButton } from "@/components/common/copy-button";
import { useEffect, useState } from "react";
import {
  IconCheck,
  IconChevronDown,
  IconCopy,
  IconDots,
} from "@tabler/icons-react";
import classes from "./code-block.module.css";
import React from "react";
import { Suspense } from "react";
import { useTranslation } from "react-i18next";
import {
  ensureCodeLanguage,
  supportedCodeLanguages,
} from "@/features/editor/extensions/lowlight.ts";
import { useCodeSourceVisible } from "@/features/editor/hooks/use-code-source-visible.ts";

const MermaidView = React.lazy(
  () => import("@/features/editor/components/code-block/mermaid-view.tsx"),
);

// Values must match the `.codeBlock[data-code-theme=...]` palettes in
// reading-themes.css.
const CODE_THEMES = [
  { value: "github", label: "GitHub" },
  { value: "dracula", label: "Dracula" },
  { value: "cursor", label: "Cursor" },
  { value: "copilot", label: "Copilot" },
  { value: "tokyo", label: "Tokyo Night" },
  { value: "notion", label: "Notion" },
  { value: "sepia", label: "Sepia" },
  { value: "contrast", label: "Contrast" },
  { value: "feishu", label: "Feishu" },
];

const CODE_FONT_SIZES = [12, 13, 14, 16];

export default function CodeBlockView(props: NodeViewProps) {
  const { t } = useTranslation();
  const { node, updateAttributes, editor, getPos } = props;
  const { language, theme, fontSize } = node.attrs;
  const [languageValue, setLanguageValue] = useState<string | null>(
    language || null,
  );
  const showSource = useCodeSourceVisible(editor, getPos(), node.nodeSize);
  const [collapsed, setCollapsed] = useState(false);
  const [languageSearch, setLanguageSearch] = useState("");
  const languageCombobox = useCombobox({
    onDropdownOpen: () => languageCombobox.focusSearchInput(),
    onDropdownClose: () => {
      languageCombobox.resetSelectedOption();
      setLanguageSearch("");
    },
  });

  function changeLanguage(language: string | null) {
    setLanguageValue(language);
    updateAttributes({
      language: language,
    });
  }

  useEffect(() => {
    if (!language) return;
    ensureCodeLanguage(language).then((registered) => {
      if (registered && !editor.isDestroyed) {
        editor.view.dispatch(editor.state.tr.setMeta("lowlightRefresh", true));
      }
    });
  }, [language, editor]);

  const languages: string[] = supportedCodeLanguages;
  const filteredLanguages = ["auto", ...languages].filter((item) =>
    item.toLowerCase().includes(languageSearch.toLowerCase().trim()),
  );

  const lineCount = node.textContent.split("\n").length;
  const hideCode =
    language === "mermaid" && !showSource && node.textContent.length > 0;

  return (
    <NodeViewWrapper
      className="codeBlock"
      data-code-theme={theme || undefined}
      style={
        fontSize
          ? ({ "--code-font-size": `${fontSize}px` } as React.CSSProperties)
          : undefined
      }
    >
      <div className={classes.header} contentEditable={false}>
        <Tooltip label={collapsed ? t("Expand") : t("Collapse")} withArrow>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            className={classes.collapseButton}
            data-collapsed={collapsed || undefined}
            onClick={() => setCollapsed((value) => !value)}
          >
            <IconChevronDown size={14} />
          </ActionIcon>
        </Tooltip>

        <div className={classes.spacer} />

        {/* Plain dropdown trigger (not a text input) with a search field
         * inside the dropdown, so picking a language is select-only while
         * the long list stays filterable. Available in reading mode too,
         * like the other header controls. */}
        <Combobox
          store={languageCombobox}
          width={180}
          position="bottom-end"
          withinPortal
          onOptionSubmit={(value) => {
            changeLanguage(value === "auto" ? null : value);
            languageCombobox.closeDropdown();
          }}
        >
          <Combobox.Target>
            <UnstyledButton
              className={classes.languageButton}
              onClick={() => languageCombobox.toggleDropdown()}
            >
              <span>{languageValue || "auto"}</span>
              <IconChevronDown size={12} />
            </UnstyledButton>
          </Combobox.Target>
          <Combobox.Dropdown>
            <Combobox.Search
              value={languageSearch}
              onChange={(event) => setLanguageSearch(event.currentTarget.value)}
              placeholder={t("Search...")}
            />
            <Combobox.Options mah={220} style={{ overflowY: "auto" }}>
              {filteredLanguages.length > 0 ? (
                filteredLanguages.map((item) => (
                  <Combobox.Option value={item} key={item}>
                    <div className={classes.languageOption}>
                      <span>{item}</span>
                      {(languageValue || "auto") === item && (
                        <IconCheck size={14} />
                      )}
                    </div>
                  </Combobox.Option>
                ))
              ) : (
                <Combobox.Empty>{t("No results found")}</Combobox.Empty>
              )}
            </Combobox.Options>
          </Combobox.Dropdown>
        </Combobox>

        {/* Presentation settings stay available in reading mode too — they
         * tweak how the block renders, not its content. */}
        <Select
          checkIconPosition="right"
          data={[{ value: "default", label: t("Default") }, ...CODE_THEMES]}
          value={theme || "default"}
          onChange={(value) =>
            updateAttributes({
              theme: !value || value === "default" ? null : value,
            })
          }
          variant="unstyled"
          style={{ maxWidth: "120px" }}
          classNames={{ input: classes.selectInput }}
          comboboxProps={{ withinPortal: true }}
        />

        <div className={classes.headerDivider} />

        <CopyButton value={node?.textContent} timeout={2000}>
          {({ copied, copy }) => (
            <Button
              variant="subtle"
              color={copied ? "teal" : "gray"}
              size="compact-xs"
              className={classes.actionButton}
              leftSection={
                copied ? <IconCheck size={14} /> : <IconCopy size={14} />
              }
              onClick={copy}
            >
              {copied ? t("Copied") : t("Copy code")}
            </Button>
          )}
        </CopyButton>

        <Menu withinPortal position="bottom-end" shadow="md">
          <Menu.Target>
            <ActionIcon variant="subtle" color="gray" size="sm">
              <IconDots size={14} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Label>{t("Font size")}</Menu.Label>
            <Menu.Item
              rightSection={!fontSize && <IconCheck size={14} />}
              onClick={() => updateAttributes({ fontSize: null })}
            >
              {t("Default")}
            </Menu.Item>
            {CODE_FONT_SIZES.map((size) => (
              <Menu.Item
                key={size}
                rightSection={fontSize === size && <IconCheck size={14} />}
                onClick={() => updateAttributes({ fontSize: size })}
              >
                {size}px
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>
      </div>

      <div
        className={classes.content}
        data-collapsed={collapsed || undefined}
        hidden={hideCode}
      >
        <div
          className={classes.lineNumbers}
          contentEditable={false}
          aria-hidden="true"
        >
          {Array.from({ length: lineCount }, (_, index) => (
            <span key={index}>{index + 1}</span>
          ))}
        </div>
        <pre spellCheck="false">
          {/* @ts-ignore */}
          <NodeViewContent as="code" className={`language-${language}`} />
        </pre>
      </div>

      {language === "mermaid" && (
        <Suspense fallback={null}>
          <MermaidView props={props} />
        </Suspense>
      )}
    </NodeViewWrapper>
  );
}
