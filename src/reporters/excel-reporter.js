const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

function flattenStepTitles(steps, titles = []) {
  for (const step of steps || []) {
    if (!step) {
      continue;
    }

    if (step.category === 'test.step' && step.title) {
      titles.push(step.title);
    }

    if (step.steps && step.steps.length > 0) {
      flattenStepTitles(step.steps, titles);
    }
  }

  return titles;
}

class ExcelReporter {
  constructor(options = {}) {
    this.outputFile = options.outputFile || './artifacts/reports/excel/test-execution-report.xlsx';
    this.rows = [];
    this.startedAt = null;
  }

  onBegin() {
    this.startedAt = new Date();
    this.rows = [];
  }

  onTestEnd(test, result) {
    const relativeFile = path.relative(process.cwd(), test.location.file);
    const steps = flattenStepTitles(result.steps);
    const errorMessage = result.error?.message || result.errors?.map((error) => error.message).filter(Boolean).join('\n\n') || '';

    this.rows.push({
      TestCase: test.title,
      Suite: test.parent?.title || '',
      Project: test.parent?.project()?.name || '',
      File: relativeFile,
      Line: test.location.line,
      Status: result.status,
      Steps: steps.length > 0 ? steps.join(' -> ') : 'No explicit test.step blocks recorded',
      DurationMs: result.duration,
      Retries: result.retry,
      StartedAt: this.startedAt ? this.startedAt.toISOString() : '',
      FinishedAt: new Date().toISOString(),
      Error: errorMessage,
    });
  }

  async onEnd(result) {
    const workbook = new ExcelJS.Workbook();
    const summaryRows = [
      {
        OverallStatus: result.status,
        GeneratedAt: new Date().toISOString(),
        TotalTests: this.rows.length,
        Passed: this.rows.filter((row) => row.Status === 'passed').length,
        Failed: this.rows.filter((row) => row.Status === 'failed').length,
        TimedOut: this.rows.filter((row) => row.Status === 'timedOut').length,
        Skipped: this.rows.filter((row) => row.Status === 'skipped').length,
        Interrupted: this.rows.filter((row) => row.Status === 'interrupted').length,
      },
    ];

    const executionRows = this.rows.length > 0 ? this.rows : [{
      TestCase: 'No tests executed',
      Suite: '',
      Project: '',
      File: '',
      Line: '',
      Status: result.status,
      Steps: '',
      DurationMs: 0,
      Retries: 0,
      StartedAt: this.startedAt ? this.startedAt.toISOString() : '',
      FinishedAt: new Date().toISOString(),
      Error: '',
    }];

    const summarySheet = workbook.addWorksheet('Summary');
    const executionSheet = workbook.addWorksheet('Test Results');

    const summaryHeaders = Object.keys(summaryRows[0]);
    summarySheet.addRow(summaryHeaders);
    summarySheet.addRow(summaryHeaders.map((header) => summaryRows[0][header]));
    summarySheet.getRow(1).font = { bold: true };
    summarySheet.views = [{ state: 'frozen', ySplit: 1 }];

    executionSheet.columns = Object.keys(executionRows[0]).map((key) => ({
      header: key,
      key,
      width: key === 'Error' ? 60 : 24,
    }));
    executionRows.forEach((row) => executionSheet.addRow(row));
    executionSheet.getRow(1).font = { bold: true };
    executionSheet.views = [{ state: 'frozen', ySplit: 1 }];
    executionSheet.autoFilter = {
      from: 'A1',
      to: `${String.fromCharCode(64 + executionSheet.columnCount)}1`,
    };

    const outputPath = path.resolve(process.cwd(), this.outputFile);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    await workbook.xlsx.writeFile(outputPath);
  }
}

module.exports = ExcelReporter;