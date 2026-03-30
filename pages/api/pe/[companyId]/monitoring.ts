import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '../../../../lib/authMiddleware';
import { getCompanyById, getMonitoring, upsertMonitoring } from '../../../../lib/pe/queries';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req;
  const { companyId } = req.query;

  if (!companyId || typeof companyId !== 'string') {
    return res.status(400).json({ error: 'Company ID is required' });
  }

  try {
    // Verify company exists
    const company = await getCompanyById(companyId);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    switch (method) {
      case 'GET': {
        const monitoring = await getMonitoring(companyId);
        return res.status(200).json({ monitoring });
      }

      case 'PUT': {
        const {
          latestEarningsUpdate,
          latestEarningsDate,
          managementGuidance,
          guidanceVsActual,
          guidanceVsActualNotes,
          fy26AnnualReportReceived,
          fy26AnnualReportDate,
          lastAuditedFinancialsReceived,
          latestDeckReceived,
          latestDeckName,
        } = req.body;

        const monitoring = await upsertMonitoring(companyId, {
          latestEarningsUpdate,
          latestEarningsDate,
          managementGuidance,
          guidanceVsActual,
          guidanceVsActualNotes,
          fy26AnnualReportReceived,
          fy26AnnualReportDate,
          lastAuditedFinancialsReceived,
          latestDeckReceived,
          latestDeckName,
        });

        return res.status(200).json({ monitoring });
      }

      default:
        res.setHeader('Allow', ['GET', 'PUT']);
        return res.status(405).json({ error: `Method ${method} Not Allowed` });
    }
  } catch (error) {
    console.error('PE Monitoring API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withAuth(handler);
