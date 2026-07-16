import { UserProvider } from "@/features/user/user-provider.tsx";
import { matchPath, Outlet, useLocation, useParams } from "react-router-dom";
import GlobalAppShell from "@/components/layouts/global/global-app-shell.tsx";
import { isCloud } from "@/lib/config.ts";
import { SearchSpotlight } from "@/features/search/components/search-spotlight.tsx";
import React, { lazy, Suspense } from "react";
import { useGetSpaceBySlugQuery } from "@/features/space/queries/space-query.ts";
import { useGlobalShortcuts } from "@/features/shortcuts/hooks/use-global-shortcuts.ts";
import { ShortcutsModal } from "@/features/shortcuts/components/shortcuts-modal.tsx";
import { useSpaceAbility } from "@/features/space/permissions/use-space-ability.ts";
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from "@/features/space/permissions/permissions.type.ts";

const PosthogUser = lazy(() =>
  import("@/ee/components/posthog-user.tsx").then((m) => ({
    default: m.PosthogUser,
  })),
);

export default function Layout() {
  const { spaceSlug } = useParams();
  const { pathname } = useLocation();
  const { data: space } = useGetSpaceBySlugQuery(spaceSlug);
  const isPageRoute = Boolean(
    matchPath({ path: "/s/:spaceSlug/p/:pageSlug", end: true }, pathname),
  );
  const isSpaceHome = Boolean(
    matchPath({ path: "/s/:spaceSlug", end: true }, pathname),
  );

  return (
    <UserProvider>
      <GlobalAppShell>
        <Suspense fallback={null}>
          <Outlet />
        </Suspense>
      </GlobalAppShell>
      {isCloud() && (
        <Suspense fallback={null}>
          <PosthogUser />
        </Suspense>
      )}
      <SearchSpotlight spaceId={space?.id} />
      <GlobalShortcuts
        spaceId={space?.id}
        spaceRules={space?.membership?.permissions}
        isPageRoute={isPageRoute}
        allowBareRootCreate={isPageRoute || isSpaceHome}
      />
    </UserProvider>
  );
}

function GlobalShortcuts({
  spaceId,
  spaceRules,
  isPageRoute,
  allowBareRootCreate,
}: {
  spaceId?: string;
  spaceRules?: unknown;
  isPageRoute: boolean;
  allowBareRootCreate: boolean;
}) {
  const spaceAbility = useSpaceAbility(spaceRules);
  useGlobalShortcuts({
    spaceId,
    canCreatePage: spaceAbility.can(
      SpaceCaslAction.Manage,
      SpaceCaslSubject.Page,
    ),
    isPageRoute,
    allowBareRootCreate,
  });

  return <ShortcutsModal />;
}
