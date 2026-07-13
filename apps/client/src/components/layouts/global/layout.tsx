import { UserProvider } from "@/features/user/user-provider.tsx";
import { Outlet, useParams } from "react-router-dom";
import GlobalAppShell from "@/components/layouts/global/global-app-shell.tsx";
import { isCloud } from "@/lib/config.ts";
import { SearchSpotlight } from "@/features/search/components/search-spotlight.tsx";
import React, { lazy, Suspense } from "react";
import { useGetSpaceBySlugQuery } from "@/features/space/queries/space-query.ts";

const PosthogUser = lazy(() =>
  import("@/ee/components/posthog-user.tsx").then((m) => ({
    default: m.PosthogUser,
  })),
);

export default function Layout() {
  const { spaceSlug } = useParams();
  const { data: space } = useGetSpaceBySlugQuery(spaceSlug);

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
    </UserProvider>
  );
}
