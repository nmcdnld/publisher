// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

/// <reference types="vite/client" />

interface ImportMetaEnv {
   /** Publisher's REST base. Defaults to `/api/v0`, which the dev server proxies to :4000. */
   readonly VITE_PUBLISHER_API?: string;
   /** Where the Publisher Console is served, for links back to the source. */
   readonly VITE_PUBLISHER_CONSOLE_URL?: string;
   /** The environment whose packages are this workspace's. */
   readonly VITE_PUBLISHER_ENVIRONMENT?: string;
}
