import { useEffect, useState } from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

function useHtmlTheme(): "light" | "dark" {
   const read = (): "light" | "dark" =>
      document.documentElement.classList.contains("dark") ? "dark" : "light";
   const [theme, setTheme] = useState(read);
   useEffect(() => {
      const observer = new MutationObserver(() => setTheme(read()));
      observer.observe(document.documentElement, { attributes: true });
      return () => observer.disconnect();
   }, []);
   return theme;
}

const Toaster = ({ ...props }: ToasterProps) => {
   const theme = useHtmlTheme();
   return (
      <Sonner
         theme={theme}
         className="toaster group"
         style={
            {
               "--normal-bg": "var(--popover)",
               "--normal-text": "var(--popover-foreground)",
               "--normal-border": "var(--border)",
            } as React.CSSProperties
         }
         {...props}
      />
   );
};

export { Toaster };
