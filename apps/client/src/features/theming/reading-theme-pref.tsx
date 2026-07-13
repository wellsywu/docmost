import { Select, Text } from "@mantine/core";
import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { userAtom } from "@/features/user/atoms/current-user-atom";
import { updateUser } from "@/features/user/services/user-service";
import type { IUser } from "@/features/user/types/user.types";
import {
  ResponsiveSettingsContent,
  ResponsiveSettingsControl,
  ResponsiveSettingsRow,
} from "@/components/ui/responsive-settings-row";
import {
  readingCodeThemes,
  readingFonts,
  readingSizes,
  readingThemes,
} from "./manifest";
import {
  getReadingPreferences,
  type ReadingPreferences,
} from "./reading-preferences";

type PreferenceField = keyof ReadingPreferences;
type UserPreferenceField =
  | "readingTheme"
  | "readingFont"
  | "readingSize"
  | "readingCodeTheme";

interface ReadingThemeSelectProps {
  label: string;
  description: string;
  field: PreferenceField;
  userField: UserPreferenceField;
  options: readonly { id: string; label: string }[];
}

function ReadingThemeSelect({
  label,
  description,
  field,
  userField,
  options,
}: ReadingThemeSelectProps) {
  const { t } = useTranslation();
  const [user, setUser] = useAtom(userAtom);
  const preferences = getReadingPreferences(user);

  const handleChange = async (value: string | null) => {
    if (!value || !user) return;

    const previousUser = user;
    const optimisticUser = {
      ...user,
      settings: {
        ...user.settings,
        preferences: {
          ...user.settings?.preferences,
          [userField]: value,
        },
      },
    } as IUser;

    setUser(optimisticUser);

    try {
      const updatedUser = await updateUser({
        [userField]: value,
      } as Partial<IUser>);
      setUser(updatedUser);
    } catch {
      setUser(previousUser);
    }
  };

  return (
    <ResponsiveSettingsRow>
      <ResponsiveSettingsContent>
        <Text size="md">{t(label)}</Text>
        <Text size="sm" c="dimmed">
          {t(description)}
        </Text>
      </ResponsiveSettingsContent>
      <ResponsiveSettingsControl>
        <Select
          w={220}
          aria-label={t(label)}
          data={options.map((option) => ({
            value: option.id,
            label: t(option.label),
          }))}
          value={preferences[field]}
          onChange={handleChange}
          allowDeselect={false}
        />
      </ResponsiveSettingsControl>
    </ResponsiveSettingsRow>
  );
}

export function ReadingThemePref() {
  const { t } = useTranslation();

  return (
    <>
      <Text fw={600}>{t("Reading appearance")}</Text>
      <ReadingThemeSelect
        label="Reading theme"
        description="Choose the color system used while reading and editing pages."
        field="theme"
        userField="readingTheme"
        options={readingThemes}
      />
      <ReadingThemeSelect
        label="Reading font"
        description="Choose the font family used for page content."
        field="font"
        userField="readingFont"
        options={readingFonts}
      />
      <ReadingThemeSelect
        label="Reading size"
        description="Choose a compact, standard, or large reading scale."
        field="size"
        userField="readingSize"
        options={readingSizes}
      />
      <ReadingThemeSelect
        label="Code color theme"
        description="Choose the syntax palette used by code blocks."
        field="codeTheme"
        userField="readingCodeTheme"
        options={readingCodeThemes}
      />
    </>
  );
}
