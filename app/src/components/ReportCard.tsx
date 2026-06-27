import type { CareReport } from '../report';

interface ReportCardProps {
  report: CareReport;
  audienceLabel: string;
}

export function ReportCard({ report, audienceLabel }: ReportCardProps) {
  return (
    <div className="report-card">
      <div className="report-head">
        <span className="report-title">{report.title}</span>
        <span className="report-audience">{audienceLabel}</span>
      </div>
      <p className="report-summary">{report.summaryJa}</p>
      {report.bullets && report.bullets.length > 0 && (
        <ul className="report-bullets">
          {report.bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      )}
      {report.suggestion && <p className="report-suggestion">{report.suggestion}</p>}
      {report.disclaimer && <p className="report-disclaimer">{report.disclaimer}</p>}
      <p className="report-credit">🧠 Gemini 3.5（Google Cloud Vertex AI）による要約</p>
    </div>
  );
}
