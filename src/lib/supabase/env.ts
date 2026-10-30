function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Mangler miljøvariablen ${name}. Se .env.example.`);
  return value;
}

export const supabaseUrl = () =>
  required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);

export const supabasePublishableKey = () =>
  required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
