import { ImageResponse } from "next/og";
import { loadInvite } from "@/lib/game/metadata";

export const runtime = "nodejs";
export const alt = "Quoridor invite";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OgImage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const info = await loadInvite(code);
  const n = 5;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: 72,
          background: "linear-gradient(135deg, #1b1e21 0%, #2b1a0c 100%)",
          color: "#f3e3c3",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 640 }}>
          <div style={{ fontSize: 40, opacity: 0.8 }}>Quoridor</div>
          <div style={{ fontSize: 68, fontWeight: 800, lineHeight: 1.1, marginTop: 16 }}>
            {info ? `${info.host} invited you to play` : "Play Quoridor online"}
          </div>
          {info && <div style={{ fontSize: 40, marginTop: 24, color: "#34c38f" }}>{info.timeControl}</div>}
          <div style={{ fontSize: 30, marginTop: 24, opacity: 0.7 }}>{`Code ${code.toUpperCase()}`}</div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", width: 380, height: 380, background: "#4a2e17", borderRadius: 24, padding: 10, gap: 10 }}>
          {Array.from({ length: n * n }, (_, i) => (
            <div
              key={i}
              style={{
                width: 62,
                height: 62,
                borderRadius: 10,
                background: "#d9b07a",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {i === 22 && <div style={{ width: 40, height: 40, borderRadius: 20, background: "#d55e00", border: "4px solid white" }} />}
              {i === 2 && <div style={{ width: 38, height: 38, borderRadius: 9, background: "#0072b2", border: "4px solid white" }} />}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
