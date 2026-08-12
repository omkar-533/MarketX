/** Public desk contact — used when payment gateway is not live. */
export const DESK_CONTACT_PHONE = '9580462435';
export const DESK_WHATSAPP_E164 = `91${DESK_CONTACT_PHONE}`;

export function deskTelHref(): string {
  return `tel:+91${DESK_CONTACT_PHONE}`;
}

export function deskWhatsAppUrl(message?: string): string {
  const base = `https://wa.me/${DESK_WHATSAPP_E164}`;
  if (!message?.trim()) return base;
  return `${base}?text=${encodeURIComponent(message.trim())}`;
}

export function deskPhoneDisplay(): string {
  return `+91 ${DESK_CONTACT_PHONE.slice(0, 5)} ${DESK_CONTACT_PHONE.slice(5)}`;
}
