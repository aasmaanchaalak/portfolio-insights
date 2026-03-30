import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '../../../../lib/authMiddleware';
import { getCompanyById, getInvestment, upsertInvestment } from '../../../../lib/pe/queries';
import { calculateMetrics } from '../../../../lib/pe/calculations';

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
        const investment = await getInvestment(companyId);
        const metrics = calculateMetrics(investment);

        return res.status(200).json({
          investment,
          metrics,
        });
      }

      case 'PUT': {
        const {
          investedValue,
          currentValue,
          pricePerShare,
          quantityHeld,
          ownershipPercentage,
          investmentDate,
          lastValuationDate,
          valuationSource,
          currency,
        } = req.body;

        if (investedValue === undefined || investedValue === null) {
          return res.status(400).json({ error: 'Invested value is required' });
        }

        const investment = await upsertInvestment(companyId, {
          investedValue,
          currentValue,
          pricePerShare,
          quantityHeld,
          ownershipPercentage,
          investmentDate,
          lastValuationDate,
          valuationSource,
          currency,
        });

        const metrics = calculateMetrics(investment);

        return res.status(200).json({
          investment,
          metrics,
        });
      }

      default:
        res.setHeader('Allow', ['GET', 'PUT']);
        return res.status(405).json({ error: `Method ${method} Not Allowed` });
    }
  } catch (error) {
    console.error('PE Overview API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withAuth(handler);
