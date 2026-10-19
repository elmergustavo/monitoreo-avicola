import ExcelJS from 'exceljs';
import {
  BRAND,
  COMPANY_NAME,
  EVENT_LABELS,
  formatDateTime,
  formatPeriod,
  REPORT_TITLE,
  SYSTEM_NAME,
  TIMEZONE_LABEL,
  toLocalWallClock,
  ALERT_EVENT_TYPES,
} from '../report.format.js';
import type { ReportData, ReportReading } from '../report.types.js';

const argb = (hex: string) => `FF${hex.slice(1)}`;
const FONT = 'Calibri';

const FMT = {
  temp: '0.0',
  percent: '0.0%',
  integer: '#,##0',
  minutes: '#,##0',
  dateTime: 'dd/mm/yyyy hh:mm',
  date: 'dd/mm/yyyy',
};

interface Column {
  header: string;
  key: string;
  width: number;
  numFmt?: string;
}

/** Builds the spreadsheet: summary, one row per day, events and readings. */
export async function renderExcel(
  report: ReportData,
  readings: { bucketSeconds: number; rows: ReportReading[] },
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = COMPANY_NAME;
  workbook.company = COMPANY_NAME;
  workbook.title = `${REPORT_TITLE} · ${formatPeriod(report.period)}`;
  workbook.subject = SYSTEM_NAME;
  workbook.created = report.generatedAt;

  addSummarySheet(workbook, report);
  addDailySheet(workbook, report);
  addEventsSheet(workbook, report);
  addReadingsSheet(workbook, report, readings);

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function addSummarySheet(workbook: ExcelJS.Workbook, report: ReportData) {
  const sheet = workbook.addWorksheet('Resumen', {
    views: [{ showGridLines: false }],
    properties: { tabColor: { argb: argb(BRAND.primary) } },
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9,
    },
  });
  const lastColumn = 15;
  sheet.columns = [
    { width: 22 },
    { width: 24 },
    ...Array.from({ length: lastColumn - 2 }, () => ({ width: 13 })),
  ];

  // Letterhead
  sheet.mergeCells(1, 1, 1, lastColumn);
  const company = sheet.getCell(1, 1);
  company.value = COMPANY_NAME;
  company.font = { name: FONT, size: 18, bold: true, color: { argb: 'FFFFFFFF' } };
  company.fill = solid(BRAND.primary);
  company.alignment = { vertical: 'middle', indent: 1 };
  sheet.getRow(1).height = 34;

  sheet.mergeCells(2, 1, 2, lastColumn);
  const subtitle = sheet.getCell(2, 1);
  subtitle.value = `${REPORT_TITLE}  ·  ${SYSTEM_NAME}`;
  subtitle.font = { name: FONT, size: 11, color: { argb: 'FFFFFFFF' } };
  subtitle.fill = solid(BRAND.primary);
  subtitle.alignment = { vertical: 'middle', indent: 1 };
  sheet.getRow(2).height = 20;

  const scope =
    report.scopeDeviceId && report.devices[0]
      ? report.devices[0].name === report.devices[0].shed
        ? report.devices[0].name
        : `${report.devices[0].name} (${report.devices[0].shed})`
      : `Todos los galpones activos (${report.devices.length})`;
  const meta: Array<[string, string]> = [
    [
      'Periodo',
      `${formatPeriod(report.period)} · ${report.period.days} ${report.period.days === 1 ? 'día' : 'días'}`,
    ],
    ['Galpones', scope],
    ['Generado por', `${report.generatedBy.name} (${report.generatedBy.email})`],
    ['Fecha de generación', formatDateTime(report.generatedAt)],
    ['Código de reporte', report.code],
    ['Zona horaria', TIMEZONE_LABEL],
  ];
  let row = 4;
  for (const [label, value] of meta) {
    sheet.getCell(row, 1).value = label;
    sheet.getCell(row, 1).font = { name: FONT, bold: true, color: { argb: argb(BRAND.muted) } };
    sheet.mergeCells(row, 2, row, 8);
    sheet.getCell(row, 2).value = value;
    sheet.getCell(row, 2).font = { name: FONT, color: { argb: argb(BRAND.ink) } };
    row++;
  }

  // Indicators per shed
  row += 1;
  sectionTitle(sheet, row, 'Indicadores del periodo', lastColumn);
  row += 1;
  const indicatorColumns: Column[] = [
    { header: 'Galpón', key: 'name', width: 22 },
    { header: 'Ubicación', key: 'shed', width: 24 },
    { header: 'Lecturas', key: 'readings', width: 13, numFmt: FMT.integer },
    { header: 'Cobertura de datos', key: 'coverage', width: 13, numFmt: FMT.percent },
    { header: 'Promedio (°C)', key: 'average', width: 13, numFmt: FMT.temp },
    { header: 'Mínima (°C)', key: 'min', width: 13, numFmt: FMT.temp },
    { header: 'Máxima (°C)', key: 'max', width: 13, numFmt: FMT.temp },
    { header: 'En rango óptimo', key: 'optimal', width: 13, numFmt: FMT.percent },
    { header: 'Bajo el mínimo', key: 'below', width: 13, numFmt: FMT.percent },
    { header: 'Sobre el máximo', key: 'above', width: 13, numFmt: FMT.percent },
    { header: 'En alerta', key: 'alert', width: 13, numFmt: FMT.percent },
    { header: 'Ciclos de riego', key: 'cycles', width: 13, numFmt: FMT.integer },
    { header: 'Minutos de riego', key: 'minutes', width: 13, numFmt: FMT.minutes },
    { header: 'Alertas de calor', key: 'heat', width: 13, numFmt: FMT.integer },
    { header: 'Errores del sensor', key: 'sensor', width: 13, numFmt: FMT.integer },
  ];
  headerRow(
    sheet,
    row,
    indicatorColumns.map((c) => c.header),
  );
  row++;
  for (const [index, device] of report.devices.entries()) {
    const t = device.totals;
    const values = [
      device.name,
      device.shed,
      t.readings,
      t.coverage,
      t.average,
      t.min,
      t.max,
      t.optimalShare,
      t.belowShare,
      t.aboveShare,
      t.alertShare,
      t.irrigationCycles,
      t.irrigationMinutes,
      t.heatAlerts,
      t.sensorErrors,
    ];
    bodyRow(sheet, row, values, indicatorColumns, index);
    row++;
  }

  // Thresholds
  row += 1;
  sectionTitle(sheet, row, 'Umbrales configurados', lastColumn);
  row += 1;
  const thresholdColumns: Column[] = [
    { header: 'Galpón', key: 'name', width: 22 },
    { header: 'Ubicación', key: 'shed', width: 24 },
    { header: 'Mínimo óptimo (°C)', key: 'min', width: 13, numFmt: FMT.temp },
    { header: 'Máximo óptimo (°C)', key: 'max', width: 13, numFmt: FMT.temp },
    { header: 'Alerta (°C)', key: 'alert', width: 13, numFmt: FMT.temp },
  ];
  headerRow(
    sheet,
    row,
    thresholdColumns.map((c) => c.header),
  );
  row++;
  for (const [index, device] of report.devices.entries()) {
    const { tempMin, tempMax, tempAlert } = device.thresholds;
    bodyRow(
      sheet,
      row,
      [device.name, device.shed, tempMin, tempMax, tempAlert],
      thresholdColumns,
      index,
    );
    row++;
  }

  // Definitions
  row += 1;
  sectionTitle(sheet, row, 'Notas', lastColumn);
  row += 1;
  const notes = [
    'En rango óptimo: lecturas entre el mínimo y el máximo óptimo de cada galpón. El sensor mide a intervalos fijos, así que el porcentaje equivale al tiempo.',
    'En alerta: lecturas iguales o mayores a la temperatura de alerta.',
    'Cobertura de datos: porcentaje de intervalos de 5 minutos con al menos una lectura. Un valor bajo indica cortes de luz o de internet.',
    'Ciclos y minutos de riego: se cuentan al apagarse el riego, con la duración que reporta el equipo.',
    'Los umbrales son los vigentes al generar el reporte.',
  ];
  for (const note of notes) {
    sheet.mergeCells(row, 1, row, lastColumn);
    const cell = sheet.getCell(row, 1);
    cell.value = `•  ${note}`;
    cell.font = { name: FONT, size: 10, color: { argb: argb(BRAND.muted) } };
    cell.alignment = { wrapText: true, vertical: 'top' };
    row++;
  }
}

function addDailySheet(workbook: ExcelJS.Workbook, report: ReportData) {
  const columns: Column[] = [
    { header: 'Galpón', key: 'device', width: 18 },
    { header: 'Fecha', key: 'date', width: 13, numFmt: FMT.date },
    { header: 'Lecturas', key: 'readings', width: 11, numFmt: FMT.integer },
    { header: 'Cobertura', key: 'coverage', width: 11, numFmt: FMT.percent },
    { header: 'Promedio (°C)', key: 'average', width: 13, numFmt: FMT.temp },
    { header: 'Mínima (°C)', key: 'min', width: 12, numFmt: FMT.temp },
    { header: 'Máxima (°C)', key: 'max', width: 12, numFmt: FMT.temp },
    { header: 'En rango óptimo', key: 'optimal', width: 15, numFmt: FMT.percent },
    { header: 'Bajo el mínimo', key: 'below', width: 14, numFmt: FMT.percent },
    { header: 'Sobre el máximo', key: 'above', width: 15, numFmt: FMT.percent },
    { header: 'En alerta', key: 'alert', width: 11, numFmt: FMT.percent },
    { header: 'Ciclos de riego', key: 'cycles', width: 14, numFmt: FMT.integer },
    { header: 'Minutos de riego', key: 'minutes', width: 15, numFmt: FMT.minutes },
    { header: 'Alertas de calor', key: 'heat', width: 15, numFmt: FMT.integer },
    { header: 'Riego prolongado', key: 'prolonged', width: 16, numFmt: FMT.integer },
    { header: 'Errores del sensor', key: 'sensor', width: 16, numFmt: FMT.integer },
  ];
  const sheet = dataSheet(workbook, 'Resumen diario', columns);

  let row = 2;
  for (const device of report.devices) {
    for (const day of device.daily) {
      const [y, m, d] = day.date.split('-').map(Number);
      bodyRow(
        sheet,
        row,
        [
          device.name,
          new Date(Date.UTC(y, m - 1, d)),
          day.readings,
          day.coverage,
          day.average,
          day.min,
          day.max,
          day.optimalShare,
          day.belowShare,
          day.aboveShare,
          day.alertShare,
          day.irrigationCycles,
          day.irrigationMinutes,
          day.heatAlerts,
          day.prolongedIrrigationAlerts,
          day.sensorErrors,
        ],
        columns,
        row,
      );
      row++;
    }
  }

  if (row > 2) {
    // Green bar for the share of time in range makes good and bad days stand out.
    sheet.addConditionalFormatting({
      ref: `H2:H${row - 1}`,
      rules: [
        {
          type: 'dataBar',
          priority: 1,
          minLength: 0,
          maxLength: 100,
          cfvo: [
            { type: 'num', value: 0 },
            { type: 'num', value: 1 },
          ],
          color: { argb: argb('#8FC4A0') },
          gradient: false,
        } as ExcelJS.DataBarRuleType,
      ],
    });
    sheet.addConditionalFormatting({
      ref: `N2:P${row - 1}`,
      rules: [
        {
          type: 'cellIs',
          operator: 'greaterThan',
          formulae: ['0'],
          priority: 2,
          style: { font: { color: { argb: argb(BRAND.alert) }, bold: true } },
        },
      ],
    });
  }
}

function addEventsSheet(workbook: ExcelJS.Workbook, report: ReportData) {
  const columns: Column[] = [
    { header: 'Fecha y hora', key: 'at', width: 18, numFmt: FMT.dateTime },
    { header: 'Galpón', key: 'device', width: 18 },
    { header: 'Evento', key: 'type', width: 26 },
    { header: 'Tipo', key: 'kind', width: 12 },
    { header: 'Temperatura (°C)', key: 'temperature', width: 16, numFmt: FMT.temp },
    { header: 'Duración (min)', key: 'duration', width: 15, numFmt: '0.0' },
  ];
  const sheet = dataSheet(workbook, 'Eventos', columns);

  const events = report.devices
    .flatMap((device) => device.events.map((event) => ({ ...event, device: device.name })))
    .sort((a, b) => a.at.getTime() - b.at.getTime());

  let row = 2;
  for (const event of events) {
    const isAlert = ALERT_EVENT_TYPES.includes(event.type);
    bodyRow(
      sheet,
      row,
      [
        toLocalWallClock(event.at),
        event.device,
        EVENT_LABELS[event.type],
        isAlert ? 'Alerta' : 'Operación',
        event.temperature,
        event.durationMin,
      ],
      columns,
      row,
    );
    if (isAlert)
      sheet.getCell(row, 3).font = { name: FONT, bold: true, color: { argb: argb(BRAND.alert) } };
    row++;
  }
  if (events.length === 0) emptyRow(sheet, 2, columns.length, 'Sin eventos en el periodo.');
  if (report.devices.some((d) => d.eventsTruncated)) {
    emptyRow(
      sheet,
      row + 1,
      columns.length,
      'Se alcanzó el límite de 5,000 eventos por galpón; acorta el periodo para ver el resto.',
    );
  }
}

function addReadingsSheet(
  workbook: ExcelJS.Workbook,
  report: ReportData,
  readings: { bucketSeconds: number; rows: ReportReading[] },
) {
  const aggregated = readings.bucketSeconds > 0;
  const columns: Column[] = aggregated
    ? [
        { header: 'Fecha y hora', key: 'at', width: 18, numFmt: FMT.dateTime },
        { header: 'Galpón', key: 'device', width: 18 },
        { header: 'Promedio (°C)', key: 'temperature', width: 14, numFmt: '0.00' },
        { header: 'Mínima (°C)', key: 'min', width: 13, numFmt: '0.00' },
        { header: 'Máxima (°C)', key: 'max', width: 13, numFmt: '0.00' },
        { header: 'Riego', key: 'irrigation', width: 10 },
      ]
    : [
        { header: 'Fecha y hora', key: 'at', width: 18, numFmt: 'dd/mm/yyyy hh:mm:ss' },
        { header: 'Galpón', key: 'device', width: 18 },
        { header: 'Temperatura (°C)', key: 'temperature', width: 16, numFmt: '0.00' },
        { header: 'Riego', key: 'irrigation', width: 10 },
      ];
  const sheet = dataSheet(workbook, 'Lecturas', columns, false);

  let row = 2;
  for (const reading of readings.rows) {
    const values = aggregated
      ? [
          toLocalWallClock(reading.at),
          reading.deviceName,
          reading.temperature,
          reading.min,
          reading.max,
          reading.irrigation ? 'Sí' : 'No',
        ]
      : [
          toLocalWallClock(reading.at),
          reading.deviceName,
          reading.temperature,
          reading.irrigation ? 'Sí' : 'No',
        ];
    const excelRow = sheet.getRow(row);
    excelRow.values = values;
    columns.forEach((column, i) => {
      if (column.numFmt) excelRow.getCell(i + 1).numFmt = column.numFmt;
    });
    row++;
  }
  if (readings.rows.length === 0) emptyRow(sheet, 2, columns.length, 'Sin lecturas en el periodo.');
  if (aggregated) {
    sheet.getCell(1, columns.length + 2).value =
      `Periodo mayor a 7 días: cada fila es el promedio de 5 minutos (${report.period.days} días).`;
    sheet.getCell(1, columns.length + 2).font = {
      name: FONT,
      italic: true,
      color: { argb: argb(BRAND.muted) },
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function solid(hex: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(hex) } };
}

const thinBorder: Partial<ExcelJS.Borders> = {
  bottom: { style: 'thin', color: { argb: argb(BRAND.border) } },
};

/** Sheet with a frozen, filterable header row. */
function dataSheet(workbook: ExcelJS.Workbook, name: string, columns: Column[], filter = true) {
  const sheet = workbook.addWorksheet(name, {
    views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9,
    },
    headerFooter: { oddFooter: `&L${COMPANY_NAME}&RPágina &P de &N` },
  });
  sheet.columns = columns.map(({ key, width }) => ({ key, width }));
  headerRow(
    sheet,
    1,
    columns.map((c) => c.header),
  );
  if (filter)
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  sheet.pageSetup.printTitlesRow = '1:1';
  return sheet;
}

function sectionTitle(sheet: ExcelJS.Worksheet, row: number, title: string, lastColumn: number) {
  sheet.mergeCells(row, 1, row, lastColumn);
  const cell = sheet.getCell(row, 1);
  cell.value = title;
  cell.font = { name: FONT, size: 13, bold: true, color: { argb: argb(BRAND.primary) } };
  cell.border = { bottom: { style: 'medium', color: { argb: argb(BRAND.primary) } } };
  sheet.getRow(row).height = 22;
}

function headerRow(sheet: ExcelJS.Worksheet, row: number, headers: string[]) {
  const excelRow = sheet.getRow(row);
  excelRow.height = 32;
  headers.forEach((header, i) => {
    const cell = excelRow.getCell(i + 1);
    cell.value = header;
    cell.font = { name: FONT, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = solid(BRAND.primary);
    cell.alignment = { vertical: 'middle', horizontal: i < 2 ? 'left' : 'center', wrapText: true };
  });
}

function bodyRow(
  sheet: ExcelJS.Worksheet,
  row: number,
  values: Array<string | number | Date | null>,
  columns: Column[],
  index: number,
) {
  const excelRow = sheet.getRow(row);
  values.forEach((value, i) => {
    const cell = excelRow.getCell(i + 1);
    cell.value = value;
    cell.font = { name: FONT, color: { argb: argb(BRAND.ink) } };
    cell.border = thinBorder;
    if (columns[i]?.numFmt) cell.numFmt = columns[i].numFmt;
    if (index % 2 === 1) cell.fill = solid(BRAND.zebra);
  });
}

function emptyRow(sheet: ExcelJS.Worksheet, row: number, span: number, text: string) {
  sheet.mergeCells(row, 1, row, span);
  const cell = sheet.getCell(row, 1);
  cell.value = text;
  cell.font = { name: FONT, italic: true, color: { argb: argb(BRAND.muted) } };
}
