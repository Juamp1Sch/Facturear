import nodemailer from "nodemailer";

function getRegistrationNotifyEmail(): string {
  return (
    process.env.REGISTRATION_NOTIFY_EMAIL?.trim() ||
    "info@agilescan.com.ar"
  );
}

export function isSmtpConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST?.trim() &&
      process.env.SMTP_USER?.trim() &&
      process.env.SMTP_PASSWORD?.trim(),
  );
}

function createTransporter() {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASSWORD?.trim();
  if (!host || !user || !pass) {
    throw new Error("SMTP no configurado (SMTP_HOST, SMTP_USER, SMTP_PASSWORD).");
  }

  const port = Number(process.env.SMTP_PORT ?? "587");
  const secure =
    process.env.SMTP_SECURE === "true" || String(port) === "465";

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
}

export async function sendRegistrationApprovalEmail(params: {
  userName: string;
  userEmail: string;
  token: string;
  expiresAt: Date;
}): Promise<void> {
  const transporter = createTransporter();
  const to = getRegistrationNotifyEmail();
  const from =
    process.env.SMTP_FROM?.trim() ||
    "AgileScan <info@agilescan.com.ar>";

  const expiresLabel = params.expiresAt.toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    dateStyle: "short",
    timeStyle: "short",
  });

  const text = [
    "Nueva solicitud de registro en AgileScan",
    "",
    "Datos del usuario:",
    `  Nombre: ${params.userName}`,
    `  Email:  ${params.userEmail}`,
    "",
    `Token de autorización (un solo uso, vence en 12 h): ${params.token}`,
    `Vence: ${expiresLabel} (hora Argentina)`,
    "",
    "Compartí este token con el solicitante si aprobás el alta.",
  ].join("\n");

  const html = `
    <p>Nueva solicitud de registro en <strong>AgileScan</strong>.</p>
    <p><strong>Datos del usuario:</strong></p>
    <ul>
      <li><strong>Nombre:</strong> ${escapeHtml(params.userName)}</li>
      <li><strong>Email:</strong> ${escapeHtml(params.userEmail)}</li>
    </ul>
    <p><strong>Token de autorización</strong> (un solo uso, vence en 12 h):</p>
    <p style="font-family:monospace;font-size:1.25rem;letter-spacing:0.05em">${escapeHtml(params.token)}</p>
    <p>Vence: ${escapeHtml(expiresLabel)} (hora Argentina)</p>
    <p>Compartí este token con el solicitante si aprobás el alta.</p>
  `;

  await transporter.sendMail({
    from,
    to,
    subject: "Token de autorización",
    text,
    html,
  });
}

export async function sendPasswordResetApprovalEmail(params: {
  userName: string;
  userEmail: string;
  token: string;
  expiresAt: Date;
}): Promise<void> {
  const transporter = createTransporter();
  const to = getRegistrationNotifyEmail();
  const from =
    process.env.SMTP_FROM?.trim() ||
    "AgileScan <info@agilescan.com.ar>";

  const expiresLabel = params.expiresAt.toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    dateStyle: "short",
    timeStyle: "short",
  });

  const text = [
    "Solicitud de restablecimiento de contraseña en AgileScan",
    "",
    "Datos del usuario:",
    `  Nombre: ${params.userName}`,
    `  Email:  ${params.userEmail}`,
    "",
    `Código de restablecimiento (un solo uso, vence en 12 h): ${params.token}`,
    `Vence: ${expiresLabel} (hora Argentina)`,
    "",
    "Compartí este código con el solicitante si aprobás el cambio de contraseña.",
  ].join("\n");

  const html = `
    <p>Solicitud de restablecimiento de contraseña en <strong>AgileScan</strong>.</p>
    <p><strong>Datos del usuario:</strong></p>
    <ul>
      <li><strong>Nombre:</strong> ${escapeHtml(params.userName)}</li>
      <li><strong>Email:</strong> ${escapeHtml(params.userEmail)}</li>
    </ul>
    <p><strong>Código de restablecimiento</strong> (un solo uso, vence en 12 h):</p>
    <p style="font-family:monospace;font-size:1.25rem;letter-spacing:0.05em">${escapeHtml(params.token)}</p>
    <p>Vence: ${escapeHtml(expiresLabel)} (hora Argentina)</p>
    <p>Compartí este código con el solicitante si aprobás el cambio de contraseña.</p>
  `;

  await transporter.sendMail({
    from,
    to,
    subject: "Código para restablecer contraseña",
    text,
    html,
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
