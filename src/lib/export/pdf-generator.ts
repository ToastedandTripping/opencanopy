import type { SelectionStats, FinancialValue } from "@/lib/carbon";
import { getLayer } from "@/lib/layers";

export interface ReportOptions {
  mapImageDataUrl: string;
  stats: SelectionStats;
  financial: FinancialValue | null;
  enabledLayers: string[];
  watershedName?: string;
  timestamp: string;
}

// ── HTML escaping (prevents XSS from WFS feature properties) ──────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── Formatting helpers (mirror CalculatorPanel) ────────────────────────

function fmt(n: number, decimals = 0): string {
  return n.toLocaleString("en-CA", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtCurrency(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `$${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M`;
  }
  return `$${fmt(Math.round(n))}`;
}

function pct(value: number, total: number): string {
  if (total <= 0) return "0%";
  return `${((value / total) * 100).toFixed(1)}%`;
}

// ── HTML builder ──────────────────────────────────────────────────────

function buildReportHtml(options: ReportOptions): string {
  const { mapImageDataUrl, stats, financial, enabledLayers, watershedName, timestamp } = options;

  const ageClasses = [
    { label: "Old growth (250+ yr)", ha: stats.oldGrowthHa, color: "#15803d" },
    { label: "Mature (80-250 yr)", ha: stats.matureHa, color: "#4ade80" },
    { label: "Young (<80 yr)", ha: stats.youngHa, color: "#f97316" },
    { label: "Harvested", ha: stats.harvestedHa, color: "#ef4444" },
    { label: "Unknown age", ha: stats.unknownHa, color: "#71717a" },
  ].filter((c) => c.ha >= 0.01);

  const layerNames = enabledLayers
    .map((id) => getLayer(id))
    .filter(Boolean)
    .map((l) => l!.label);

  // ── Financial bars HTML ────────────────────────────────────────────

  let financialHtml = "";
  if (financial) {
    const allValues = [
      ...financial.carbonValues.map((cv) => cv.value),
      financial.stumpageRevenue,
    ];
    const maxValue = Math.max(...allValues, 1);

    const tealShades = ["#0d9488", "#14b8a6", "#5eead4"];

    const bars = financial.carbonValues
      .map((cv, i) => {
        const w = Math.max((cv.value / maxValue) * 100, 2);
        const shade = tealShades[i] ?? tealShades[tealShades.length - 1];
        return `
        <div style="margin-bottom:10px;">
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
            <span style="color:#555;">${cv.market}</span>
            <span style="color:#222;font-variant-numeric:tabular-nums;">${fmtCurrency(cv.value)}</span>
          </div>
          <div style="height:10px;border-radius:6px;background:#f0f0f0;overflow:hidden;">
            <div style="height:100%;width:${w}%;border-radius:6px;background:${shade};"></div>
          </div>
        </div>`;
      })
      .join("");

    const stumpageW = Math.max((financial.stumpageRevenue / maxValue) * 100, 2);
    const stumpageBar = `
      <div style="margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
          <span style="color:#555;">Logging revenue</span>
          <span style="color:#222;font-variant-numeric:tabular-nums;">${fmtCurrency(financial.stumpageRevenue)}</span>
        </div>
        <div style="height:10px;border-radius:6px;background:#f0f0f0;overflow:hidden;">
          <div style="height:100%;width:${stumpageW}%;border-radius:6px;background:#ef4444;"></div>
        </div>
      </div>`;

    const ecosystemHtml =
      financial.ecosystemServicesAnnual > 0
        ? `<div style="margin-top:12px;padding:10px 14px;border-radius:8px;background:#f8fffe;border:1px solid #e0f2f1;">
            <span style="font-size:15px;color:#222;font-weight:600;">${fmtCurrency(financial.ecosystemServicesAnnual)}</span>
            <span style="font-size:12px;color:#777;">/yr in ecosystem services</span>
            <div style="font-size:10px;color:#999;margin-top:2px;">Water filtration, habitat, recreation (excl. carbon)</div>
          </div>`
        : "";

    financialHtml = `
      <div style="margin-top:28px;">
        <h3 style="font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#0d9488;margin:0 0 14px 0;">Value If Protected vs. Revenue If Logged</h3>
        ${bars}
        ${stumpageBar}
        <p style="font-size:11px;color:#888;margin:10px 0 0 0;">Carbon values represent avoided emissions credits. Both figures are one-time.</p>
        ${ecosystemHtml}
        <p style="font-size:10px;color:#aaa;margin:8px 0 0 0;">Carbon: BC GGIRCA + Verra/Gold Standard. Stumpage: FLNRORD tables. Ecosystem services: Costanza et al. 2014 (excl. carbon).</p>
      </div>`;
  }

  // ── Age class table ────────────────────────────────────────────────

  const ageRows = ageClasses
    .map(
      (c) => `
      <tr>
        <td style="padding:6px 0;border-bottom:1px solid #f0f0f0;">
          <span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${c.color};margin-right:8px;vertical-align:middle;"></span>
          ${c.label}
        </td>
        <td style="padding:6px 0;border-bottom:1px solid #f0f0f0;text-align:right;font-variant-numeric:tabular-nums;">${fmt(c.ha, 1)} ha</td>
        <td style="padding:6px 0;border-bottom:1px solid #f0f0f0;text-align:right;color:#888;font-variant-numeric:tabular-nums;">${pct(c.ha, stats.totalAreaHa)}</td>
      </tr>`
    )
    .join("");

  // ── Layer list ─────────────────────────────────────────────────────

  const layerListHtml =
    layerNames.length > 0
      ? `<div style="margin-top:28px;">
          <h3 style="font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#0d9488;margin:0 0 10px 0;">Active Layers</h3>
          <div style="display:flex;flex-wrap:wrap;gap:6px;">
            ${layerNames
              .map(
                (name) =>
                  `<span style="display:inline-block;padding:4px 10px;border-radius:6px;background:#f5f5f5;font-size:11px;color:#555;">${name}</span>`
              )
              .join("")}
          </div>
        </div>`
      : "";

  // ── Full document ──────────────────────────────────────────────────

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>OpenCanopy Conservation Report</title>
<style>
  @media print {
    @page {
      size: A4 portrait;
      margin: 15mm 12mm;
    }
    body {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .no-print { display: none !important; }
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #222;
    background: #fff;
    line-height: 1.5;
    max-width: 700px;
    margin: 0 auto;
    padding: 24px 20px;
  }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
</style>
</head>
<body>

<!-- Header -->
<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #0d9488;">
  <div>
    <div style="font-size:22px;font-weight:700;color:#0d9488;letter-spacing:-0.5px;">OpenCanopy</div>
    <div style="font-size:14px;color:#888;margin-top:2px;">Conservation Report</div>
  </div>
  <div style="text-align:right;font-size:12px;color:#aaa;">Generated ${timestamp}</div>
</div>

<!-- Map Screenshot -->
<div style="margin-bottom:24px;">
  <img id="map-image" src="${mapImageDataUrl}" alt="Map view of selected area" style="width:100%;border-radius:8px;border:1px solid #e5e5e5;display:block;" />
</div>

<!-- Location Info -->
<div style="margin-bottom:20px;">
  <h2 style="font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#0d9488;margin-bottom:6px;">
    ${watershedName ? "Watershed" : "Selected Area"}
  </h2>
  ${watershedName ? `<div style="font-size:16px;font-weight:600;color:#222;margin-bottom:2px;">${escapeHtml(watershedName)}</div>` : ""}
  <div style="font-size:20px;font-weight:600;color:#222;">
    ${fmt(stats.totalAreaHa, 1)} <span style="font-size:14px;font-weight:400;color:#888;">hectares</span>
  </div>
</div>

<!-- Carbon Stats -->
<div style="background:#f8faf9;border-radius:10px;padding:20px;margin-bottom:24px;border:1px solid #e8ede9;">
  <div style="text-align:center;margin-bottom:16px;">
    <div style="font-size:32px;font-weight:700;color:#222;font-variant-numeric:tabular-nums;">${fmt(Math.round(stats.totalCo2eTonnes))}</div>
    <div style="font-size:13px;color:#666;margin-top:2px;">tonnes CO&#8322; stored in this area</div>
    <div style="font-size:11px;color:#aaa;margin-top:2px;">${stats.featureCount} forest polygons analyzed</div>
  </div>

  <h3 style="font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#0d9488;margin:0 0 10px 0;">Age Class Breakdown</h3>
  <table>
    ${ageRows}
  </table>
</div>

<!-- Equivalences -->
<div style="margin-bottom:24px;">
  <h3 style="font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#0d9488;margin:0 0 12px 0;">That Is Equivalent To</h3>
  <div style="display:flex;gap:16px;flex-wrap:wrap;">
    <div style="flex:1;min-width:140px;padding:12px 16px;border-radius:8px;background:#f8f8f8;border:1px solid #eee;">
      <div style="font-size:20px;font-weight:700;color:#222;font-variant-numeric:tabular-nums;">${fmt(Math.round(stats.equivalences.cars))}</div>
      <div style="font-size:11px;color:#888;">cars driven for a year</div>
    </div>
    <div style="flex:1;min-width:140px;padding:12px 16px;border-radius:8px;background:#f8f8f8;border:1px solid #eee;">
      <div style="font-size:20px;font-weight:700;color:#222;font-variant-numeric:tabular-nums;">${fmt(Math.round(stats.equivalences.homes))}</div>
      <div style="font-size:11px;color:#888;">Canadian homes heated for a year</div>
    </div>
    <div style="flex:1;min-width:140px;padding:12px 16px;border-radius:8px;background:#f8f8f8;border:1px solid #eee;">
      <div style="font-size:20px;font-weight:700;color:#222;font-variant-numeric:tabular-nums;">${fmt(Math.round(stats.equivalences.flights))}</div>
      <div style="font-size:11px;color:#888;">YVR-YYZ round trips</div>
    </div>
  </div>
</div>

<!-- Financial Comparison -->
${financialHtml}

<!-- Active Layers -->
${layerListHtml}

<!-- Footer -->
<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e5e5;font-size:10px;color:#aaa;line-height:1.6;">
  <p style="margin:0 0 4px 0;">Forest data: BC VRI (WHSE_FOREST_VEGETATION). Carbon model: species-specific density curves.</p>
  <p style="margin:0 0 4px 0;">Generated by OpenCanopy (opencanopy.ca) &mdash; open-source conservation mapping for BC</p>
  <p style="margin:0;">Licensed under AGPLv3</p>
</div>

</body>
</html>`;
}

// ── Public API ────────────────────────────────────────────────────────

export function generateReport(options: ReportOptions): void {
  const html = buildReportHtml(options);
  const newWindow = window.open("", "_blank");
  if (!newWindow) return; // popup blocked

  newWindow.document.write(html);
  newWindow.document.close();

  // Trigger print dialog after a short delay for rendering.
  // Data URL images load synchronously so no onload listener needed.
  // The 500ms delay ensures CSS is fully applied across browsers.
  setTimeout(() => newWindow.print(), 500);
}
