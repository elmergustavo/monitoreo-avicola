import PDFDocument from 'pdfkit';
import { DAY_MS, GT_OFFSET_MS } from '../../common/time.util.js';
import {
  ALERT_EVENT_TYPES,
  BRAND,
  COMPANY_NAME,
  EVENT_LABELS,
  formatDate,
  formatDateTime,
  formatDayKey,
  formatMinutes,
  formatNumber,
  formatPercent,
  formatPeriod,
  formatTemp,
  formatTime,
  REPORT_TITLE,
  SYSTEM_NAME,
  TIMEZONE_LABEL,
} from '../report.format.js';
import type { DeviceReport, PeriodStats, ReportData } from '../report.types.js';

type Doc = PDFKit.PDFDocument;

const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = { left: 44, right: 44, top: 40, bottom: 56 };
const CONTENT_WIDTH = PAGE.width - MARGIN.left - MARGIN.right;
const BOTTOM = PAGE.height - MARGIN.bottom;
/** Where content starts on pages after the first (below the running header). */
const CONTINUATION_TOP = 74;
const MAX_ALERT_ROWS = 80;

const FONT = { regular: 'Helvetica', bold: 'Helvetica-Bold', oblique: 'Helvetica-Oblique' };

/** Builds the printable report: letterhead, indicators, findings, chart and tables per shed. */
export function renderPdf(report: ReportData): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margins: MARGIN,
    bufferPages: true,
    info: {
      Title: `${REPORT_TITLE} · ${formatPeriod(report.period)}`,
      Author: COMPANY_NAME,
      Subject: SYSTEM_NAME,
      Creator: SYSTEM_NAME,
      Keywords: `reporte ${report.code}`,
    },
  });

  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  doc.on('pageAdded', () => {
    doc.y = CONTINUATION_TOP;
  });

  drawLetterhead(doc, report);
  drawTitleBlock(doc, report);

  if (report.devices.length === 0) {
    paragraph(doc, 'No hay galpones activos para incluir en el reporte.', { color: BRAND.muted });
  }
  if (report.devices.length > 1) drawComparison(doc, report);

  report.devices.forEach((device, index) => {
    if (report.devices.length > 1 || index > 0) doc.addPage();
    drawDeviceSection(doc, report, device);
  });

  drawClosing(doc, report);
  drawPageChrome(doc, report);
  doc.end();
  return done;
}

// ---------------------------------------------------------------------------
// First page
// ---------------------------------------------------------------------------

function drawLetterhead(doc: Doc, report: ReportData) {
  const height = 78;
  doc.rect(0, 0, PAGE.width, height).fill(BRAND.primary);
  drawBrandMark(doc, MARGIN.left, 22, 34, '#FFFFFF');

  doc.font(FONT.bold).fontSize(16).fillColor('#FFFFFF');
  doc.text(COMPANY_NAME, MARGIN.left + 46, 25, { lineBreak: false });
  doc.font(FONT.regular).fontSize(9).fillColor('#D5E6DB');
  doc.text(SYSTEM_NAME, MARGIN.left + 46, 45, { lineBreak: false });

  const right = PAGE.width - MARGIN.right;
  doc.font(FONT.bold).fontSize(8).fillColor('#D5E6DB');
  doc.text('REPORTE OPERATIVO', right - 200, 27, {
    width: 200,
    align: 'right',
    characterSpacing: 1.2,
  });
  doc.font(FONT.regular).fontSize(9).fillColor('#FFFFFF');
  doc.text(report.code, right - 200, 41, { width: 200, align: 'right' });

  doc.y = height + 26;
}

function drawTitleBlock(doc: Doc, report: ReportData) {
  const x = MARGIN.left;
  doc.font(FONT.bold).fontSize(21).fillColor(BRAND.ink).text(REPORT_TITLE, x, doc.y);
  doc
    .font(FONT.regular)
    .fontSize(11)
    .fillColor(BRAND.muted)
    .text(
      `${capitalize(formatPeriod(report.period))}  ·  ${report.period.days} ${report.period.days === 1 ? 'día' : 'días'}`,
      x,
      doc.y + 3,
    );

  const scope =
    report.scopeDeviceId && report.devices[0]
      ? describeShed(report.devices[0])
      : `Todos los galpones activos (${report.devices.length})`;
  const fields: Array<[string, string]> = [
    ['ALCANCE', scope],
    ['GENERADO POR', report.generatedBy.name],
    ['FECHA DE GENERACIÓN', formatDateTime(report.generatedAt)],
  ];

  const top = doc.y + 16;
  doc.rect(x, top, CONTENT_WIDTH, 50).fill(BRAND.paper);
  const columnWidth = CONTENT_WIDTH / fields.length;
  fields.forEach(([label, value], i) => {
    const cx = x + 14 + i * columnWidth;
    doc.font(FONT.bold).fontSize(7).fillColor(BRAND.muted);
    doc.text(label, cx, top + 12, {
      width: columnWidth - 20,
      characterSpacing: 0.8,
      lineBreak: false,
    });
    doc.font(FONT.regular).fontSize(10).fillColor(BRAND.ink);
    doc.text(value, cx, top + 26, { width: columnWidth - 20, lineBreak: false, ellipsis: true });
  });
  doc.y = top + 50 + 22;
}

function drawComparison(doc: Doc, report: ReportData) {
  sectionHeading(doc, 'Resumen general', 'Comparación de los galpones en el periodo.');
  table(doc, {
    columns: [
      { header: 'Galpón', width: 91 },
      { header: 'Promedio', width: 56, align: 'right' },
      { header: 'Mínima', width: 50, align: 'right' },
      { header: 'Máxima', width: 50, align: 'right' },
      { header: 'En óptimo', width: 56, align: 'right' },
      { header: 'Riego', width: 90, align: 'right' },
      { header: 'Alertas', width: 50, align: 'right' },
      { header: 'Cobertura', width: 64.28, align: 'right' },
    ],
    rows: report.devices.map((device) => {
      const t = device.totals;
      return {
        cells: [
          device.name,
          formatTemp(t.average),
          formatTemp(t.min),
          formatTemp(t.max),
          formatPercent(t.optimalShare),
          `${t.irrigationCycles} · ${formatMinutes(t.irrigationMinutes)}`,
          String(alertCount(t)),
          formatPercent(t.coverage),
        ],
        colors: [
          null,
          null,
          null,
          null,
          shareColor(t.optimalShare),
          null,
          alertCount(t) > 0 ? BRAND.alert : null,
          coverageColor(t.coverage),
        ],
      };
    }),
  });
  doc.y += 8;
  paragraph(doc, 'El detalle de cada galpón aparece en las páginas siguientes.', {
    color: BRAND.muted,
    size: 9,
  });
}

// ---------------------------------------------------------------------------
// One section per shed
// ---------------------------------------------------------------------------

function drawDeviceSection(doc: Doc, report: ReportData, device: DeviceReport) {
  const { tempMin, tempMax, tempAlert } = device.thresholds;
  sectionHeading(
    doc,
    device.name,
    `${device.shed === device.name ? '' : `${device.shed}  ·  `}Rango óptimo ${tempMin}–${tempMax} °C  ·  Alerta desde ${tempAlert} °C`,
  );

  drawIndicators(doc, device);
  drawChart(doc, report, device);
  drawFindings(doc, report, device);
  drawDailyTable(doc, device);
  drawAlerts(doc, device);
}

function drawIndicators(doc: Doc, device: DeviceReport) {
  const t = device.totals;
  const tiles: Array<{ label: string; value: string; note?: string; color?: string }> = [
    {
      label: 'Promedio',
      value: formatTemp(t.average),
      note: `${formatNumber(t.readings)} lecturas`,
    },
    {
      label: 'En rango óptimo',
      value: formatPercent(t.optimalShare),
      note: t.aboveShare !== null ? `${formatPercent(t.aboveShare)} sobre el máximo` : undefined,
      color: shareColor(t.optimalShare) ?? undefined,
    },
    {
      label: 'Mínima',
      value: formatTemp(device.coldest?.temperature ?? null),
      note: device.coldest
        ? `${formatDate(device.coldest.at)} · ${formatTime(device.coldest.at)}`
        : undefined,
      color: BRAND.cool,
    },
    {
      label: 'Máxima',
      value: formatTemp(device.hottest?.temperature ?? null),
      note: device.hottest
        ? `${formatDate(device.hottest.at)} · ${formatTime(device.hottest.at)}`
        : undefined,
      color:
        device.hottest && device.hottest.temperature >= device.thresholds.tempAlert
          ? BRAND.alert
          : BRAND.warm,
    },
    { label: 'Ciclos de riego', value: formatNumber(t.irrigationCycles), color: BRAND.water },
    { label: 'Tiempo de riego', value: formatMinutes(t.irrigationMinutes), color: BRAND.water },
    {
      label: 'Alertas',
      value: formatNumber(alertCount(t)),
      note: `${t.heatAlerts} calor · ${t.prolongedIrrigationAlerts} riego · ${t.sensorErrors} sensor`,
      color: alertCount(t) > 0 ? BRAND.alert : BRAND.optimal,
    },
    {
      label: 'Cobertura',
      value: formatPercent(t.coverage),
      note: 'Intervalos de 5 min con datos',
      color: coverageColor(t.coverage) ?? undefined,
    },
  ];

  const columns = 4;
  const gap = 8;
  const width = (CONTENT_WIDTH - gap * (columns - 1)) / columns;
  const height = 58;
  ensureSpace(doc, height * 2 + gap);
  const top = doc.y;

  tiles.forEach((tile, i) => {
    const x = MARGIN.left + (i % columns) * (width + gap);
    const y = top + Math.floor(i / columns) * (height + gap);
    doc.roundedRect(x, y, width, height, 4).lineWidth(0.75).strokeColor(BRAND.border).stroke();
    doc.rect(x, y + 10, 2.5, height - 20).fill(tile.color ?? BRAND.primary);
    doc.font(FONT.regular).fontSize(7.5).fillColor(BRAND.muted);
    doc.text(tile.label.toUpperCase(), x + 11, y + 9, { characterSpacing: 0.4, lineBreak: false });
    doc.font(FONT.bold).fontSize(15).fillColor(BRAND.ink);
    doc.text(tile.value, x + 11, y + 22, { width: width - 16, lineBreak: false });
    if (tile.note) {
      doc.font(FONT.regular).fontSize(7.5).fillColor(BRAND.muted);
      doc.text(tile.note, x + 11, y + 41, { width: width - 16, lineBreak: false, ellipsis: true });
    }
  });
  doc.y = top + height * 2 + gap + 18;
}

function drawFindings(doc: Doc, report: ReportData, device: DeviceReport) {
  const findings = buildFindings(report, device);
  subheading(doc, 'Hallazgos');
  for (const finding of findings) {
    const height = doc
      .font(FONT.regular)
      .fontSize(9.5)
      .heightOfString(finding, { width: CONTENT_WIDTH - 14 });
    ensureSpace(doc, height + 4);
    const y = doc.y;
    doc.circle(MARGIN.left + 3, y + 5, 1.8).fill(BRAND.primary);
    doc
      .fillColor(BRAND.ink)
      .text(finding, MARGIN.left + 14, y, { width: CONTENT_WIDTH - 14, lineGap: 1.5 });
    doc.y += 4;
  }
  doc.y += 10;
}

/** Plain-language conclusions computed from the figures. */
export function buildFindings(report: ReportData, device: DeviceReport): string[] {
  const t = device.totals;
  const { tempMin, tempMax } = device.thresholds;
  if (t.readings === 0) {
    return [
      'No se recibieron lecturas de este galpón en el periodo. Revisa que el equipo tenga energía y conexión a internet.',
    ];
  }

  const findings: string[] = [];
  findings.push(
    `La temperatura estuvo en el rango óptimo (${tempMin}–${tempMax} °C) el ${formatPercent(t.optimalShare)} del tiempo; ` +
      `${formatPercent(t.aboveShare)} por encima del máximo y ${formatPercent(t.belowShare)} por debajo del mínimo.`,
  );
  if (device.hottest && device.coldest) {
    findings.push(
      `La máxima fue ${formatTemp(device.hottest.temperature)} el ${formatDate(device.hottest.at)} a las ${formatTime(device.hottest.at)}, ` +
        `y la mínima ${formatTemp(device.coldest.temperature)} el ${formatDate(device.coldest.at)} a las ${formatTime(device.coldest.at)}.`,
    );
  }

  const daysWithData = device.daily.filter((d) => d.average !== null);
  if (report.period.days > 1 && daysWithData.length > 1) {
    const hottestDay = daysWithData.reduce((a, b) => ((b.average ?? 0) > (a.average ?? 0) ? b : a));
    const worstDay = daysWithData.reduce((a, b) =>
      (b.optimalShare ?? 1) < (a.optimalShare ?? 1) ? b : a,
    );
    findings.push(
      `El día más caluroso fue el ${formatDayKey(hottestDay.date)}, con un promedio de ${formatTemp(hottestDay.average)}.` +
        (worstDay.date !== hottestDay.date || (worstDay.optimalShare ?? 1) < 0.5
          ? ` El día con menos tiempo en rango óptimo fue el ${formatDayKey(worstDay.date)} (${formatPercent(worstDay.optimalShare)}).`
          : ''),
    );
  }

  if (t.irrigationCycles > 0) {
    findings.push(
      `El riego se activó ${formatNumber(t.irrigationCycles)} ${t.irrigationCycles === 1 ? 'vez' : 'veces'}, ` +
        `con un total de ${formatMinutes(t.irrigationMinutes)} (${formatMinutes(t.irrigationMinutes / t.irrigationCycles)} por ciclo en promedio).`,
    );
  } else {
    findings.push('No se registraron ciclos de riego completos en el periodo.');
  }

  const alerts = alertCount(t);
  if (alerts === 0) {
    findings.push('No hubo alertas en el periodo.');
  } else {
    const parts = [
      t.heatAlerts > 0 ? `${t.heatAlerts} de calor sin riego` : null,
      t.prolongedIrrigationAlerts > 0 ? `${t.prolongedIrrigationAlerts} de riego prolongado` : null,
      t.sensorErrors > 0
        ? `${t.sensorErrors} ${t.sensorErrors === 1 ? 'error' : 'errores'} del sensor`
        : null,
    ].filter(Boolean);
    findings.push(
      `Se registraron ${alerts} ${alerts === 1 ? 'alerta' : 'alertas'}: ${joinList(parts as string[])}.`,
    );
  }

  if (t.coverage !== null && t.coverage < 0.95) {
    findings.push(
      `La cobertura de datos fue de ${formatPercent(t.coverage)}: hubo periodos sin lecturas, posiblemente por cortes de luz o de internet.`,
    );
  }
  return findings;
}

function drawChart(doc: Doc, report: ReportData, device: DeviceReport) {
  const height = 176;
  ensureSpace(doc, height + 60);
  subheading(doc, 'Evolución de la temperatura');

  const points = device.chart.points;
  const { tempMin, tempMax, tempAlert } = device.thresholds;
  const left = MARGIN.left + 30;
  const top = doc.y + 4;
  const width = CONTENT_WIDTH - 30;
  const plotHeight = height - 22;
  const bottom = top + plotHeight;

  const values = points.flatMap((p) => [p.min, p.max]);
  const lowest = Math.floor(Math.min(tempMin, ...values) - 1);
  const highest = Math.ceil(Math.max(tempAlert, ...values) + 1);
  const span = Math.max(1, highest - lowest);
  const step = span <= 8 ? 1 : span <= 16 ? 2 : span <= 40 ? 5 : 10;
  const yMin = Math.floor(lowest / step) * step;
  const yMax = Math.ceil(highest / step) * step;

  const fromMs = report.period.from.getTime();
  const toMs = report.period.to.getTime();
  const xOf = (at: Date) => left + ((at.getTime() - fromMs) / (toMs - fromMs)) * width;
  const yOf = (value: number) => bottom - ((value - yMin) / (yMax - yMin)) * plotHeight;

  // Optimal band
  doc.rect(left, yOf(tempMax), width, yOf(tempMin) - yOf(tempMax)).fill(BRAND.primarySoft);

  // Horizontal grid and labels
  doc.font(FONT.regular).fontSize(7).fillColor(BRAND.muted);
  for (let value = yMin; value <= yMax; value += step) {
    const y = yOf(value);
    doc
      .moveTo(left, y)
      .lineTo(left + width, y)
      .lineWidth(0.4)
      .strokeColor(BRAND.border)
      .stroke();
    doc
      .fillColor(BRAND.muted)
      .text(`${value}°`, MARGIN.left, y - 3.5, { width: 24, align: 'right', lineBreak: false });
  }

  // Vertical ticks in local time
  for (const tick of timeTicks(fromMs, toMs)) {
    const x = left + ((tick.at - fromMs) / (toMs - fromMs)) * width;
    doc.moveTo(x, top).lineTo(x, bottom).lineWidth(0.4).strokeColor(BRAND.border).stroke();
    doc
      .fillColor(BRAND.muted)
      .text(tick.label, x - 25, bottom + 5, { width: 50, align: 'center', lineBreak: false });
  }

  // Alert threshold
  doc.save();
  doc
    .moveTo(left, yOf(tempAlert))
    .lineTo(left + width, yOf(tempAlert))
    .lineWidth(0.9)
    .dash(3, { space: 2.5 })
    .strokeColor(BRAND.alert)
    .stroke();
  doc.undash();
  doc.restore();
  doc.font(FONT.bold).fontSize(7).fillColor(BRAND.alert);
  doc.text(`Alerta ${tempAlert} °C`, left + width - 80, yOf(tempAlert) - 10, {
    width: 78,
    align: 'right',
    lineBreak: false,
  });

  if (points.length === 0) {
    doc.font(FONT.oblique).fontSize(9).fillColor(BRAND.muted);
    doc.text('Sin lecturas en el periodo', left, top + plotHeight / 2 - 5, {
      width,
      align: 'center',
    });
  } else {
    // Points further apart than a few buckets are not joined (the shed was offline).
    const maxGapMs = device.chart.bucketSeconds * 1000 * 3;
    const segments: (typeof points)[] = [];
    for (const point of points) {
      const current = segments.at(-1);
      const previous = current?.at(-1);
      if (!current || !previous || point.at.getTime() - previous.at.getTime() > maxGapMs)
        segments.push([point]);
      else current.push(point);
    }

    for (const segment of segments) {
      if (segment.length < 2) continue;
      // Min-max range
      doc.save();
      doc.moveTo(xOf(segment[0].at), yOf(segment[0].max));
      for (const p of segment.slice(1)) doc.lineTo(xOf(p.at), yOf(p.max));
      for (const p of [...segment].reverse()) doc.lineTo(xOf(p.at), yOf(p.min));
      doc.closePath().fillOpacity(0.16).fill(BRAND.warm);
      doc.restore();
    }
    for (const segment of segments) {
      doc.save();
      if (segment.length === 1) {
        doc.circle(xOf(segment[0].at), yOf(segment[0].average), 1.2).fill(BRAND.ink);
      } else {
        doc.moveTo(xOf(segment[0].at), yOf(segment[0].average));
        for (const p of segment.slice(1)) doc.lineTo(xOf(p.at), yOf(p.average));
        doc.lineWidth(1.1).lineJoin('round').strokeColor(BRAND.ink).stroke();
      }
      doc.restore();
    }
  }

  // Frame
  doc
    .moveTo(left, bottom)
    .lineTo(left + width, bottom)
    .lineWidth(0.8)
    .strokeColor(BRAND.muted)
    .stroke();

  // Legend
  const legendY = bottom + 20;
  let lx = left;
  const legend: Array<{ label: string; draw: (x: number, y: number) => void }> = [
    {
      label: 'Promedio',
      draw: (x, y) =>
        doc
          .moveTo(x, y)
          .lineTo(x + 14, y)
          .lineWidth(1.4)
          .strokeColor(BRAND.ink)
          .stroke(),
    },
    {
      label: 'Rango mín.–máx.',
      draw: (x, y) =>
        doc
          .save()
          .rect(x, y - 4, 14, 8)
          .fillOpacity(0.25)
          .fill(BRAND.warm)
          .restore(),
    },
    {
      label: `Rango óptimo (${tempMin}–${tempMax} °C)`,
      draw: (x, y) => doc.rect(x, y - 4, 14, 8).fill(BRAND.primarySoft),
    },
    {
      label: 'Umbral de alerta',
      draw: (x, y) => {
        doc
          .save()
          .moveTo(x, y)
          .lineTo(x + 14, y)
          .lineWidth(1)
          .dash(3, { space: 2 })
          .strokeColor(BRAND.alert)
          .stroke();
        doc.undash().restore();
      },
    },
  ];
  doc.font(FONT.regular).fontSize(7.5);
  for (const item of legend) {
    item.draw(lx, legendY + 3);
    doc.fillColor(BRAND.muted).text(item.label, lx + 19, legendY, { lineBreak: false });
    lx += 19 + doc.widthOfString(item.label) + 16;
  }
  const bucketLabel = describeBucket(device.chart.bucketSeconds);
  doc.text(bucketLabel, left, legendY + 12, { width, lineBreak: false });

  doc.x = MARGIN.left;
  doc.y = legendY + 34;
}

function drawDailyTable(doc: Doc, device: DeviceReport) {
  ensureSpace(doc, 80);
  subheading(doc, 'Detalle por día');
  table(doc, {
    columns: [
      { header: 'Fecha', width: 58 },
      { header: 'Lecturas', width: 48, align: 'right' },
      { header: 'Promedio', width: 52, align: 'right' },
      { header: 'Mínima', width: 48, align: 'right' },
      { header: 'Máxima', width: 48, align: 'right' },
      { header: 'En óptimo', width: 52, align: 'right' },
      { header: 'Sobre máx.', width: 58, align: 'right' },
      { header: 'Riegos', width: 42, align: 'right' },
      { header: 'Tiempo riego', width: 62, align: 'right' },
      { header: 'Alertas', width: 43.28, align: 'right' },
    ],
    rows: device.daily.map((day) => ({
      cells: [
        formatDayKey(day.date),
        day.readings > 0 ? formatNumber(day.readings) : '—',
        formatTemp(day.average),
        formatTemp(day.min),
        formatTemp(day.max),
        formatPercent(day.optimalShare),
        formatPercent(day.aboveShare),
        String(day.irrigationCycles),
        day.irrigationMinutes > 0 ? formatMinutes(day.irrigationMinutes) : '—',
        String(alertCount(day)),
      ],
      colors: [
        null,
        null,
        null,
        null,
        day.max !== null && day.max >= device.thresholds.tempAlert ? BRAND.alert : null,
        shareColor(day.optimalShare),
        null,
        null,
        null,
        alertCount(day) > 0 ? BRAND.alert : null,
      ],
      muted: day.readings === 0,
    })),
  });
  doc.y += 14;
}

function drawAlerts(doc: Doc, device: DeviceReport) {
  const alerts = device.events.filter((event) => ALERT_EVENT_TYPES.includes(event.type));
  ensureSpace(doc, 60);
  subheading(doc, 'Registro de alertas');
  if (alerts.length === 0) {
    paragraph(doc, 'Sin alertas en el periodo.', { color: BRAND.muted, size: 9.5 });
    return;
  }
  const shown = alerts.slice(0, MAX_ALERT_ROWS);
  table(doc, {
    columns: [
      { header: 'Fecha y hora', width: 110 },
      { header: 'Evento', width: 221.28 },
      { header: 'Temperatura', width: 90, align: 'right' },
      { header: 'Duración', width: 86, align: 'right' },
    ],
    rows: shown.map((event) => ({
      cells: [
        formatDateTime(event.at),
        EVENT_LABELS[event.type],
        formatTemp(event.temperature),
        event.durationMin !== null ? formatMinutes(event.durationMin) : '—',
      ],
      colors: [null, BRAND.alert, null, null],
    })),
  });
  if (alerts.length > shown.length) {
    doc.y += 6;
    paragraph(
      doc,
      `Se muestran las primeras ${shown.length} de ${alerts.length} alertas. El archivo de Excel incluye la lista completa.`,
      {
        color: BRAND.muted,
        size: 8.5,
      },
    );
  }
  doc.y += 10;
}

// ---------------------------------------------------------------------------
// Closing page content
// ---------------------------------------------------------------------------

function drawClosing(doc: Doc, report: ReportData) {
  ensureSpace(doc, 180);
  doc.y += 6;
  subheading(doc, 'Notas');
  const notes = [
    'Tiempo en rango óptimo: porcentaje de lecturas entre el mínimo y el máximo configurados para cada galpón. El sensor mide a intervalos fijos, así que equivale al tiempo.',
    'Cobertura de datos: porcentaje de intervalos de 5 minutos con al menos una lectura. Un valor bajo indica cortes de luz o de internet en el galpón.',
    'Los ciclos y el tiempo de riego se cuentan cuando el riego se apaga, con la duración que reporta el equipo.',
    `Los umbrales son los vigentes al generar el reporte. Todas las horas están en ${TIMEZONE_LABEL.replace('Hora', 'hora')}.`,
  ];
  for (const note of notes) paragraph(doc, `•  ${note}`, { color: BRAND.muted, size: 8.5, gap: 3 });

  // Sign-off lines
  ensureSpace(doc, 80);
  const y = doc.y + 42;
  const width = (CONTENT_WIDTH - 40) / 2;
  [
    ['Elaborado por', report.generatedBy.name],
    ['Revisado por', ''],
  ].forEach(([label, name], i) => {
    const x = MARGIN.left + i * (width + 40);
    if (name)
      doc
        .font(FONT.regular)
        .fontSize(9.5)
        .fillColor(BRAND.ink)
        .text(name, x, y - 14, { width, lineBreak: false });
    doc
      .moveTo(x, y)
      .lineTo(x + width, y)
      .lineWidth(0.6)
      .strokeColor(BRAND.muted)
      .stroke();
    doc
      .font(FONT.regular)
      .fontSize(8)
      .fillColor(BRAND.muted)
      .text(label, x, y + 5, { width, lineBreak: false });
  });
  doc.y = y + 24;
}

/** Running header (from page 2) and footer with page numbers on every page. */
function drawPageChrome(doc: Doc, report: ReportData) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    if (i > range.start) {
      drawBrandMark(doc, MARGIN.left, 30, 16, BRAND.primary);
      doc.font(FONT.bold).fontSize(8.5).fillColor(BRAND.ink);
      doc.text(COMPANY_NAME, MARGIN.left + 22, 34, { lineBreak: false });
      doc.font(FONT.regular).fontSize(8).fillColor(BRAND.muted);
      doc.text(`${REPORT_TITLE} · ${formatPeriod(report.period)}`, MARGIN.left + 200, 34, {
        width: CONTENT_WIDTH - 200,
        align: 'right',
        lineBreak: false,
      });
      doc
        .moveTo(MARGIN.left, 54)
        .lineTo(PAGE.width - MARGIN.right, 54)
        .lineWidth(0.6)
        .strokeColor(BRAND.border)
        .stroke();
    }

    const footerY = PAGE.height - 36;
    doc
      .moveTo(MARGIN.left, footerY - 8)
      .lineTo(PAGE.width - MARGIN.right, footerY - 8)
      .lineWidth(0.6)
      .strokeColor(BRAND.border)
      .stroke();
    doc.font(FONT.regular).fontSize(7.5).fillColor(BRAND.muted);
    doc.text(
      `${COMPANY_NAME}  ·  Documento generado automáticamente  ·  ${report.code}`,
      MARGIN.left,
      footerY,
      {
        lineBreak: false,
      },
    );
    doc.text(
      `Página ${i - range.start + 1} de ${range.count}`,
      PAGE.width - MARGIN.right - 100,
      footerY,
      {
        width: 100,
        align: 'right',
        lineBreak: false,
      },
    );

    doc.page.margins.bottom = savedBottom;
  }
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

interface TableColumn {
  header: string;
  width: number;
  align?: 'left' | 'right' | 'center';
}

interface TableRow {
  cells: string[];
  colors?: Array<string | null>;
  muted?: boolean;
}

/** Zebra table; the header repeats on every page it spans. */
function table(doc: Doc, options: { columns: TableColumn[]; rows: TableRow[] }) {
  const headerHeight = 22;
  const rowHeight = 18;
  const padding = 6;

  const drawHeader = () => {
    const y = doc.y;
    doc.rect(MARGIN.left, y, CONTENT_WIDTH, headerHeight).fill(BRAND.primary);
    let x = MARGIN.left;
    doc.font(FONT.bold).fontSize(7.5).fillColor('#FFFFFF');
    for (const column of options.columns) {
      doc.text(column.header, x + padding, y + 7.5, {
        width: column.width - padding * 2,
        align: column.align ?? 'left',
        lineBreak: false,
      });
      x += column.width;
    }
    doc.y = y + headerHeight;
  };

  ensureSpace(doc, headerHeight + rowHeight * Math.min(3, Math.max(1, options.rows.length)));
  drawHeader();

  options.rows.forEach((row, index) => {
    if (doc.y + rowHeight > BOTTOM) {
      doc.addPage();
      drawHeader();
    }
    const y = doc.y;
    if (index % 2 === 1) doc.rect(MARGIN.left, y, CONTENT_WIDTH, rowHeight).fill(BRAND.zebra);
    doc
      .moveTo(MARGIN.left, y + rowHeight)
      .lineTo(MARGIN.left + CONTENT_WIDTH, y + rowHeight)
      .lineWidth(0.4)
      .strokeColor(BRAND.border)
      .stroke();

    let x = MARGIN.left;
    row.cells.forEach((cell, i) => {
      const column = options.columns[i];
      const color = row.colors?.[i];
      doc
        .font(color ? FONT.bold : FONT.regular)
        .fontSize(8.5)
        .fillColor(row.muted ? '#A8A097' : (color ?? BRAND.ink))
        .text(cell, x + padding, y + 5.5, {
          width: column.width - padding * 2,
          align: column.align ?? 'left',
          lineBreak: false,
          ellipsis: true,
        });
      x += column.width;
    });
    doc.y = y + rowHeight;
  });
  doc.x = MARGIN.left;
}

function sectionHeading(doc: Doc, title: string, subtitle?: string) {
  ensureSpace(doc, 70);
  doc
    .font(FONT.bold)
    .fontSize(16)
    .fillColor(BRAND.ink)
    .text(title, MARGIN.left, doc.y, { width: CONTENT_WIDTH });
  if (subtitle) {
    doc
      .font(FONT.regular)
      .fontSize(9.5)
      .fillColor(BRAND.muted)
      .text(subtitle, MARGIN.left, doc.y + 2, { width: CONTENT_WIDTH });
  }
  const y = doc.y + 8;
  doc
    .moveTo(MARGIN.left, y)
    .lineTo(MARGIN.left + 40, y)
    .lineWidth(2)
    .strokeColor(BRAND.primary)
    .stroke();
  doc.y = y + 16;
}

function subheading(doc: Doc, title: string) {
  ensureSpace(doc, 40);
  doc
    .font(FONT.bold)
    .fontSize(11)
    .fillColor(BRAND.primary)
    .text(title, MARGIN.left, doc.y, { width: CONTENT_WIDTH });
  doc.y += 6;
}

function paragraph(
  doc: Doc,
  text: string,
  options: { color?: string; size?: number; gap?: number } = {},
) {
  doc.font(FONT.regular).fontSize(options.size ?? 10);
  const height = doc.heightOfString(text, { width: CONTENT_WIDTH });
  ensureSpace(doc, height);
  doc
    .fillColor(options.color ?? BRAND.ink)
    .text(text, MARGIN.left, doc.y, { width: CONTENT_WIDTH, lineGap: 1.5 });
  doc.y += options.gap ?? 0;
}

function ensureSpace(doc: Doc, height: number) {
  if (doc.y + height > BOTTOM) doc.addPage();
}

/** The dashboard logo: a barn with a thermometer. */
function drawBrandMark(doc: Doc, x: number, y: number, size: number, color: string) {
  const barn = 'M4 14.5 16 5l12 9.5V27H4V14.5Z';
  doc.save();
  doc.translate(x, y).scale(size / 32);
  doc.path(barn).fillOpacity(0.18).fill(color);
  doc.fillOpacity(1);
  doc.path(barn).lineWidth(2).lineJoin('round').strokeColor(color).stroke();
  doc.moveTo(16, 12).lineTo(16, 20.2).lineWidth(2).lineCap('round').strokeColor(color).stroke();
  doc.circle(16, 21.5, 2.6).fill(color);
  doc.restore();
}

/** Local-time tick marks: hours for one day, days or weeks for longer periods. */
function timeTicks(fromMs: number, toMs: number): Array<{ at: number; label: string }> {
  const days = (toMs - fromMs) / DAY_MS;
  const ticks: Array<{ at: number; label: string }> = [];
  if (days <= 1) {
    for (let at = fromMs; at <= toMs; at += 3 * 60 * 60 * 1000)
      ticks.push({ at, label: formatTime(new Date(at)) });
    return ticks;
  }
  const everyDays = days <= 10 ? 1 : days <= 21 ? 2 : days <= 45 ? 7 : 14;
  for (let at = fromMs; at <= toMs; at += everyDays * DAY_MS) {
    const local = new Date(at + GT_OFFSET_MS);
    ticks.push({
      at,
      label: `${String(local.getUTCDate()).padStart(2, '0')}/${String(local.getUTCMonth() + 1).padStart(2, '0')}`,
    });
  }
  return ticks;
}

function describeBucket(seconds: number): string {
  const minutes = seconds / 60;
  const label =
    minutes < 60 ? `${minutes} minutos` : minutes === 60 ? '1 hora' : `${minutes / 60} horas`;
  return `Cada punto resume ${label} de lecturas.`;
}

const alertCount = (stats: PeriodStats) =>
  stats.heatAlerts + stats.prolongedIrrigationAlerts + stats.sensorErrors;

function shareColor(share: number | null): string | null {
  if (share === null) return null;
  if (share >= 0.8) return BRAND.optimal;
  if (share >= 0.5) return BRAND.warm;
  return BRAND.alert;
}

function coverageColor(coverage: number | null): string | null {
  if (coverage === null) return null;
  return coverage >= 0.95 ? BRAND.optimal : coverage >= 0.8 ? BRAND.warm : BRAND.alert;
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} y ${items.at(-1)}`;
}

function describeShed(device: { name: string; shed: string }): string {
  return device.shed === device.name ? device.name : `${device.name} · ${device.shed}`;
}

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
