"use client";

export type CustomerChoice = { id: string; displayName: string; synthetic: boolean };

export function CustomerPicker({ customers, selected, onSelect, disabled, optional }: {
  customers: CustomerChoice[]; selected: string; onSelect: (id: string) => void; disabled?: boolean; optional?: boolean;
}) {
  return <div className={optional ? "customer-selector" : undefined}><label className={optional ? "customer-selector-label" : "field-label"} htmlFor="chat-customer">{optional ? "Customer (optional)" : "Customer"}</label>
    {optional && <svg className="customer-selector-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /></svg>}
    <select className="field" id="chat-customer" value={selected} disabled={disabled}
      onChange={(event) => onSelect(event.target.value)}>
      <option value="">{optional ? "Customer (optional)" : "Choose a customer"}</option>
      {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.displayName}</option>)}
    </select>
    {optional && <svg className="customer-selector-chevron" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>}
  </div>;
}
