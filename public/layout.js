import { SpeedInsights } from "@vercel/speed-insights/next";

export default function RootLayout({ children }) {
  return (
    <>
      {children}
      <SpeedInsights />
    </>
  );
}