// Private Equity Access Control

import { PEContact, PEBroker } from '../../types/pe';

// Contact and broker details are admin-only; `isAdmin` is the caller's flag.
export function canAccessSensitiveData(isAdmin: boolean): boolean {
  return isAdmin;
}

export function canModifySensitiveData(isAdmin: boolean): boolean {
  return isAdmin;
}

export function sanitizeContact(contact: PEContact, isAdmin: boolean): PEContact {
  if (canAccessSensitiveData(isAdmin)) return contact;
  return {
    ...contact,
    email: contact.email ? '[RESTRICTED]' : null,
    phone: contact.phone ? '[RESTRICTED]' : null,
    alternatePhone: contact.alternatePhone ? '[RESTRICTED]' : null,
  };
}

export function sanitizeContacts(contacts: PEContact[], isAdmin: boolean): PEContact[] {
  return contacts.map(contact => sanitizeContact(contact, isAdmin));
}

export function sanitizeBroker(broker: PEBroker | null, isAdmin: boolean): PEBroker | null {
  if (!broker) return null;
  if (canAccessSensitiveData(isAdmin)) return broker;
  return {
    ...broker,
    brokerEmail: broker.brokerEmail ? '[RESTRICTED]' : null,
    brokerPhone: broker.brokerPhone ? '[RESTRICTED]' : null,
  };
}
