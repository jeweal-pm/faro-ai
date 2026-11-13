'use client';

import { useEffect, useRef, useState } from 'react';
import { CalendarHeart, LoaderCircle, Mail, MapPin, Phone } from 'lucide-react';
import { requestCustomerBirthdayLookup, type CustomerBirthdayLookup } from './actions';

function formatBirthday(value: CustomerBirthdayLookup['customers'][number]['date_of_birth'], thai: boolean) {
  if (!value) return 'Not recorded';
  const month = value.month ? new Intl.DateTimeFormat(thai ? 'th-TH' : 'en', { month: 'long' }).format(new Date(Date.UTC(2000, value.month - 1, 1))) : null;
  const parts = [value.day, month, value.year].filter((part) => part !== undefined && part !== null);
  return parts.length ? parts.join(' ') : 'Not recorded';
}

function formatAddress(value: CustomerBirthdayLookup['customers'][number]['address']) {
  if (!value) return 'Not recorded';
  return [value.address, value.city, value.state, value.zipcode, value.country].filter(Boolean).join(', ') || 'Not recorded';
}

function failureMessage(error: string | undefined, message: string | undefined, thai: boolean) {
  if (thai) {
    const translated: Record<string, string> = {
      customer_birthday_intent_required: 'ระบุคำถามเกี่ยวกับวันเกิดหรืออายุของลูกค้า',
      customer_birthday_filter_required: 'ระบุชื่อลูกค้า เดือน วันเกิด หรือปีเกิดที่ต้องการค้นหา',
      customer_birthday_filter_not_supported: 'ตอนนี้ยังกรองตามกลุ่ม VIP สาขา/สถานที่ พนักงานขาย ช่วงอายุ หรือค้นหาเฉพาะจำนวนไม่ได้',
      birthday_date_ambiguous: 'กรุณาใช้ชื่อเดือน เช่น 12 มิถุนายน เพราะรูปแบบวันที่ตัวเลขอาจตีความได้หลายแบบ',
      birthday_date_invalid: 'วันที่นี้ไม่มีอยู่ในเดือนที่ระบุ',
      birthday_range_not_supported_yet: 'ตอนนี้ค้นหาได้ตามชื่อลูกค้า วัน/เดือนที่ระบุ วันนี้ เดือนนี้/เดือนหน้า หรือปีเกิดที่ระบุ',
      customer_search_tool_not_approved: 'กรุณาให้ผู้ดูแลเปิดสิทธิ์เครื่องมืออ่านข้อมูล search_customers ใน GIS MCP ของ tenant นี้ก่อน',
      gis_connection_unavailable: 'ยังเชื่อมต่อ GIS MCP ของ tenant นี้ไม่ได้ กรุณาให้ผู้ดูแลตรวจการเชื่อมต่อ',
      mcp_unavailable: 'ขณะนี้ติดต่อ GIS MCP ไม่ได้ กรุณาลองใหม่ภายหลัง',
    };
    return translated[error ?? ''] ?? message ?? 'FaroAI ค้นหาวันเกิดลูกค้าไม่สำเร็จ';
  }
  return message ?? 'FaroAI could not complete the customer birthday lookup.';
}

export default function CustomerBirthdayAssistant({ tenantId, prompt, onClose }: { tenantId: string; prompt: string; onClose: () => void }) {
  const started = useRef(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [result, setResult] = useState<CustomerBirthdayLookup | null>(null);
  const thai = /[\u0E00-\u0E7F]/.test(prompt);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let mounted = true;
    void requestCustomerBirthdayLookup(tenantId, prompt).then((response) => {
      if (!mounted) return;
      if (response.success && response.data) setResult(response.data);
      else setError(failureMessage(response.error, response.message, thai));
      setBusy(false);
    }).catch(() => {
      if (!mounted) return;
      setError(thai ? 'FaroAI ค้นหาวันเกิดลูกค้าไม่สำเร็จ กรุณาลองใหม่' : 'FaroAI could not complete the customer birthday lookup.');
      setBusy(false);
    });
    return () => { mounted = false; };
  }, [tenantId, prompt]);

  const labels = thai
    ? { title: 'วันเกิดลูกค้า', sub: 'ข้อมูลอ่านอย่างเดียวจาก GIS ของ tenant นี้', loading: 'กำลังค้นหาวันเกิดลูกค้า…', count: `แสดง ${result?.customers.length ?? 0} จาก ${result?.total ?? 0} รายการ`, none: 'ไม่พบรายการลูกค้าที่ตรงกับเงื่อนไขวันเกิด', customer: 'ลูกค้า', birthday: 'วันเกิด', age: 'อายุ', address: 'ที่อยู่', phone: 'โทรศัพท์', email: 'อีเมล', year: 'ปี', truncated: `แสดง ${result?.customers.length ?? 0} รายการแรก ลองระบุวันเกิดหรือชื่อลูกค้าให้เฉพาะเจาะจงขึ้น` }
    : { title: 'Customer birthdays', sub: 'Read-only results from this tenant’s GIS customer records.', loading: 'Searching customer birthdays…', count: `Showing ${result?.customers.length ?? 0} of ${result?.total ?? 0} matching customers`, none: 'No customer records matched this birthday request.', customer: 'Customer', birthday: 'Birthday', age: 'Age', address: 'Address', phone: 'Phone', email: 'Email', year: 'years', truncated: `Showing the first ${result?.customers.length ?? 0} matches. Narrow the date or customer name to see fewer results.` };

  return <section className="catalog-results birthday-results" aria-live="polite" aria-label={labels.title}>
    <div className="birthday-results-heading">
      <div><span className="birthday-eyebrow">GIS CUSTOMER LOOKUP</span><h2><CalendarHeart size={20} /> {labels.title}</h2>
        <p>{labels.sub}</p></div>
      <button className="birthday-close" type="button" onClick={onClose}>{thai ? 'ปิด' : 'Close'}</button>
    </div>
    {busy && <p className="birthday-loading" role="status"><LoaderCircle size={16} className="spin" /> {labels.loading}</p>}
    {!busy && error && <p className="birthday-error" role="alert">{error}</p>}
    {!busy && result && result.customers.length === 0 && <div className="birthday-empty"><CalendarHeart size={20} /><p>{labels.none}</p></div>}
    {!busy && result && result.customers.length > 0 && <>
      <div className="birthday-count">{labels.count}</div>
      <div className="birthday-table-wrap"><table className="birthday-table">
        <thead><tr><th>{labels.customer}</th><th>{labels.birthday}</th><th>{labels.age}</th><th>{labels.address}</th><th>{labels.phone}</th><th>{labels.email}</th></tr></thead>
        <tbody>{result.customers.map((customer, index) => <tr key={`${customer.name}-${index}`}>
          <td data-label={labels.customer}><strong>{customer.name || (thai ? 'ไม่พบชื่อ' : 'Name unavailable')}</strong></td>
          <td data-label={labels.birthday}>{formatBirthday(customer.date_of_birth, thai)}</td>
          <td data-label={labels.age}>{customer.age === null ? '—' : `${customer.age} ${labels.year}`}</td>
          <td data-label={labels.address}><span className="birthday-contact"><MapPin size={13} />{formatAddress(customer.address)}</span></td>
          <td data-label={labels.phone}>{customer.phone ? <a className="birthday-contact" href={`tel:${customer.phone.replace(/[^+\d]/g, '')}`}><Phone size={13} />{customer.phone}</a> : '—'}</td>
          <td data-label={labels.email}>{customer.email ? <a className="birthday-contact" href={`mailto:${customer.email}`}><Mail size={13} />{customer.email}</a> : '—'}</td>
        </tr>)}</tbody>
      </table></div>
      {result.has_more && <p className="birthday-truncated">{labels.truncated}</p>}
    </>}
  </section>;
}
