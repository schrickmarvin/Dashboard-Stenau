// pages/index.js
import { useEffect } from "react";
import { useRouter } from "next/router";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard");
  }, [router]);

  return (
    <div style={{ padding: 40, fontFamily: "system-ui" }}>
      <h1>Dashboard Stenau</h1>
      <p>Weiterleitung…</p>
    </div>
  );
}
