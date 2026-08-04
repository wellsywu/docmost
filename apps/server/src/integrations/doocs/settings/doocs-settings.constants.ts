/**
 * Mirrors doocs/md's SYNC_SETTING_KEYS. This is intentionally an exact
 * allowlist: account configuration, image-host credentials, AI keys and
 * runtime state must never be accepted.
 */
export const DOOCS_SETTING_KEYS = new Set([
  'MD__theme',
  'MD__themeSettings',
  'MD__use_indent',
  'MD__use_justify',
  'isCiteStatus',
  'isCountStatus',
  'legend',
  'previewWidth',
  'locale',
  'showAIToolbox',
  'viewMode',
  'previewDevice',
  'MD__copyMode',
  'MD__sort_mode',
  'MD__enableImageReupload',
  'MD__enableScrollSync',
  'openai_type',
  'openai_temperature',
  'openai_max_token',
  'MD__css_content_config',
  'MD__templates',
  'MD__custom_components',
  'MD__marketplace_installed_themes',
  'MD__marketplace_installed_components',
  'quick_commands',
]);
