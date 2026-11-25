import { format } from "date-fns";
import { useI18n } from "@/i18n/I18nProvider";
import { MIN_TREND_POINTS, segments, type Observation, type Period } from "@/lib/report/data";

const VW = 640;
const VH = 220;
const PAD = { l: 34, r: 12, t: 28, b: 30 };

function scales(p: Period, max: number) {
  const pw = VW - PAD.l - PAD.r;
  const ph = VH - PAD.t - PAD.b;
  const t0 = p.start.getTime();
  const span = Math.max(1, p.end.getTime() - t0);
  return {
    x: (d: Date) => PAD.l + ((d.getTime() - t0) / span) * pw,
    y: (v: number) => PAD.t + ph - (v / max) * ph,
    pw,
    ph,
  };
}

function ticks(p: Period) {
  if (p.days === 1)
    return [0, 6, 12, 18, 24].map((h) => ({
      at: new Date(p.start.getTime() + h * 3600_000),
      label: `${String(h).padStart(2, "0")}:00`,
    }));
  const count = Math.min(p.days, 7);
  const step = (p.days - 1) / Math.max(1, count - 1);
  return Array.from({ length: count }, (_, i) => {
    const at = new Date(p.start.getTime() + Math.round(i * step) * 86400_000 + 12 * 3600_000);
    return { at, label: format(at, "d MMM") };
  });
}

/**
 * A chart of recorded observations only, on a true time axis. Points are labelled with
 * their values (no hover needed), joined only across consecutive days, and described in
 * text for screen readers.
 */
export function ObservationChart({
  series,
  period,
  kind,
}: {
  series: Observation[];
  period: Period;
  kind: "pain" | "sleep";
}) {
  const { t } = useI18n();
  if (series.length < MIN_TREND_POINTS) {
    return (
      <div className="space-y-3">
        <p className="text-[0.9375rem] text-muted-foreground">
          {series.length === 0
            ? t(kind === "pain" ? "rpt.noPain" : "rpt.noSleep")
            : t("rpt.tooFew", { n: series.length, min: MIN_TREND_POINTS })}
        </p>
        {series.length > 0 && (
          <ul className="grid gap-2 sm:grid-cols-3">
            {series.map((s) => (
              <li key={s.at.toISOString()} className="rounded-2xl border border-border p-3">
                <p className="text-sm text-muted-foreground">{format(s.at, "d MMM yyyy, HH:mm")}</p>
                <p className="mt-0.5 text-xl font-bold">
                  <bdi dir="ltr">{kind === "pain" ? `${s.value}/10` : `${s.value} h`}</bdi>
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }
  const max =
    kind === "pain" ? 10 : Math.max(12, Math.ceil(Math.max(...series.map((s) => s.value))));
  const yTicks = kind === "pain" ? [0, 2, 4, 6, 8, 10] : [0, Math.round(max / 2), max];
  const s = scales(period, max);
  const bw = Math.max(3, Math.min(14, s.pw / (period.days * 1.8)));
  const label = series.length <= 40;
  const summary =
    kind === "pain"
      ? t("rpt.painChartAlt", {
          n: series.length,
          min: Math.min(...series.map((o) => o.value)),
          max: Math.max(...series.map((o) => o.value)),
        })
      : t("rpt.sleepChartAlt", {
          n: series.length,
          min: Math.min(...series.map((o) => o.value)),
          max: Math.max(...series.map((o) => o.value)),
        });
  return (
    <figure className="space-y-2" dir="ltr">
      <svg viewBox={`0 0 ${VW} ${VH}`} role="img" aria-label={summary} className="h-auto w-full">
        <text x={PAD.l - 30} y={12} className="fill-muted-foreground" fontSize="11">
          {kind === "pain" ? t("rpt.painAxis") : t("rpt.sleepAxis")}
        </text>
        {yTicks.map((v) => (
          <g key={v}>
            <line
              x1={PAD.l}
              x2={VW - PAD.r}
              y1={s.y(v)}
              y2={s.y(v)}
              stroke={v === 0 ? "#6b6280" : "#e6e1ec"}
              strokeWidth={v === 0 ? 1.2 : 0.8}
            />
            <text
              x={PAD.l - 6}
              y={s.y(v) + 4}
              textAnchor="end"
              fontSize="11"
              className="fill-muted-foreground"
            >
              {v}
            </text>
          </g>
        ))}
        {ticks(period).map((tk) => (
          <text
            key={tk.label + tk.at.getTime()}
            x={Math.min(VW - PAD.r, Math.max(PAD.l, s.x(tk.at)))}
            y={VH - 10}
            textAnchor="middle"
            fontSize="11"
            className="fill-muted-foreground"
          >
            {tk.label}
          </text>
        ))}
        {kind === "pain" ? (
          <>
            {segments(series).map((seg, i) =>
              seg.length > 1 ? (
                <polyline
                  key={i}
                  points={seg.map((o) => `${s.x(o.at)},${s.y(o.value)}`).join(" ")}
                  fill="none"
                  stroke="#4b2e83"
                  strokeWidth={2}
                />
              ) : null,
            )}
            {series.map((o) => (
              <g key={o.at.toISOString()}>
                <circle
                  cx={s.x(o.at)}
                  cy={s.y(o.value)}
                  r={4.5}
                  fill="#fff"
                  stroke="#4b2e83"
                  strokeWidth={2}
                >
                  <title>{`${format(o.at, "d MMM yyyy, HH:mm")}: ${o.value}/10`}</title>
                </circle>
                {label && (
                  <text
                    x={s.x(o.at)}
                    y={s.y(o.value) - 8}
                    textAnchor="middle"
                    fontSize="11"
                    fontWeight="700"
                    className="fill-foreground"
                  >
                    {o.value}
                  </text>
                )}
              </g>
            ))}
          </>
        ) : (
          series.map((o) => (
            <g key={o.at.toISOString()}>
              <rect
                x={s.x(o.at) - bw / 2}
                y={s.y(o.value)}
                width={bw}
                height={s.y(0) - s.y(o.value)}
                fill="#e9e3f3"
                stroke="#4b2e83"
                strokeWidth={1}
              >
                <title>{`${format(o.at, "d MMM yyyy")}: ${o.value} h`}</title>
              </rect>
              {label && (
                <text
                  x={s.x(o.at)}
                  y={s.y(o.value) - 5}
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight="700"
                  className="fill-foreground"
                >
                  {o.value}
                </text>
              )}
            </g>
          ))
        )}
      </svg>
      <figcaption className="text-sm text-muted-foreground" dir="auto">
        {summary} {kind === "pain" ? t("rpt.painChartNote") : t("rpt.sleepChartNote")}
      </figcaption>
    </figure>
  );
}
