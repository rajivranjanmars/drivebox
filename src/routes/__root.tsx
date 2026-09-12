import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import Header from "@/components/Header";
import { ThemeProvider } from "@/components/ThemeProvider";
import appCss from "@/styles/app.css?url";

const themeBootScript = `(() => { try { const saved = localStorage.getItem('drivebox-theme') || 'system'; const dark = saved === 'dark' || (saved === 'system' && matchMedia('(prefers-color-scheme: dark)').matches); document.documentElement.classList.toggle('dark', dark); } catch {} })();`;

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "theme-color", content: "#4f46e5" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/icon.svg", type: "image/svg+xml" },
    ],
  }),
  component: RootComponent,
  shellComponent: RootDocument,
});

function RootComponent(): React.JSX.Element {
  return (
    <ThemeProvider defaultTheme="system">
      <a href="#main-content" className="sr-only z-[100] rounded-md bg-background p-3 focus:not-sr-only focus:fixed focus:left-3 focus:top-3">Skip to main content</a>
      <Header />
      <Outlet />
    </ThemeProvider>
  );
}

function RootDocument({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static theme bootstrap prevents a color-scheme flash */}
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="min-w-[320px]">
        {children}
        <Scripts />
      </body>
    </html>
  );
}
