import Script from "next/script";

// GA4 analytics scripts — shared component used by root and onboarding layouts
export default function Analytics() {
  return (
    <>
      <Script src="https://www.googletagmanager.com/gtag/js?id=G-BJQ18PWF0D" strategy="afterInteractive" />
      <Script id="ga4-init" strategy="afterInteractive">{`
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());
        gtag('config', 'G-BJQ18PWF0D');
      `}</Script>
    </>
  );
}
