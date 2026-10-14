import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppRuntime } from "@/components/app-runtime";

export const metadata: Metadata = {
  title: "Nosso Dinheiro · Finanças do casal",
  description: "Um lugar para cuidar do dinheiro e dos planos de vocês.",
  applicationName: "Nosso Dinheiro",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Nosso Dinheiro",
  },
  formatDetection: { telephone: false },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#101117",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        <AppRuntime>{children}</AppRuntime>
      </body>
    </html>
  );
}
