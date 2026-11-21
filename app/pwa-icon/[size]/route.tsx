import { ImageResponse } from "next/og";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ size: string }> }) {
  const { size: raw } = await ctx.params;
  const size = raw === "512" ? 512 : 192;
  const u = size / 64;
  const cells = [6, 24, 42];
  return new ImageResponse(
    (
      <div style={{ width: size, height: size, display: "flex", position: "relative", background: "#4a2e17" }}>
        {cells.flatMap((y) =>
          cells.map((x) => (
            <div
              key={`${x}-${y}`}
              style={{ position: "absolute", left: x * u, top: y * u, width: 16 * u, height: 16 * u, borderRadius: 3 * u, background: "#d9b07a" }}
            />
          )),
        )}
        <div style={{ position: "absolute", left: 4 * u, top: 21.5 * u, width: 36 * u, height: 3 * u, borderRadius: 1.5 * u, background: "#f3e3c3" }} />
        <div
          style={{
            position: "absolute",
            left: 26.5 * u,
            top: 44.5 * u,
            width: 11 * u,
            height: 11 * u,
            borderRadius: 6 * u,
            background: "#d55e00",
            border: `${1.2 * u}px solid white`,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 27 * u,
            top: 9 * u,
            width: 10 * u,
            height: 10 * u,
            borderRadius: 2.5 * u,
            background: "#0072b2",
            border: `${1.2 * u}px solid white`,
          }}
        />
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=604800, immutable" } },
  );
}
