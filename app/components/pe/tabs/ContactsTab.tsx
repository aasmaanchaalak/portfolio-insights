'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  PEContact,
  PEBroker,
  ContactType,
  CreatePEContactRequest,
} from '../../../../types/pe';

interface ContactsTabProps {
  companyId: string;
}

const CONTACT_TYPES: { value: ContactType; label: string }[] = [
  { value: 'company_poc', label: 'Company POC' },
  { value: 'board_member', label: 'Board Member' },
  { value: 'advisor', label: 'Advisor' },
  { value: 'other', label: 'Other' },
];

export function ContactsTab({ companyId }: ContactsTabProps) {
  const [contacts, setContacts] = useState<PEContact[]>([]);
  const [broker, setBroker] = useState<PEBroker | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddContact, setShowAddContact] = useState(false);
  const [showEditBroker, setShowEditBroker] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [newContact, setNewContact] = useState<CreatePEContactRequest>({
    contactType: 'company_poc',
    name: '',
    designation: '',
    email: '',
    phone: '',
    notes: '',
    isPrimary: false,
  });
  const [brokerForm, setBrokerForm] = useState({
    brokerName: '',
    brokerFirm: '',
    brokerEmail: '',
    brokerPhone: '',
    notes: '',
  });

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [contactsRes, brokerRes] = await Promise.all([
        fetch(`/api/pe/${companyId}/contacts`),
        fetch(`/api/pe/${companyId}/broker`),
      ]);

      if (contactsRes.ok) {
        const data = await contactsRes.json();
        setContacts(data.contacts || []);
      }

      if (brokerRes.ok) {
        const data = await brokerRes.json();
        setBroker(data.broker);
      }
    } catch (err) {
      console.error('Error fetching contacts:', err);
    } finally {
      setIsLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContact.name) return;

    setIsSaving(true);
    try {
      const response = await fetch(`/api/pe/${companyId}/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newContact),
      });

      if (response.status === 403) {
        alert('Access denied. Admin privileges required.');
        return;
      }

      if (!response.ok) throw new Error('Failed to add contact');

      await fetchData();
      setShowAddContact(false);
      setNewContact({
        contactType: 'company_poc',
        name: '',
        designation: '',
        email: '',
        phone: '',
        notes: '',
        isPrimary: false,
      });
    } catch (err) {
      console.error('Error adding contact:', err);
      alert('Failed to add contact');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteContact = async (contactId: string) => {
    if (!confirm('Are you sure you want to delete this contact?')) return;

    try {
      const response = await fetch(`/api/pe/${companyId}/contacts?contactId=${contactId}`, {
        method: 'DELETE',
      });

      if (response.status === 403) {
        alert('Access denied. Admin privileges required.');
        return;
      }

      if (!response.ok) throw new Error('Failed to delete contact');

      setContacts(prev => prev.filter(c => c.id !== contactId));
    } catch (err) {
      console.error('Error deleting contact:', err);
      alert('Failed to delete contact');
    }
  };

  const handleEditBroker = () => {
    setBrokerForm({
      brokerName: broker?.brokerName || '',
      brokerFirm: broker?.brokerFirm || '',
      brokerEmail: broker?.brokerEmail || '',
      brokerPhone: broker?.brokerPhone || '',
      notes: broker?.notes || '',
    });
    setShowEditBroker(true);
  };

  const handleSaveBroker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!brokerForm.brokerName) return;

    setIsSaving(true);
    try {
      const response = await fetch(`/api/pe/${companyId}/broker`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(brokerForm),
      });

      if (response.status === 403) {
        alert('Access denied. Admin privileges required.');
        return;
      }

      if (!response.ok) throw new Error('Failed to save broker');

      const data = await response.json();
      setBroker(data.broker);
      setShowEditBroker(false);
    } catch (err) {
      console.error('Error saving broker:', err);
      alert('Failed to save broker');
    } finally {
      setIsSaving(false);
    }
  };

  const isRestricted = (value: string | null) => value === '[RESTRICTED]';

  if (isLoading) {
    return <div className="pe-contacts-loading">Loading contacts...</div>;
  }

  return (
    <div className="pe-contacts-tab">
      {/* Contacts Section */}
      <div className="pe-section">
        <div className="pe-section-header">
          <h3>Company Contacts</h3>
          <button
            className="pe-add-btn-small"
            onClick={() => setShowAddContact(true)}
            type="button"
          >
            + Add Contact
          </button>
        </div>

        {contacts.length === 0 ? (
          <p className="pe-muted">No contacts recorded</p>
        ) : (
          <div className="pe-contacts-list">
            {contacts.map(contact => (
              <div key={contact.id} className="pe-contact-card">
                <div className="pe-contact-header">
                  <div className="pe-contact-info">
                    <span className="pe-contact-name">
                      {contact.name}
                      {contact.isPrimary && <span className="pe-primary-badge">Primary</span>}
                    </span>
                    {contact.designation && (
                      <span className="pe-contact-designation">{contact.designation}</span>
                    )}
                  </div>
                  <span className="pe-contact-type">
                    {CONTACT_TYPES.find(t => t.value === contact.contactType)?.label || contact.contactType}
                  </span>
                </div>
                <div className="pe-contact-details">
                  {contact.email && (
                    <div className={`pe-contact-detail ${isRestricted(contact.email) ? 'restricted' : ''}`}>
                      <span className="pe-detail-icon">📧</span>
                      {contact.email}
                    </div>
                  )}
                  {contact.phone && (
                    <div className={`pe-contact-detail ${isRestricted(contact.phone) ? 'restricted' : ''}`}>
                      <span className="pe-detail-icon">📞</span>
                      {contact.phone}
                    </div>
                  )}
                  {contact.notes && (
                    <div className="pe-contact-notes">{contact.notes}</div>
                  )}
                </div>
                <button
                  className="pe-delete-contact-btn"
                  onClick={() => handleDeleteContact(contact.id)}
                  type="button"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Broker Section */}
      <div className="pe-section">
        <div className="pe-section-header">
          <h3>Broker Information</h3>
          <button className="pe-edit-btn" onClick={handleEditBroker} type="button">
            {broker ? 'Edit' : 'Add'}
          </button>
        </div>

        {broker ? (
          <div className="pe-broker-card">
            <div className="pe-broker-name">{broker.brokerName}</div>
            {broker.brokerFirm && (
              <div className="pe-broker-firm">{broker.brokerFirm}</div>
            )}
            <div className="pe-broker-details">
              {broker.brokerEmail && (
                <div className={`pe-contact-detail ${isRestricted(broker.brokerEmail) ? 'restricted' : ''}`}>
                  <span className="pe-detail-icon">📧</span>
                  {broker.brokerEmail}
                </div>
              )}
              {broker.brokerPhone && (
                <div className={`pe-contact-detail ${isRestricted(broker.brokerPhone) ? 'restricted' : ''}`}>
                  <span className="pe-detail-icon">📞</span>
                  {broker.brokerPhone}
                </div>
              )}
            </div>
            {broker.notes && <div className="pe-broker-notes">{broker.notes}</div>}
          </div>
        ) : (
          <p className="pe-muted">No broker information recorded</p>
        )}
      </div>

      {/* Add Contact Modal */}
      {showAddContact && (
        <>
          <div className="pe-modal-backdrop" onClick={() => setShowAddContact(false)} />
          <div className="pe-modal">
            <div className="pe-modal-header">
              <h2>Add Contact</h2>
              <button
                className="pe-modal-close"
                onClick={() => setShowAddContact(false)}
                type="button"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleAddContact}>
              <div className="pe-form-group">
                <label>Contact Type</label>
                <select
                  value={newContact.contactType}
                  onChange={e => setNewContact(prev => ({ ...prev, contactType: e.target.value as ContactType }))}
                >
                  {CONTACT_TYPES.map(type => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="pe-form-group">
                <label>Name *</label>
                <input
                  type="text"
                  value={newContact.name}
                  onChange={e => setNewContact(prev => ({ ...prev, name: e.target.value }))}
                  required
                />
              </div>
              <div className="pe-form-group">
                <label>Designation</label>
                <input
                  type="text"
                  value={newContact.designation || ''}
                  onChange={e => setNewContact(prev => ({ ...prev, designation: e.target.value }))}
                />
              </div>
              <div className="pe-form-group">
                <label>Email</label>
                <input
                  type="email"
                  value={newContact.email || ''}
                  onChange={e => setNewContact(prev => ({ ...prev, email: e.target.value }))}
                />
              </div>
              <div className="pe-form-group">
                <label>Phone</label>
                <input
                  type="tel"
                  value={newContact.phone || ''}
                  onChange={e => setNewContact(prev => ({ ...prev, phone: e.target.value }))}
                />
              </div>
              <div className="pe-form-group">
                <label>Notes</label>
                <textarea
                  value={newContact.notes || ''}
                  onChange={e => setNewContact(prev => ({ ...prev, notes: e.target.value }))}
                  rows={2}
                />
              </div>
              <div className="pe-checkbox-group">
                <input
                  type="checkbox"
                  id="isPrimary"
                  checked={newContact.isPrimary || false}
                  onChange={e => setNewContact(prev => ({ ...prev, isPrimary: e.target.checked }))}
                />
                <label htmlFor="isPrimary">Primary Contact</label>
              </div>
              <div className="pe-modal-actions">
                <button type="button" className="pe-btn-secondary" onClick={() => setShowAddContact(false)}>
                  Cancel
                </button>
                <button type="submit" className="pe-btn-primary" disabled={isSaving || !newContact.name}>
                  {isSaving ? 'Adding...' : 'Add Contact'}
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* Edit Broker Modal */}
      {showEditBroker && (
        <>
          <div className="pe-modal-backdrop" onClick={() => setShowEditBroker(false)} />
          <div className="pe-modal">
            <div className="pe-modal-header">
              <h2>{broker ? 'Edit' : 'Add'} Broker</h2>
              <button
                className="pe-modal-close"
                onClick={() => setShowEditBroker(false)}
                type="button"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleSaveBroker}>
              <div className="pe-form-group">
                <label>Broker Name *</label>
                <input
                  type="text"
                  value={brokerForm.brokerName}
                  onChange={e => setBrokerForm(prev => ({ ...prev, brokerName: e.target.value }))}
                  required
                />
              </div>
              <div className="pe-form-group">
                <label>Firm</label>
                <input
                  type="text"
                  value={brokerForm.brokerFirm}
                  onChange={e => setBrokerForm(prev => ({ ...prev, brokerFirm: e.target.value }))}
                />
              </div>
              <div className="pe-form-group">
                <label>Email</label>
                <input
                  type="email"
                  value={brokerForm.brokerEmail}
                  onChange={e => setBrokerForm(prev => ({ ...prev, brokerEmail: e.target.value }))}
                />
              </div>
              <div className="pe-form-group">
                <label>Phone</label>
                <input
                  type="tel"
                  value={brokerForm.brokerPhone}
                  onChange={e => setBrokerForm(prev => ({ ...prev, brokerPhone: e.target.value }))}
                />
              </div>
              <div className="pe-form-group">
                <label>Notes</label>
                <textarea
                  value={brokerForm.notes}
                  onChange={e => setBrokerForm(prev => ({ ...prev, notes: e.target.value }))}
                  rows={2}
                />
              </div>
              <div className="pe-modal-actions">
                <button type="button" className="pe-btn-secondary" onClick={() => setShowEditBroker(false)}>
                  Cancel
                </button>
                <button type="submit" className="pe-btn-primary" disabled={isSaving || !brokerForm.brokerName}>
                  {isSaving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
