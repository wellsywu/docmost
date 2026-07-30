import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import SettingsTitle from "@/components/settings/settings-title";
import { WechatAccountList } from "@/features/integrations/md/components/wechat-account-list";
import useUserRole from "@/hooks/use-user-role";
import { getAppName } from "@/lib/config";

export default function WechatSettings() {
  const { t } = useTranslation();
  const { isAdmin } = useUserRole();

  if (!isAdmin) {
    return null;
  }

  return (
    <>
      <Helmet>
        <title>
          {t("WeChat official accounts")} - {getAppName()}
        </title>
      </Helmet>
      <SettingsTitle title={t("WeChat official accounts")} />
      <WechatAccountList />
    </>
  );
}
