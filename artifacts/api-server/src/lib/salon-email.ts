import type { Logger } from "pino";

export type SalonEmail = {
  to: string;
  subject: string;
  html: string;
  template: "booking-confirmation" | "appointment-reminder" | "promotion";
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character] ?? character;
  });
}

export function bookingConfirmationEmail(input: {
  to: string;
  clientName: string;
  serviceName: string;
  stylistName: string;
  startAt: Date;
}): SalonEmail {
  const date = new Intl.DateTimeFormat("en", {
    timeZone: "Africa/Kigali",
    dateStyle: "full",
    timeStyle: "short",
  }).format(input.startAt);
  return {
    to: input.to,
    subject: `Your Mallinabella appointment is confirmed`,
    template: "booking-confirmation",
    html: `<p>Dear ${escapeHtml(input.clientName)},</p><p>Your ${escapeHtml(input.serviceName)} appointment with ${escapeHtml(input.stylistName)} is confirmed for ${escapeHtml(date)}.</p><p>We look forward to welcoming you.</p>`,
  };
}

export function appointmentReminderEmail(input: {
  to: string;
  clientName: string;
  serviceName: string;
  startAt: Date;
}): SalonEmail {
  const date = new Intl.DateTimeFormat("en", {
    timeZone: "Africa/Kigali",
    dateStyle: "full",
    timeStyle: "short",
  }).format(input.startAt);
  return {
    to: input.to,
    subject: `A reminder about your Mallinabella appointment`,
    template: "appointment-reminder",
    html: `<p>Dear ${escapeHtml(input.clientName)},</p><p>This is a friendly reminder of your ${escapeHtml(input.serviceName)} appointment tomorrow, ${escapeHtml(date)}.</p>`,
  };
}

export function promotionEmail(input: {
  to: string;
  subject: string;
  body: string;
}): SalonEmail {
  const paragraphs = input.body
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
  return {
    to: input.to,
    subject: input.subject,
    template: "promotion",
    html: `<main><h1>${escapeHtml(input.subject)}</h1>${paragraphs}<p>Thank you for being part of the Mallinabella community.</p><small>You are receiving this message because you opted in to salon updates.</small></main>`,
  };
}

export function dispatchMockEmail(logger: Logger, message: SalonEmail): void {
  logger.info(
    { template: message.template },
    "Email template rendered; no email delivery provider is configured",
  );
}
