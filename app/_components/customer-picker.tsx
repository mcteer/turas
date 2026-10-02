"use client";

export type CustomerChoice = { id: string; displayName: string; synthetic: boolean };

export function CustomerPicker({ customers, selected, onSelect, disabled, optional }: {
  customers: CustomerChoice[]; selected: string; onSelect: (id: string) => void; disabled?: boolean; optional?: boolean;
}) {
  return <div><label className="field-label" htmlFor="chat-customer">{optional ? "Customer (optional)" : "Customer"}</label>
    <select className="field" id="chat-customer" value={selected} disabled={disabled}
      onChange={(event) => onSelect(event.target.value)}>
      <option value="">{optional ? "No customer" : "Choose a customer"}</option>
      {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.displayName}</option>)}
    </select></div>;
}
