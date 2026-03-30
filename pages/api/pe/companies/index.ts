import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth, AuthenticatedRequest } from '../../../../lib/authMiddleware';
import { listCompanies, createCompany, getCompanyByCode } from '../../../../lib/pe/queries';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req;
  const userEmail = (req as AuthenticatedRequest).user.email;

  try {
    switch (method) {
      case 'GET': {
        const companies = await listCompanies();
        return res.status(200).json(companies);
      }

      case 'POST': {
        const { companyName, companyCode, sector, subSector, website, description } = req.body;

        if (!companyName || !companyCode) {
          return res.status(400).json({ error: 'Company name and code are required' });
        }

        // Check if company code already exists
        const existing = await getCompanyByCode(companyCode);
        if (existing) {
          return res.status(409).json({ error: 'Company with this code already exists' });
        }

        const company = await createCompany(
          { companyName, companyCode, sector, subSector, website, description },
          userEmail
        );

        return res.status(201).json(company);
      }

      default:
        res.setHeader('Allow', ['GET', 'POST']);
        return res.status(405).json({ error: `Method ${method} Not Allowed` });
    }
  } catch (error) {
    console.error('PE Companies API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withAuth(handler);
