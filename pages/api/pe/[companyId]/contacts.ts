import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth, AuthenticatedRequest } from '../../../../lib/authMiddleware';
import {
  getCompanyById,
  getContacts,
  createContact,
  updateContact,
  deleteContact,
} from '../../../../lib/pe/queries';
import { sanitizeContacts, canModifySensitiveData } from '../../../../lib/pe/accessControl';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req;
  const { companyId, contactId } = req.query;
  const userEmail = (req as AuthenticatedRequest).user.email;

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
        const contacts = await getContacts(companyId);
        const sanitizedContacts = sanitizeContacts(contacts, userEmail);
        return res.status(200).json({ contacts: sanitizedContacts });
      }

      case 'POST': {
        // Only admin can create contacts
        if (!canModifySensitiveData(userEmail)) {
          return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
        }

        const {
          contactType,
          name,
          designation,
          email,
          phone,
          alternatePhone,
          notes,
          isPrimary,
        } = req.body;

        if (!contactType || !name) {
          return res.status(400).json({ error: 'Contact type and name are required' });
        }

        const contact = await createContact(companyId, {
          contactType,
          name,
          designation,
          email,
          phone,
          alternatePhone,
          notes,
          isPrimary,
        });

        return res.status(201).json({ contact });
      }

      case 'PUT': {
        // Only admin can update contacts
        if (!canModifySensitiveData(userEmail)) {
          return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
        }

        if (!contactId || typeof contactId !== 'string') {
          return res.status(400).json({ error: 'Contact ID is required' });
        }

        const {
          contactType,
          name,
          designation,
          email,
          phone,
          alternatePhone,
          notes,
          isPrimary,
          lastCommunicationDate,
        } = req.body;

        const contact = await updateContact(contactId, {
          contactType,
          name,
          designation,
          email,
          phone,
          alternatePhone,
          notes,
          isPrimary,
          lastCommunicationDate,
        });

        if (!contact) {
          return res.status(404).json({ error: 'Contact not found' });
        }

        return res.status(200).json({ contact });
      }

      case 'DELETE': {
        // Only admin can delete contacts
        if (!canModifySensitiveData(userEmail)) {
          return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
        }

        if (!contactId || typeof contactId !== 'string') {
          return res.status(400).json({ error: 'Contact ID is required' });
        }

        const deleted = await deleteContact(contactId);

        if (!deleted) {
          return res.status(404).json({ error: 'Contact not found' });
        }

        return res.status(200).json({ success: true });
      }

      default:
        res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
        return res.status(405).json({ error: `Method ${method} Not Allowed` });
    }
  } catch (error) {
    console.error('PE Contacts API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withAuth(handler);
