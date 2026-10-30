// Login-metoden samlet ét sted. Telefonnummeret er identiteten.
//
// I dag: telefon + kode. Supabase kræver en SMS-udbyder for rigtig telefon-login, så vi logger ind
// med en intern adresse, der er afledt af nummeret. Brugeren ser den aldrig, og der sendes aldrig
// mails til den. Nummeret gemmes også på auth-brugeren.
//
// Senere: SMS-engangskode. Så skiftes kun denne fil og login-formularen; brugere og data er de samme.

const LOGIN_EMAIL_DOMAIN = "login.vixx.dk";

export function loginEmailForPhone(e164: string): string {
  return `${e164.slice(1)}@${LOGIN_EMAIL_DOMAIN}`;
}

// Felter til Supabase Auth, når en ny bruger oprettes.
export function authFieldsForPhone(e164: string) {
  return {
    email: loginEmailForPhone(e164),
    email_confirm: true,
    phone: e164.slice(1),
    phone_confirm: true,
  };
}

export const MIN_PASSWORD_LENGTH = 8;
