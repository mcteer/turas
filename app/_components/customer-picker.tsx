"use client";

import {useEffect,useId,useRef,useState} from 'react';

export type CustomerChoice = { id: string; displayName: string; synthetic: boolean };

export function CustomerPicker({ customers, selected, onSelect, disabled, optional }: {
  customers: CustomerChoice[]; selected: string; onSelect: (id: string) => void; disabled?: boolean; optional?: boolean;
}) {
  const id=useId(),root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),input=useRef<HTMLInputElement>(null);
  const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[active,setActive]=useState(0);
  const label='Customer';
  const value=customers.find(customer=>customer.id===selected)?.displayName;
  const choices=[{id:'',displayName:optional?'General question':'Choose a customer'},...customers]
    .filter(customer=>customer.displayName.toLocaleLowerCase('en-US').includes(query.trim().toLocaleLowerCase('en-US')));
  function close(restoreFocus=false){setOpen(false);setQuery('');if(restoreFocus)trigger.current?.focus();}
  function choose(index:number){const choice=choices[index];if(!choice)return;onSelect(choice.id);close(true);}
  useEffect(()=>{if(disabled)setOpen(false);},[disabled]);
  useEffect(()=>{
    if(!open)return;
    input.current?.focus();
    const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false);};
    document.addEventListener('pointerdown',outside);
    return ()=>document.removeEventListener('pointerdown',outside);
  },[open]);
  useEffect(()=>{if(open)document.getElementById(`${id}-option-${active}`)?.scrollIntoView({block:'nearest'});},[active,open,id]);
  return <div ref={root} className="customer-selector" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))setOpen(false);}}>
    <button ref={trigger} type="button" className="customer-selector-trigger" aria-label={label}
      aria-describedby={value?`${id}-value`:undefined} aria-haspopup="listbox" aria-expanded={open} aria-controls={open?`${id}-options`:undefined}
      disabled={disabled} onClick={()=>{if(open)close();else{setQuery('');setActive(Math.max(0,[{id:''},...customers].findIndex(customer=>customer.id===selected)));setOpen(true);}}}
      onKeyDown={event=>{if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();setQuery('');setActive(0);setOpen(true);}}}>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /></svg>
      <span id={`${id}-value`}>{value??'Customer'}</span>
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>
    </button>
    {open&&<div className="customer-picker-popover">
      <input ref={input} className="field customer-picker-search" aria-label="Search customers" placeholder="Search customers…"
        role="combobox" aria-expanded="true" aria-autocomplete="list" aria-controls={`${id}-options`}
        aria-activedescendant={choices[active]?`${id}-option-${active}`:undefined} value={query}
        onChange={event=>{setQuery(event.target.value);setActive(0);}}
        onKeyDown={event=>{
          if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);}
          else if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();setActive(current=>choices.length?(current+(event.key==='ArrowDown'?1:-1)+choices.length)%choices.length:0);}
          else if(event.key==='Enter'){event.preventDefault();choose(active);}
        }}/>
      <div id={`${id}-options`} role="listbox" aria-label="Customers" className="customer-picker-options">
        {choices.map((customer,index)=><button type="button" role="option" id={`${id}-option-${index}`} key={customer.id}
          aria-selected={customer.id===selected} tabIndex={-1} className={`customer-picker-option ${index===active?'is-active':''}`}
          onMouseDown={event=>event.preventDefault()} onMouseMove={()=>setActive(index)} onClick={()=>choose(index)}>
          <span>{customer.displayName}</span><span aria-hidden="true">{customer.id===selected?'✓':''}</span>
        </button>)}
      </div>
      {!choices.length&&<p className="customer-picker-empty" role="status">No customers found.</p>}
    </div>}
  </div>;
}
