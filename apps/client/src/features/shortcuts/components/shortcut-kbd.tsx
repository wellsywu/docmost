import { Group, Kbd, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";

import { platformModifierLabel } from "@/lib";
import type {
  ShortcutChord,
  ShortcutKey,
} from "@/features/shortcuts/lib/shortcuts.ts";

type ShortcutKbdProps = {
  chords: readonly ShortcutChord[];
};

const keyLabels: Partial<Record<ShortcutKey, string>> = {
  Mod: platformModifierLabel,
  Escape: "Esc",
  Delete: "Del",
};

function getKeyLabel(key: ShortcutKey) {
  return keyLabels[key] ?? key;
}

export function ShortcutKbd({ chords }: ShortcutKbdProps) {
  const { t } = useTranslation();

  return (
    <Group gap="xs" wrap="wrap" justify="flex-end">
      {chords.map((chord, chordIndex) => (
        <Group key={chord.join("-")} gap={4} wrap="nowrap">
          {chordIndex > 0 && (
            <Text size="xs" c="dimmed" mx={2}>
              {t("or")}
            </Text>
          )}
          {chord.map((key, keyIndex) => (
            <Group key={key} gap={4} wrap="nowrap">
              {keyIndex > 0 && (
                <Text size="xs" c="dimmed" aria-hidden>
                  +
                </Text>
              )}
              <Kbd size="xs" style={{ minWidth: 26, textAlign: "center" }}>
                {getKeyLabel(key)}
              </Kbd>
            </Group>
          ))}
        </Group>
      ))}
    </Group>
  );
}

export default ShortcutKbd;
