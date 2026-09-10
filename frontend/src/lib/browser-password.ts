/** Ask Chrome / Google Password Manager to save a sign-in after a successful SPA login. */
export async function offerBrowserPasswordSave(email: string, password: string) {
  if (typeof window === "undefined" || !email || !password) return;
  const Ctor = (
    window as unknown as {
      PasswordCredential?: new (data: {
        id: string;
        password: string;
        name?: string;
      }) => Credential;
    }
  ).PasswordCredential;
  if (!Ctor || !navigator.credentials?.store) return;
  try {
    await navigator.credentials.store(new Ctor({ id: email, password, name: email }));
  } catch {
    /* Browser declined or blocked the prompt. */
  }
}
