import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '../../../../lib/authMiddleware';
import { getCompanyById, updateInvestment } from '../../../../lib/pe/queries';
import { calculateMetrics } from '../../../../lib/pe/calculations';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req;
  const { companyId } = req.query;

  if (!companyId || typeof companyId !== 'string') {
    return res.status(400).json({ error: 'Company ID is required' });
  }

  try {
    const company = await getCompanyById(companyId);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    switch (method) {
      case 'GET': {
        const metrics = calculateMetrics(company);
        return res.status(200).json({ company, metrics });
      }

      case 'PUT': {
        const {
          investedValue, pricePerShare, currentPricePerShare, quantityHeld,
          investmentDate, investmentValuation, currency,
        } = req.body;

        if (investedValue === undefined || investedValue === null) {
          return res.status(400).json({ error: 'Invested value is required' });
        }

        const derivedCurrentValue =
          currentPricePerShare != null && quantityHeld != null
            ? currentPricePerShare * quantityHeld
            : null;

        const derivedOwnership =
          investmentValuation != null && investmentValuation > 0 && investedValue != null
            ? (investedValue / investmentValuation) * 100
            : null;

        const updated = await updateInvestment(companyId, {
          investedValue,
          currentValue: derivedCurrentValue,
          pricePerShare,
          currentPricePerShare,
          quantityHeld,
          ownershipPercentage: derivedOwnership,
          investmentDate,
          investmentValuation,
          currency,
        });
        const metrics = calculateMetrics(updated);
        return res.status(200).json({ company: updated, metrics });
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
