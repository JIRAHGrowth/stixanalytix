import { AuthProvider } from "@/context/AuthContext";

export const metadata = {
  title: "StixAnalytix — Goalkeeper Coaching Intelligence",
  description: "Track, analyze, and develop your goalkeepers with data-driven coaching intelligence.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <meta name="theme-color" content="#070b0e" />
        <style>{`
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            background: #070b0e;
            color: #d1d9e0;
            font-family: 'DM Sans', -apple-system, sans-serif;
            -webkit-font-smoothing: antialiased;
          }
          ::selection { background: #10b98140; }
          input::placeholder { color: #5c6b77; }
          ::-webkit-scrollbar { width: 6px; }
          ::-webkit-scrollbar-track { background: #070b0e; }
          ::-webkit-scrollbar-thumb { background: #1e2a32; border-radius: 3px; }
        `}</style>
      </head>
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
