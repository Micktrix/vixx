// Svaret fra en serverhandling til en formular. En midlertidig kode vises kun denne ene gang.
export type ActionState =
  | { error: string }
  | { message: string; tempPassword?: string; href?: string; hrefLabel?: string }
  | undefined;

export type FormAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;
