import React from 'react';
import { Company } from '../../types';
import { Payslip } from '../../types/payroll';
import { generateDocumentPDF, pdfFileSegment } from '../../utils/pdfGenerator';

// Render a document off-screen, wait for its images, capture `.payslip-document`
// to PDF, then clean up. Callers must make sure no other `.payslip-document`
// is mounted (on-screen previews use a different root class).
async function renderAndCapture(element: React.ReactElement, filename: string): Promise<void> {
  const { createRoot } = await import('react-dom/client');
  const holder = document.createElement('div');
  holder.style.position = 'fixed';
  holder.style.left = '-10000px';
  holder.style.top = '0';
  holder.style.width = '820px';
  document.body.appendChild(holder);
  const root = createRoot(holder);
  try {
    await new Promise<void>((resolve) => {
      root.render(element);
      setTimeout(resolve, 60);
    });
    // Give the logo a moment to load so it's in the capture.
    const imgs = Array.from(holder.querySelectorAll('img')).filter((img) => !img.complete);
    if (imgs.length) {
      await Promise.race([
        Promise.all(imgs.map((img) => new Promise<void>((res) => {
          img.addEventListener('load', () => res(), { once: true });
          img.addEventListener('error', () => res(), { once: true });
        }))),
        new Promise<void>((res) => setTimeout(res, 3000)),
      ]);
    }
    await generateDocumentPDF('.payslip-document', filename);
  } finally {
    root.unmount();
    document.body.removeChild(holder);
  }
}

export async function downloadPayslipPdf(slip: Payslip, company: Company, employeeTpin?: string | null): Promise<void> {
  const PayslipDocument = (await import('./PayslipDocument')).default;
  await renderAndCapture(
    React.createElement(PayslipDocument, { slip, company, employeeTpin }),
    `Payslip_${slip.period}_${pdfFileSegment(slip.employee_name)}.pdf`,
  );
}

export async function downloadPayrollSummaryPdf(period: string, slips: Payslip[], company: Company): Promise<void> {
  const PayrollSummaryDocument = (await import('./PayrollSummaryDocument')).default;
  await renderAndCapture(
    React.createElement(PayrollSummaryDocument, { period, slips, company }),
    `Payroll_${period}_${pdfFileSegment(company.name)}.pdf`,
  );
}
