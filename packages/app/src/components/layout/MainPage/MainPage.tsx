// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { Loading } from "@malloy-publisher/sdk";
import SidebarToggleIcon from "../Sidebar/SidebarToggleIcon";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import {
   lazy,
   type RefObject,
   Suspense,
   useEffect,
   useLayoutEffect,
   useRef,
   useState,
} from "react";
import { Outlet, useLocation, useNavigationType } from "react-router-dom";
import { usePrototypeFeatures } from "../../../prototypeFeatures";
import { layout } from "../../../theme";
import { useAskWindow } from "../../chat/askWindowStore";
import { ThemeToggle } from "../../common/ThemeToggle";
import { VisualizationThemeButton } from "../../common/VisualizationThemeButton";
import { HeaderProps } from "../Header/Header";
import BreadcrumbNav from "../BreadcrumbNav/BreadcrumbNav";
import Sidebar from "../Sidebar/Sidebar";
import SideMenuMobile from "../SideMenuMobile/SideMenuMobile";

const AskWindow = lazy(() => import("../../chat/AskWindow"));

interface MainPageProps {
   headerProps?: HeaderProps;
}

export default function MainPage({ headerProps }: MainPageProps) {
   const theme = useTheme();
   const isMdUp = useMediaQuery(theme.breakpoints.up("md"));
   const [mobileOpen, setMobileOpen] = useState(false);
   const [collapsed, setCollapsed] = useState(false);
   const askWindow = useAskWindow();
   const scroller = useRef<HTMLDivElement>(null);
   // The Ask window is only opened from these modules' pages.
   const { dataDictionary, questionCoverage } = usePrototypeFeatures();

   useEffect(() => {
      if (isMdUp && mobileOpen) {
         setMobileOpen(false);
      }
   }, [isMdUp, mobileOpen]);

   return (
      <Box
         sx={{
            height: "100dvh",
            display: "flex",
            flexDirection: "row",
            bgcolor: "background.default",
         }}
      >
         {isMdUp && (
            <Sidebar
               isCollapsed={collapsed}
               onToggleCollapse={() => setCollapsed((prev) => !prev)}
               logoHeader={headerProps?.logoHeader}
            />
         )}

         <Box
            component="main"
            sx={{
               flex: 1,
               display: "flex",
               flexDirection: "column",
               minWidth: 0,
            }}
         >
            <Box
               sx={{
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  height: layout.headerHeight,
                  px: { xs: 1, md: 3 },
                  backgroundColor: "background.default",
               }}
            >
               <Box
                  sx={{
                     display: { xs: "flex", md: "none" },
                     alignItems: "center",
                     mr: 1,
                  }}
               >
                  <IconButton
                     size="small"
                     onClick={() => setMobileOpen(true)}
                     aria-label="Open navigation"
                  >
                     <SidebarToggleIcon fontSize="small" />
                  </IconButton>
               </Box>

               <Box
                  sx={{
                     flex: 1,
                     minWidth: 0,
                     display: "flex",
                     alignItems: "center",
                  }}
               >
                  <BreadcrumbNav />
               </Box>

               <Box
                  id="header-actions-portal"
                  sx={{
                     display: "flex",
                     alignItems: "center",
                     flexShrink: 0,
                     gap: 1,
                  }}
               >
                  <VisualizationThemeButton />
                  <ThemeToggle />
                  {headerProps?.endCap}
               </Box>
            </Box>

            <Box
               ref={scroller}
               sx={{
                  flex: 1,
                  overflow: "auto",
                  minWidth: 320,
                  minHeight: 0,
               }}
            >
               <ScrollToTopOnNavigate scroller={scroller} />
               <Suspense fallback={<Loading />}>
                  <Outlet />
               </Suspense>
            </Box>
         </Box>

         <SideMenuMobile
            open={mobileOpen}
            onClose={() => setMobileOpen(false)}
            logoHeader={headerProps?.logoHeader}
         />

         {askWindow.open && (dataDictionary || questionCoverage) && (
            <Suspense fallback={null}>
               <AskWindow />
            </Suspense>
         )}
      </Box>
   );
}

/**
 * Must render before the routed page: sibling layout effects run in order, so
 * a page that positions itself on navigation (the field feed) still wins.
 * Replace navigations are skipped because pages use them to track scrolling.
 */
function ScrollToTopOnNavigate({
   scroller,
}: {
   scroller: RefObject<HTMLDivElement | null>;
}) {
   const { pathname } = useLocation();
   const navigationType = useNavigationType();
   useLayoutEffect(() => {
      if (navigationType === "PUSH") scroller.current?.scrollTo({ top: 0 });
      // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [pathname]);
   return null;
}
