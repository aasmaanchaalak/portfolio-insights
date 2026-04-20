// Private Equity Access Control

import { PEContact, PEBroker } from '../../types/pe';

const ADMIN_EMAIL = 'aditya@saguncapital.com';

export function isAdmin(userEmail: string | undefined): boolean {
  return userEmail === ADMIN_EMAIL;
}

export function canAccessSensitiveData(userEmail: string | undefined): boolean {
  return isAdmin(userEmail);
}

export function canModifySensitiveData(userEmail: string | undefined): boolean {
  return isAdmin(userEmail);
}

export function sanitizeContact(contact: PEContact, userEmail: string | undefined): PEContact {
  if (canAccessSensitiveData(userEmail)) return contact;
  return {
    ...contact,
    email: contact.email ? '[RESTRICTED]' : null,
    phone: contact.phone ? '[RESTRICTED]' : null,
    alternatePhone: contact.alternatePhone ? '[RESTRICTED]' : null,
  };
}

export function sanitizeContacts(contacts: PEContact[], userEmail: string | undefined): PEContact[] {
  return contacts.map(contact => sanitizeContact(contact, userEmail));
}

export function sanitizeBroker(broker: PEBroker | null, userEmail: string | undefined): PEBroker | null {
  if (!broker) return null;
  if (canAccessSensitiveData(userEmail)) return broker;
  return {
    ...broker,
    brokerEmail: broker.brokerEmail ? '[RESTRICTED]' : null,
    brokerPhone: broker.brokerPhone ? '[RESTRICTED]' : null,
  };
}
