import { Divider, Group, Modal, ScrollArea, Stack, Text } from "@mantine/core";
import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";

import { shortcutsModalOpenAtom } from "@/features/shortcuts/atoms/shortcuts-atoms.ts";
import { ShortcutKbd } from "@/features/shortcuts/components/shortcut-kbd.tsx";
import { SHORTCUT_GROUPS } from "@/features/shortcuts/lib/shortcuts.ts";

export function ShortcutsModal() {
  const { t } = useTranslation();
  const [opened, setOpened] = useAtom(shortcutsModalOpenAtom);

  return (
    <Modal
      opened={opened}
      onClose={() => setOpened(false)}
      title={t("Keyboard shortcuts")}
      size="lg"
      centered
      overlayProps={{ backgroundOpacity: 0.45, blur: 2 }}
    >
      <ScrollArea.Autosize mah="min(68vh, 560px)" offsetScrollbars>
        <Stack gap="lg" pr="xs">
          {SHORTCUT_GROUPS.map((group) => (
            <Stack key={group.id} gap={6}>
              <Text size="xs" fw={600} c="dimmed" tt="uppercase">
                {t(group.label)}
              </Text>

              <Stack gap={0}>
                {group.shortcuts.map((shortcut, index) => (
                  <div key={shortcut.id}>
                    {index > 0 && <Divider />}
                    <Group
                      justify="space-between"
                      align="center"
                      gap="xl"
                      wrap="nowrap"
                      py="sm"
                    >
                      <Text size="sm">{t(shortcut.label)}</Text>
                      <ShortcutKbd chords={shortcut.chords} />
                    </Group>
                  </div>
                ))}
              </Stack>
            </Stack>
          ))}
        </Stack>
      </ScrollArea.Autosize>
    </Modal>
  );
}

export default ShortcutsModal;
