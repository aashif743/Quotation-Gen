import React from 'react';
import { JobCardStatus, JOB_CARD_STATUS_LABELS } from '../../types/jobCards';

const STYLES: Record<JobCardStatus, string> = {
  pending: 'bg-amber-100 text-amber-700',
  in_progress: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-gray-200 text-gray-600',
};

const JobCardStatusBadge: React.FC<{ status?: JobCardStatus | null }> = ({ status }) => {
  const s: JobCardStatus = status && STYLES[status] ? status : 'pending';
  return (
    <span className={`inline-flex items-center text-xs font-semibold px-2 py-1 rounded-full ${STYLES[s]}`}>
      {JOB_CARD_STATUS_LABELS[s]}
    </span>
  );
};

export default JobCardStatusBadge;
